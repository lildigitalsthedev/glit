// Server-only. Uses the service-role Supabase client (bypasses RLS) — see
// the migration for why: workspace_ai_providers has RLS enabled with no
// client policies at all, so every read/write goes through here.
//
// This is the *team* counterpart to `@/lib/ai/store.server` (BYO-per-user
// keys). One key per provider is shared across the whole workspace: an
// Owner/Admin adds it once (`keys:manage`), and every Developer can use it
// for AI tools (`keys:use`) without ever seeing the plaintext — the caller
// only ever gets back a masked `keyHint` like `••••4f2a`. Viewers have
// neither capability, so they get nothing back at all.
//
// Every exported function here re-derives the caller's role from
// `workspace_members` itself (via `requireCapability`) rather than trusting
// a role the client claims to have, so a compromised or stale client can
// never grant itself team-key access it doesn't actually hold.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { decryptApiKey, encryptApiKey, keyHint } from "@/lib/ai/crypto.server";
import { providerMeta } from "@/lib/ai/catalog";
import type { ResolvedProvider } from "@/lib/ai/store.server";
import { requireCapability } from "./store.server";

export interface TeamProviderAuthor {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface TeamProviderRow {
  id: string;
  workspaceId: string;
  provider: string;
  label: string | null;
  keyHint: string;
  baseUrl: string | null;
  model: string | null;
  enabled: boolean;
  isDefault: boolean;
  createdBy: TeamProviderAuthor | null;
  updatedBy: TeamProviderAuthor | null;
  createdAt: string;
  updatedAt: string;
}

const SAFE_COLUMNS =
  "id, workspace_id, provider, label, key_hint, base_url, model, enabled, is_default, created_by, updated_by, created_at, updated_at";

async function loadAuthors(userIds: (string | null)[]): Promise<Map<string, TeamProviderAuthor>> {
  const ids = Array.from(new Set(userIds.filter((id): id is string => Boolean(id))));
  if (ids.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", ids);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((p) => [
      p.id as string,
      {
        userId: p.id as string,
        displayName: p.display_name as string | null,
        avatarUrl: p.avatar_url as string | null,
      },
    ]),
  );
}

function toDto(row: Record<string, unknown>, authors: Map<string, TeamProviderAuthor>): TeamProviderRow {
  const createdBy = row["created_by"] as string | null;
  const updatedBy = row["updated_by"] as string | null;
  return {
    id: row["id"] as string,
    workspaceId: row["workspace_id"] as string,
    provider: row["provider"] as string,
    label: (row["label"] as string | null) ?? null,
    keyHint: (row["key_hint"] as string | null) ?? "",
    baseUrl: (row["base_url"] as string | null) ?? null,
    model: (row["model"] as string | null) ?? null,
    enabled: row["enabled"] as boolean,
    isDefault: row["is_default"] as boolean,
    createdBy: createdBy ? (authors.get(createdBy) ?? null) : null,
    updatedBy: updatedBy ? (authors.get(updatedBy) ?? null) : null,
    createdAt: row["created_at"] as string,
    updatedAt: row["updated_at"] as string,
  };
}

/**
 * Lists the workspace's shared providers. Callable by anyone with
 * `keys:use` (Owner/Admin/Developer) — the caller's handler is expected to
 * have already checked that capability, same convention as
 * `workspaces/prompts.server.ts`.
 */
export async function listTeamProviders(workspaceId: string): Promise<TeamProviderRow[]> {
  const { data, error } = await supabaseAdmin
    .from("workspace_ai_providers")
    .select(SAFE_COLUMNS)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const authors = await loadAuthors(
    rows.flatMap((r) => [r["created_by"] as string | null, r["updated_by"] as string | null]),
  );
  return rows.map((row) => toDto(row as Record<string, unknown>, authors));
}

/**
 * Adds a new shared provider or updates the existing one for that provider
 * id (one row per provider per workspace, same as the personal store).
 * `apiKey` is only required — and only re-encrypted — when actually
 * rotating the key; omitting it lets a caller edit the label/model/base URL
 * or flip `enabled` without re-supplying the secret.
 *
 * Callers must run `requireCapability(..., "keys:manage")` before this —
 * enforced by the handler in `team-ai-providers.functions.ts`, not here.
 */
export async function upsertTeamProvider(
  workspaceId: string,
  callerId: string,
  input: {
    provider: string;
    apiKey?: string;
    label?: string | null;
    baseUrl?: string | null;
    model?: string | null;
    enabled?: boolean;
  },
): Promise<TeamProviderRow> {
  const meta = providerMeta(input.provider);
  if (!meta) throw new Error(`Unknown provider: ${input.provider}`);

  const { data: existing } = await supabaseAdmin
    .from("workspace_ai_providers")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("provider", input.provider)
    .maybeSingle();

  if (!existing && !input.apiKey) throw new Error("An API key is required to add a provider.");

  const patch: Record<string, unknown> = {
    workspace_id: workspaceId,
    provider: input.provider,
    updated_by: callerId,
  };
  if (input.apiKey) {
    patch["api_key_ciphertext"] = encryptApiKey(input.apiKey.trim());
    patch["key_hint"] = keyHint(input.apiKey.trim());
  }
  if (input.label !== undefined) patch["label"] = input.label;
  if (input.baseUrl !== undefined) patch["base_url"] = input.baseUrl || null;
  if (input.model !== undefined) patch["model"] = input.model || null;
  if (input.enabled !== undefined) patch["enabled"] = input.enabled;
  if (!existing) patch["created_by"] = callerId;

  const query = existing
    ? supabaseAdmin
        .from("workspace_ai_providers")
        .update(patch as never)
        .eq("id", existing["id"] as string)
        .eq("workspace_id", workspaceId)
    : supabaseAdmin.from("workspace_ai_providers").insert(patch as never);

  const { data, error } = await query.select(SAFE_COLUMNS).single();
  if (error) throw new Error(error.message);

  // First key a workspace adds becomes the team default automatically,
  // same convenience the personal store gives a user's first key.
  const rows = await listTeamProviders(workspaceId);
  if (!rows.some((row) => row.isDefault)) {
    await setDefaultTeamProvider(workspaceId, (data as Record<string, unknown>)["id"] as string);
    const authors = await loadAuthors([callerId]);
    return { ...toDto(data as Record<string, unknown>, authors), isDefault: true };
  }
  const authors = await loadAuthors([callerId]);
  return toDto(data as Record<string, unknown>, authors);
}

export async function setDefaultTeamProvider(workspaceId: string, id: string): Promise<void> {
  const { error: clearError } = await supabaseAdmin
    .from("workspace_ai_providers")
    .update({ is_default: false } as never)
    .eq("workspace_id", workspaceId);
  if (clearError) throw new Error(clearError.message);
  const { error } = await supabaseAdmin
    .from("workspace_ai_providers")
    .update({ is_default: true, enabled: true } as never)
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteTeamProvider(workspaceId: string, id: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("workspace_ai_providers")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

/**
 * Loads (and decrypts) a shared credential for actual use: the caller's
 * explicit choice when given, otherwise the workspace's default, otherwise
 * the first enabled one. The plaintext key never leaves the server.
 *
 * Re-checks `keys:use` itself (rather than trusting the caller already did)
 * because this is the function that ultimately hands back a live secret —
 * it's the one place in this file worth double-gating even though every
 * current call site has already checked upstream.
 */
export async function resolveTeamProvider(
  workspaceId: string,
  userId: string,
  providerId?: string | null,
): Promise<ResolvedProvider> {
  await requireCapability(userId, workspaceId, "keys:use");

  let query = supabaseAdmin
    .from("workspace_ai_providers")
    .select("id, provider, api_key_ciphertext, base_url, model, is_default")
    .eq("workspace_id", workspaceId)
    .eq("enabled", true);
  if (providerId) query = query.eq("id", providerId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const row = rows.find((r) => r["is_default"] === true) ?? rows[0];
  if (!row) {
    throw new Error(
      "No enabled team AI provider. Ask a workspace Owner or Admin to add one in Settings → AI.",
    );
  }

  const meta = providerMeta(row["provider"] as string);
  const baseUrl = ((row["base_url"] as string | null) ?? meta?.baseUrl ?? "").replace(/\/+$/, "");
  const model = (row["model"] as string | null) ?? meta?.defaultModel ?? "";
  if (!baseUrl) throw new Error("This team provider has no base URL configured.");
  if (!model) throw new Error("This team provider has no model configured.");

  return {
    id: row["id"] as string,
    provider: row["provider"] as string,
    apiKey: decryptApiKey(row["api_key_ciphertext"] as string),
    baseUrl,
    model,
  };
}
