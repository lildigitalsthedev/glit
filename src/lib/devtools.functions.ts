import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isDeveloper } from "@/lib/permissions";

/**
 * Shared guard for every Developer Dashboard server function. Re-checks the
 * caller's role from `user_roles` on every call — never trusts anything the
 * client sends — so a non-Developer, non-Owner account gets a clean
 * rejection even if they somehow reach one of these endpoints directly.
 */
async function requireDeveloper(userId: string) {
  const { getRole } = await import("./roles.server");
  const caller = await getRole(userId);
  if (!caller || !isDeveloper(caller.role)) {
    throw new Error("Forbidden: Developer access required.");
  }
}

export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context.userId);
    const { listFeatureFlags: list } = await import("./devtools.server");
    return list();
  });

export const setFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { key: string; enabled: boolean }) => data)
  .handler(async ({ data, context }) => {
    await requireDeveloper(context.userId);
    const { setFeatureFlag: set } = await import("./devtools.server");
    return set(context.userId, data.key, data.enabled);
  });

export const getSystemInfo = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context.userId);
    const { getSystemInfo: info } = await import("./devtools.server");
    return info();
  });

export const getPerformanceMetrics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context.userId);
    const { getPerformanceMetrics: metrics } = await import("./devtools.server");
    return metrics();
  });

/** GitHub connectivity/rate-limit diagnostics for the caller's OWN connected accounts only. */
export const getGithubDiagnostics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context.userId);
    const { getGithubDiagnostics: diagnostics } = await import("./devtools.server");
    return diagnostics(context.supabase);
  });

export const clearDevCache = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireDeveloper(context.userId);
    const { clearDevCache: clear } = await import("./devtools.server");
    return clear();
  });

export interface RepoIndexRefreshResult {
  accountId: string;
  login: string;
  ok: boolean;
  error: string | null;
}

/** "Refresh repository indexes" — re-syncs every GitHub account the caller has connected. */
export const refreshRepositoryIndexes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RepoIndexRefreshResult[]> => {
    await requireDeveloper(context.userId);
    const { data, error } = await context.supabase.from("github_accounts").select("id, login");
    if (error) throw new Error(error.message);

    const { refreshConnection } = await import("./github/connections.server");
    const results: RepoIndexRefreshResult[] = [];
    for (const row of data ?? []) {
      const accountId = row.id as string;
      const login = row.login as string;
      try {
        await refreshConnection(context.supabase, accountId);
        results.push({ accountId, login, ok: true, error: null });
      } catch (err) {
        results.push({ accountId, login, ok: false, error: err instanceof Error ? err.message : "Unknown error." });
      }
    }
    return results;
  });
