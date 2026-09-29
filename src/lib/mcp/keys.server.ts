import { createHash, randomBytes } from "node:crypto";

/**
 * Personal access keys for connecting external AI tools (Claude, Cursor,
 * ChatGPT…) to GitPush over MCP. Only a SHA-256 hash is stored; the
 * plaintext key is shown to the user exactly once at creation.
 */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export function hashKey(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export interface McpKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
}

export async function listKeys(userId: string): Promise<McpKeyRow[]> {
  const db = await admin();
  const { data, error } = await db
    .from("mcp_access_keys")
    .select("id, name, key_prefix, last_used_at, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({
    id: r.id,
    name: r.name,
    keyPrefix: r.key_prefix,
    lastUsedAt: r.last_used_at,
    createdAt: r.created_at,
  }));
}

export async function createKey(userId: string, name: string) {
  const existing = await listKeys(userId);
  if (existing.length >= 10) throw new Error("You can have up to 10 access keys. Revoke one first.");
  const raw = `gp_${randomBytes(24).toString("base64url")}`;
  const db = await admin();
  const { error } = await db.from("mcp_access_keys").insert({
    user_id: userId,
    name: name.trim().slice(0, 60) || "AI tool",
    key_hash: hashKey(raw),
    key_prefix: raw.slice(0, 7),
  });
  if (error) throw new Error(error.message);
  return raw;
}

export async function deleteKey(userId: string, id: string) {
  const db = await admin();
  const { error } = await db.from("mcp_access_keys").delete().eq("user_id", userId).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Returns the owning user id for a presented key, or null. */
export async function verifyKey(raw: string): Promise<string | null> {
  if (!raw.startsWith("gp_")) return null;
  const db = await admin();
  const { data } = await db
    .from("mcp_access_keys")
    .select("id, user_id")
    .eq("key_hash", hashKey(raw))
    .maybeSingle();
  if (!data) return null;
  await db
    .from("mcp_access_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id);
  return data.user_id;
}
