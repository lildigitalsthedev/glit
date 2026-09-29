import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const ACCESS_TTL_SECONDS = 60 * 60;
const REFRESH_TTL_SECONDS = 30 * 24 * 60 * 60;
const CODE_TTL_SECONDS = 5 * 60;

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // OAuth tables are added by a local migration; generated Supabase types may lag until refreshed.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return supabaseAdmin as any;
}

export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
const pkceS256 = (value: string) => createHash("sha256").update(value).digest("base64url");
const opaque = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

export async function registerClient(input: { client_name?: string; redirect_uris?: unknown }) {
  const name = typeof input.client_name === "string" ? input.client_name.slice(0, 100) : "MCP client";
  const redirects = input.redirect_uris;
  if (!Array.isArray(redirects) || redirects.length < 1 || redirects.length > 20 ||
      redirects.some((uri) => typeof uri !== "string" || !isAllowedRedirect(uri))) {
    throw new Error("Invalid redirect_uris");
  }
  const clientId = opaque("gpc_");
  const admin = await db();
  const { error } = await admin.from("mcp_oauth_clients").insert({
    client_id: clientId,
    client_name: name || "MCP client",
    redirect_uris: redirects,
  });
  if (error) throw new Error(error.message);
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(Date.now() / 1000),
    client_name: name || "MCP client",
    redirect_uris: redirects,
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
}

export function isAllowedRedirect(uri: string) {
  try {
    const u = new URL(uri);
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname);
    return !u.username && !u.password && !u.hash && (u.protocol === "https:" || (local && u.protocol === "http:"));
  } catch { return false; }
}

export async function getClient(clientId: string) {
  const admin = await db();
  const { data } = await admin.from("mcp_oauth_clients").select("*").eq("client_id", clientId).maybeSingle();
  return data as { client_id: string; client_name: string; redirect_uris: string[] } | null;
}

export async function issueCode(input: {
  userId: string; clientId: string; redirectUri: string; codeChallenge: string; resource: string;
}) {
  const client = await getClient(input.clientId);
  if (!client || !client.redirect_uris.includes(input.redirectUri)) throw new Error("Invalid OAuth client or redirect URI");
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.codeChallenge)) throw new Error("Invalid PKCE challenge");
  const code = opaque("gpcd_");
  const admin = await db();
  const { error } = await admin.from("mcp_oauth_codes").insert({
    code_hash: sha256(code), client_id: input.clientId, user_id: input.userId,
    redirect_uri: input.redirectUri, code_challenge: input.codeChallenge,
    resource: input.resource, expires_at: new Date(Date.now() + CODE_TTL_SECONDS * 1000).toISOString(),
  });
  if (error) throw new Error(error.message);
  return code;
}

function safeEqual(a: string, b: string) {
  const aa = Buffer.from(a); const bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}

async function mint(clientId: string, userId: string, resource: string) {
  const accessToken = opaque("gpa_");
  const refreshToken = opaque("gpr_");
  const expiresAt = new Date(Date.now() + ACCESS_TTL_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_SECONDS * 1000).toISOString();
  const admin = await db();
  const { error } = await admin.from("mcp_oauth_tokens").insert({
    client_id: clientId, user_id: userId, resource,
    access_token_hash: sha256(accessToken), refresh_token_hash: sha256(refreshToken), expires_at: expiresAt,
    refresh_expires_at: refreshExpiresAt,
  });
  if (error) throw new Error(error.message);
  return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TTL_SECONDS, refresh_token: refreshToken };
}

export async function exchangeToken(form: URLSearchParams, mcpResource: string) {
  const grant = form.get("grant_type");
  const clientId = form.get("client_id") ?? "";
  const client = await getClient(clientId);
  if (!client) return null;
  const admin = await db();

  if (grant === "authorization_code") {
    const code = form.get("code") ?? "";
    const verifier = form.get("code_verifier") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";
    const { data } = await admin.from("mcp_oauth_codes").select("*").eq("code_hash", sha256(code)).maybeSingle();
    if (!data || data.client_id !== clientId || data.redirect_uri !== redirectUri || data.expires_at <= new Date().toISOString() || data.used_at || data.resource !== mcpResource) return null;
    if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || !safeEqual(pkceS256(verifier), data.code_challenge)) return null;
    if (form.has("resource") && form.get("resource") !== mcpResource) return null;
    const { data: used } = await admin.from("mcp_oauth_codes").update({ used_at: new Date().toISOString() }).eq("code_hash", sha256(code)).is("used_at", null).select("code_hash").maybeSingle();
    if (!used) return null;
    return mint(clientId, data.user_id, data.resource);
  }

  if (grant === "refresh_token") {
    const refresh = form.get("refresh_token") ?? "";
    const { data } = await admin.from("mcp_oauth_tokens").select("*").eq("refresh_token_hash", sha256(refresh)).is("revoked_at", null).maybeSingle();
    if (!data || data.client_id !== clientId || data.resource !== mcpResource || data.refresh_expires_at <= new Date().toISOString()) return null;
    const { data: revoked } = await admin.from("mcp_oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", data.id).is("revoked_at", null).select("id").maybeSingle();
    if (!revoked) return null;
    return mint(clientId, data.user_id, data.resource);
  }
  return null;
}

export async function revokeToken(raw: string, clientId: string) {
  const admin = await db();
  const hash = sha256(raw);
  const { data } = await admin.from("mcp_oauth_tokens").select("id, client_id")
    .or(`access_token_hash.eq.${hash},refresh_token_hash.eq.${hash}`).maybeSingle();
  if (!data || data.client_id !== clientId) return;
  await admin.from("mcp_oauth_tokens").update({ revoked_at: new Date().toISOString() }).eq("id", data.id).is("revoked_at", null);
}

export async function verifyAccessToken(raw: string, resource: string) {
  if (!raw.startsWith("gpa_")) return null;
  const admin = await db();
  const { data } = await admin.from("mcp_oauth_tokens").select("id, user_id, expires_at, resource")
    .eq("access_token_hash", sha256(raw)).is("revoked_at", null).maybeSingle();
  if (!data || data.resource !== resource || data.expires_at <= new Date().toISOString()) return null;
  return data.user_id as string;
}
