import { providerMeta } from "./catalog";
import { decryptApiKey, encryptApiKey, keyHint } from "./crypto.server";

/**
 * All database access for user-owned AI providers.
 *
 * The encrypted key column is deliberately not readable by the frontend
 * (column-level grants), so every read/write of `api_key_ciphertext` goes
 * through the service-role client here — always scoped by `user_id` so one
 * user can never touch another's credentials.
 */
export interface ProviderRow {
  id: string;
  provider: string;
  label: string | null;
  keyHint: string;
  baseUrl: string | null;
  model: string | null;
  enabled: boolean;
  isDefault: boolean;
  createdAt: string;
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

const SAFE_COLUMNS =
  "id, provider, label, key_hint, base_url, model, enabled, is_default, created_at";

function toDto(row: Record<string, unknown>): ProviderRow {
  return {
    id: row["id"] as string,
    provider: row["provider"] as string,
    label: (row["label"] as string | null) ?? null,
    keyHint: (row["key_hint"] as string | null) ?? "",
    baseUrl: (row["base_url"] as string | null) ?? null,
    model: (row["model"] as string | null) ?? null,
    enabled: row["enabled"] as boolean,
    isDefault: row["is_default"] as boolean,
    createdAt: row["created_at"] as string,
  };
}

export async function listProvidersForUser(userId: string): Promise<ProviderRow[]> {
  const db = await admin();
  const { data, error } = await db
    .from("ai_providers")
    .select(SAFE_COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => toDto(row as Record<string, unknown>));
}

export async function upsertProviderForUser(
  userId: string,
  input: {
    provider: string;
    apiKey?: string;
    label?: string | null;
    baseUrl?: string | null;
    model?: string | null;
    enabled?: boolean;
  },
): Promise<ProviderRow> {
  const meta = providerMeta(input.provider);
  if (!meta) throw new Error(`Unknown provider: ${input.provider}`);

  const db = await admin();
  const { data: existing } = await db
    .from("ai_providers")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", input.provider)
    .maybeSingle();

  if (!existing && !input.apiKey) throw new Error("An API key is required to add a provider.");

  const patch: Record<string, unknown> = {
    user_id: userId,
    provider: input.provider,
  };
  if (input.apiKey) {
    patch["api_key_ciphertext"] = encryptApiKey(input.apiKey.trim());
    patch["key_hint"] = keyHint(input.apiKey.trim());
  }
  if (input.label !== undefined) patch["label"] = input.label;
  if (input.baseUrl !== undefined) patch["base_url"] = input.baseUrl || null;
  if (input.model !== undefined) patch["model"] = input.model || null;
  if (input.enabled !== undefined) patch["enabled"] = input.enabled;

  const query = existing
    ? db
        .from("ai_providers")
        .update(patch as never)
        .eq("id", existing["id"] as string)
        .eq("user_id", userId)
    : db.from("ai_providers").insert(patch as never);

  const { data, error } = await query.select(SAFE_COLUMNS).single();
  if (error) throw new Error(error.message);

  // First provider a user adds becomes their default automatically.
  const rows = await listProvidersForUser(userId);
  if (!rows.some((row) => row.isDefault)) {
    await setDefaultProviderForUser(userId, (data as Record<string, unknown>)["id"] as string);
    return { ...toDto(data as Record<string, unknown>), isDefault: true };
  }
  return toDto(data as Record<string, unknown>);
}

export async function setDefaultProviderForUser(userId: string, id: string) {
  const db = await admin();
  const { error: clearError } = await db
    .from("ai_providers")
    .update({ is_default: false } as never)
    .eq("user_id", userId);
  if (clearError) throw new Error(clearError.message);
  const { error } = await db
    .from("ai_providers")
    .update({ is_default: true, enabled: true } as never)
    .eq("user_id", userId)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteProviderForUser(userId: string, id: string) {
  const db = await admin();
  const { error } = await db.from("ai_providers").delete().eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

export interface ResolvedProvider {
  id: string;
  provider: string;
  apiKey: string;
  baseUrl: string;
  model: string;
}

/**
 * Loads (and decrypts) the credential the request should actually use: the
 * caller's explicit choice when given, otherwise their default provider,
 * otherwise the first enabled one. The plaintext key never leaves the server.
 */
export async function resolveProviderForUser(
  userId: string,
  providerId?: string | null,
): Promise<ResolvedProvider> {
  const db = await admin();
  let query = db
    .from("ai_providers")
    .select("id, provider, api_key_ciphertext, base_url, model, is_default")
    .eq("user_id", userId)
    .eq("enabled", true);
  if (providerId) query = query.eq("id", providerId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const row = rows.find((r) => r["is_default"] === true) ?? rows[0];
  if (!row) {
    throw new Error(
      "No enabled AI provider. Add your own API key in Settings → AI to use AI tools.",
    );
  }

  const meta = providerMeta(row["provider"] as string);
  const baseUrl = ((row["base_url"] as string | null) ?? meta?.baseUrl ?? "").replace(/\/+$/, "");
  const model = (row["model"] as string | null) ?? meta?.defaultModel ?? "";
  if (!baseUrl) throw new Error("This provider has no base URL configured.");
  if (!model) throw new Error("This provider has no model configured.");

  return {
    id: row["id"] as string,
    provider: row["provider"] as string,
    apiKey: decryptApiKey(row["api_key_ciphertext"] as string),
    baseUrl,
    model,
  };
}