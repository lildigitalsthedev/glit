// Server-only. Backs the Developer Dashboard. Follows the same pattern as
// roles.server.ts — never import this from anything that ships to the
// browser; reach it via a dynamic `await import("./devtools.server")`
// inside a *.functions.ts handler.
//
// Everything here is scoped to either (a) app-wide, non-personal data
// (feature flags, aggregate counters, process/runtime info) or (b) the
// calling Developer/Owner's OWN connected GitHub accounts. Per the role
// spec, Developers must not see sensitive personal information beyond
// what's needed for debugging — so this deliberately never reads other
// users' emails, tokens, commit messages, or push history.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface FeatureFlagDto {
  key: string;
  label: string;
  description: string | null;
  enabled: boolean;
  updatedAt: string;
}

export async function listFeatureFlags(): Promise<FeatureFlagDto[]> {
  const { data, error } = await supabaseAdmin
    .from("feature_flags")
    .select("key, label, description, enabled, updated_at")
    .order("key", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    key: row.key as string,
    label: row.label as string,
    description: row.description as string | null,
    enabled: row.enabled as boolean,
    updatedAt: row.updated_at as string,
  }));
}

export async function setFeatureFlag(callerId: string, key: string, enabled: boolean): Promise<FeatureFlagDto> {
  const { data, error } = await supabaseAdmin
    .from("feature_flags")
    .update({ enabled, updated_by: callerId })
    .eq("key", key)
    .select("key, label, description, enabled, updated_at")
    .single();
  if (error) throw new Error(error.message);
  return {
    key: data.key as string,
    label: data.label as string,
    description: data.description as string | null,
    enabled: data.enabled as boolean,
    updatedAt: data.updated_at as string,
  };
}

export interface SystemInfo {
  environment: string;
  nodeVersion: string;
  uptimeSeconds: number;
  memoryUsedMb: number;
  memoryTotalMb: number;
  commitSha: string | null;
  serverTime: string;
}

const COMMIT_SHA_ENV_VARS = [
  "CF_PAGES_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_SHA",
  "RENDER_GIT_COMMIT",
  "GIT_COMMIT_SHA",
  "SOURCE_VERSION",
];

/** Real process/runtime info — never fabricated. If a field isn't available in this environment it comes back null. */
export function getSystemInfo(): SystemInfo {
  const mem = process.memoryUsage();
  const commitSha = COMMIT_SHA_ENV_VARS.map((name) => process.env[name]).find((value) => !!value) ?? null;
  return {
    environment: process.env["NODE_ENV"] ?? "unknown",
    nodeVersion: process.version,
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
    memoryTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
    commitSha: commitSha ? commitSha.slice(0, 12) : null,
    serverTime: new Date().toISOString(),
  };
}

export interface PerformanceMetrics {
  pushesLast24h: number;
  pushSuccessLast24h: number;
  pushFailuresLast24h: number;
  activeAccountsLast24h: number;
}

/**
 * Aggregate, count-only performance numbers — no user identifiers, emails,
 * commit messages, or repo names ever leave this function. This is what
 * "analytics related to application performance (not revenue)" means in
 * practice for the Developer role.
 */
export async function getPerformanceMetrics(): Promise<PerformanceMetrics> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { count: total, error: totalError } = await supabaseAdmin
    .from("recent_pushes")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since);
  if (totalError) throw new Error(totalError.message);

  const { count: success, error: successError } = await supabaseAdmin
    .from("recent_pushes")
    .select("id", { count: "exact", head: true })
    .gte("created_at", since)
    .eq("status", "success");
  if (successError) throw new Error(successError.message);

  const { count: activeAccounts, error: accountsError } = await supabaseAdmin
    .from("github_accounts")
    .select("id", { count: "exact", head: true })
    .gte("last_sync", since);
  if (accountsError) throw new Error(accountsError.message);

  const totalCount = total ?? 0;
  const successCount = success ?? 0;
  return {
    pushesLast24h: totalCount,
    pushSuccessLast24h: successCount,
    pushFailuresLast24h: Math.max(totalCount - successCount, 0),
    activeAccountsLast24h: activeAccounts ?? 0,
  };
}

export interface GithubDiagnosticAccount {
  login: string;
  status: string;
  lastSync: string | null;
  rateLimit: { limit: number; remaining: number; resetAt: string } | null;
  rateLimitError: string | null;
}

// Tiny in-memory cache so repeatedly opening the Developer Dashboard
// doesn't hammer GitHub's rate-limit endpoint with every render. This is
// exactly the kind of thing "Clear application cache" clears.
const rateLimitCache = new Map<string, { fetchedAt: number; account: GithubDiagnosticAccount }>();
const RATE_LIMIT_CACHE_TTL_MS = 30_000;

/**
 * GitHub connectivity + rate-limit diagnostics for the CALLER's own
 * connected accounts only. `supabase` must be the request-scoped,
 * RLS-enforcing client so this can never see another user's accounts or
 * tokens.
 */
export async function getGithubDiagnostics(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: import("@supabase/supabase-js").SupabaseClient<any, any, any>,
): Promise<GithubDiagnosticAccount[]> {
  const { data, error } = await supabase
    .from("github_accounts")
    .select("id, login, status, last_sync")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const { loadAccountToken } = await import("./github/tokens.server");
  const { ghFetch } = await import("./github/api.server");

  const results: GithubDiagnosticAccount[] = [];
  for (const row of data ?? []) {
    const id = row.id as string;
    const cached = rateLimitCache.get(id);
    if (cached && Date.now() - cached.fetchedAt < RATE_LIMIT_CACHE_TTL_MS) {
      results.push(cached.account);
      continue;
    }

    const base = { login: row.login as string, status: row.status as string, lastSync: row.last_sync as string | null };
    try {
      const { token } = await loadAccountToken(supabase, id);
      const rateLimit = await ghFetch<{ rate: { limit: number; remaining: number; reset: number } }>(
        token,
        "/rate_limit",
      );
      const account: GithubDiagnosticAccount = {
        ...base,
        rateLimit: {
          limit: rateLimit.rate.limit,
          remaining: rateLimit.rate.remaining,
          resetAt: new Date(rateLimit.rate.reset * 1000).toISOString(),
        },
        rateLimitError: null,
      };
      rateLimitCache.set(id, { fetchedAt: Date.now(), account });
      results.push(account);
    } catch (err) {
      results.push({ ...base, rateLimit: null, rateLimitError: err instanceof Error ? err.message : "Unknown error." });
    }
  }
  return results;
}

/** Clears the in-memory GitHub rate-limit cache. */
export function clearDevCache(): { cleared: number } {
  const cleared = rateLimitCache.size;
  rateLimitCache.clear();
  return { cleared };
}
