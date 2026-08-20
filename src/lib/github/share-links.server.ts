// Server-only. Feature 2: Expiring / Limited-Use Repository Access Links.
// The repository stays private on GitHub the entire time — recipients
// never get a GitHub-level credential at all. They get a high-entropy
// token that resolves, entirely server-side, to a short-lived session
// scoped to one repo and one role. Nothing about the repo, the owning
// GitHub account or its token is ever present in the link itself.
import { randomBytes, createHash } from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

export type ShareRole = "viewer" | "editor" | "developer" | "admin";

export const SHARE_ROLES: readonly ShareRole[] = ["viewer", "editor", "developer", "admin"] as const;

export const SHARE_ROLE_LABELS: Record<ShareRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  developer: "Developer",
  admin: "Admin",
};

export const SHARE_ROLE_DESCRIPTIONS: Record<ShareRole, string> = {
  viewer: "Browse files, read file contents and commit history. No edits, no downloads unless allowed.",
  editor: "Everything Viewer can do, plus create, edit and delete files.",
  developer: "Everything Editor can do, plus create branches and download/clone the repository.",
  admin: "Everything Developer can do, plus rename the repository and toggle archived status.",
};

/** Every action a redeemed session might attempt. */
export type ShareCapability =
  | "repo:view"
  | "repo:browse"
  | "repo:readFile"
  | "repo:commits"
  | "repo:branches"
  | "repo:download"
  | "repo:writeFile"
  | "repo:deleteFile"
  | "repo:createBranch"
  | "repo:adminSettings";

// Deliberately more conservative than the spec's ceiling for Admin: a
// leaked link should never be able to manage *other* access links, delete
// the repository outright, or touch GitHub-level collaborators. "Admin"
// here means "full GitPush content control", not "full GitHub repo
// ownership" — see repo:adminSettings below for exactly what that covers.
const SHARE_MATRIX: Record<ShareRole, readonly ShareCapability[]> = {
  viewer: ["repo:view", "repo:browse", "repo:readFile", "repo:commits", "repo:branches"],
  editor: [
    "repo:view",
    "repo:browse",
    "repo:readFile",
    "repo:commits",
    "repo:branches",
    "repo:writeFile",
    "repo:deleteFile",
  ],
  developer: [
    "repo:view",
    "repo:browse",
    "repo:readFile",
    "repo:commits",
    "repo:branches",
    "repo:writeFile",
    "repo:deleteFile",
    "repo:createBranch",
    "repo:download",
  ],
  admin: [
    "repo:view",
    "repo:browse",
    "repo:readFile",
    "repo:commits",
    "repo:branches",
    "repo:writeFile",
    "repo:deleteFile",
    "repo:createBranch",
    "repo:download",
    "repo:adminSettings",
  ],
};

export function shareRoleCan(role: ShareRole, capability: ShareCapability): boolean {
  return SHARE_MATRIX[role]?.includes(capability) ?? false;
}

const MAX_LINK_EXPIRY_SECONDS = 7 * 24 * 60 * 60; // 7 days, matches the longest preset
const MIN_LINK_EXPIRY_SECONDS = 60;
const SESSION_LIFETIME_SECONDS = 2 * 60 * 60; // sessions are re-issued by re-opening the link if they run out

function randomToken(): string {
  return randomBytes(32).toString("base64url"); // 256 bits — not realistically guessable
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function logAudit(args: {
  workspaceId: string | null;
  linkId?: string | null;
  sessionId?: string | null;
  fullName?: string | null;
  event: string;
  actorId?: string | null;
  ipHash?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.from("repo_share_audit").insert({
      workspace_id: args.workspaceId,
      link_id: args.linkId ?? null,
      session_id: args.sessionId ?? null,
      full_name: args.fullName ?? null,
      event: args.event,
      actor_id: args.actorId ?? null,
      ip_hash: args.ipHash ?? null,
      metadata: args.metadata ?? {},
    });
  } catch (err) {
    console.error("[share-links] audit insert failed:", err);
  }
}

/** Salted hash of a client IP for coarse abuse forensics — never the raw IP. */
export function hashIp(ip: string): string {
  const salt = process.env["GITHUB_TOKEN_ENC_KEY"] ?? "gitpush-fallback-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

export async function assertLinkRateLimit(key: string, limit: number, windowSeconds: number): Promise<void> {
  const { data, error } = await db.rpc("increment_text_rate_limit", { p_key: key, p_window_seconds: windowSeconds });
  if (error) {
    console.error("[share-links] rate limit check failed, allowing request:", error.message);
    return;
  }
  const count = typeof data === "number" ? data : Number(data);
  if (count > limit) {
    throw new Error("Too many attempts. Please wait a moment and try again.");
  }
}

export interface AccessLinkSummary {
  id: string;
  fullName: string;
  role: ShareRole;
  tokenPrefix: string;
  allowDownload: boolean;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string;
  status: "active" | "revoked" | "expired" | "exhausted";
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

function toSummary(row: Record<string, unknown>): AccessLinkSummary {
  return {
    id: row.id as string,
    fullName: row.full_name as string,
    role: row.role as ShareRole,
    tokenPrefix: row.token_prefix as string,
    allowDownload: row.allow_download as boolean,
    maxUses: (row.max_uses as number | null) ?? null,
    usesCount: row.uses_count as number,
    expiresAt: row.expires_at as string,
    status: row.status as AccessLinkSummary["status"],
    createdAt: row.created_at as string,
    createdBy: row.created_by as string,
    lastUsedAt: (row.last_used_at as string | null) ?? null,
    revokedAt: (row.revoked_at as string | null) ?? null,
  };
}

export async function createAccessLink(args: {
  workspaceId: string;
  accountId: string;
  fullName: string;
  userId: string;
  role: ShareRole;
  maxUses: number | null;
  expiresInSeconds: number;
  allowDownload: boolean;
}): Promise<{ link: AccessLinkSummary; token: string }> {
  if (!SHARE_ROLES.includes(args.role)) throw new Error("Invalid role.");
  if (args.maxUses !== null && (!Number.isInteger(args.maxUses) || args.maxUses < 1)) {
    throw new Error("Maximum uses must be a positive whole number, or left unlimited.");
  }
  const expiresInSeconds = Math.min(
    MAX_LINK_EXPIRY_SECONDS,
    Math.max(MIN_LINK_EXPIRY_SECONDS, Math.round(args.expiresInSeconds)),
  );

  const token = randomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

  const { data: row, error } = await db
    .from("repo_access_links")
    .insert({
      workspace_id: args.workspaceId,
      account_id: args.accountId,
      full_name: args.fullName,
      created_by: args.userId,
      role: args.role,
      token_hash: tokenHash,
      token_prefix: token.slice(0, 8),
      allow_download: args.allowDownload,
      max_uses: args.maxUses,
      expires_at: expiresAt,
    })
    .select(
      "id, full_name, role, token_prefix, allow_download, max_uses, uses_count, expires_at, status, created_at, created_by, last_used_at, revoked_at",
    )
    .single();
  if (error) throw new Error(error.message);

  await logAudit({
    workspaceId: args.workspaceId,
    linkId: row.id,
    fullName: args.fullName,
    event: "link_created",
    actorId: args.userId,
    metadata: { role: args.role, maxUses: args.maxUses, expiresInSeconds, allowDownload: args.allowDownload },
  });

  return { link: toSummary(row), token };
}

export async function listAccessLinks(workspaceId: string, fullName?: string): Promise<AccessLinkSummary[]> {
  await db.rpc("expire_stale_access_links");
  let query = db
    .from("repo_access_links")
    .select(
      "id, full_name, role, token_prefix, allow_download, max_uses, uses_count, expires_at, status, created_at, created_by, last_used_at, revoked_at",
    )
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (fullName) query = query.eq("full_name", fullName);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return ((data ?? []) as Record<string, unknown>[]).map(toSummary);
}

export async function revokeAccessLink(args: {
  workspaceId: string;
  linkId: string;
  userId: string;
}): Promise<void> {
  const { data: row, error } = await db
    .from("repo_access_links")
    .update({ status: "revoked", revoked_at: new Date().toISOString(), revoked_by: args.userId })
    .eq("id", args.linkId)
    .eq("workspace_id", args.workspaceId)
    .eq("status", "active")
    .select("id, full_name")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("That link is not active (already revoked or expired).");

  // Revoking also kills any live sessions the link already handed out —
  // "immediately becomes useless" per spec, not just "stops handing out
  // new sessions".
  await db.from("repo_access_sessions").update({ revoked_at: new Date().toISOString() }).eq("link_id", args.linkId);

  await logAudit({
    workspaceId: args.workspaceId,
    linkId: args.linkId,
    fullName: row.full_name,
    event: "link_revoked",
    actorId: args.userId,
  });
}

export async function extendAccessLink(args: {
  workspaceId: string;
  linkId: string;
  userId: string;
  addSeconds: number;
}): Promise<AccessLinkSummary> {
  const { data: row, error } = await db
    .from("repo_access_links")
    .select("id, full_name, expires_at, status")
    .eq("id", args.linkId)
    .eq("workspace_id", args.workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row || row.status === "revoked") throw new Error("That link can't be extended.");

  const base = Math.max(new Date(row.expires_at as string).getTime(), Date.now());
  const addSeconds = Math.min(MAX_LINK_EXPIRY_SECONDS, Math.max(MIN_LINK_EXPIRY_SECONDS, Math.round(args.addSeconds)));
  const newExpiry = new Date(base + addSeconds * 1000).toISOString();

  const { data: updated, error: updateError } = await db
    .from("repo_access_links")
    .update({ expires_at: newExpiry, status: row.status === "expired" ? "active" : row.status })
    .eq("id", args.linkId)
    .select(
      "id, full_name, role, token_prefix, allow_download, max_uses, uses_count, expires_at, status, created_at, created_by, last_used_at, revoked_at",
    )
    .single();
  if (updateError) throw new Error(updateError.message);

  await logAudit({
    workspaceId: args.workspaceId,
    linkId: args.linkId,
    fullName: row.full_name,
    event: "link_extended",
    actorId: args.userId,
    metadata: { newExpiresAt: newExpiry },
  });

  return toSummary(updated);
}

export async function updateAccessLinkMaxUses(args: {
  workspaceId: string;
  linkId: string;
  userId: string;
  maxUses: number | null;
}): Promise<AccessLinkSummary> {
  const { data: row, error } = await db
    .from("repo_access_links")
    .select("id, full_name, uses_count, status")
    .eq("id", args.linkId)
    .eq("workspace_id", args.workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Link not found.");
  if (args.maxUses !== null) {
    if (!Number.isInteger(args.maxUses) || args.maxUses < 1) {
      throw new Error("Maximum uses must be a positive whole number, or left unlimited.");
    }
    if (args.maxUses < (row.uses_count as number)) {
      throw new Error(`This link has already been used ${row.uses_count} time(s) — the limit can't be set lower.`);
    }
  }
  const reactivate =
    row.status === "exhausted" && (args.maxUses === null || args.maxUses > (row.uses_count as number));

  const { data: updated, error: updateError } = await db
    .from("repo_access_links")
    .update({ max_uses: args.maxUses, status: reactivate ? "active" : row.status })
    .eq("id", args.linkId)
    .select(
      "id, full_name, role, token_prefix, allow_download, max_uses, uses_count, expires_at, status, created_at, created_by, last_used_at, revoked_at",
    )
    .single();
  if (updateError) throw new Error(updateError.message);

  await logAudit({
    workspaceId: args.workspaceId,
    linkId: args.linkId,
    fullName: row.full_name,
    event: "link_limit_changed",
    actorId: args.userId,
    metadata: { maxUses: args.maxUses },
  });

  return toSummary(updated);
}

export interface RedeemedSession {
  sessionToken: string;
  role: ShareRole;
  fullName: string;
  accountId: string;
  workspaceId: string;
  allowDownload: boolean;
  expiresAt: string;
}

/**
 * Redeems a raw link token: validates + atomically consumes one use (see
 * `redeem_access_link` in the migration), then issues a short-lived
 * session scoped to exactly that repo/role. The link token itself is
 * single-purpose and spent the moment this succeeds; the *session* token
 * returned here is what the recipient's browser actually holds afterward,
 * so refreshing the page doesn't re-consume a use or need the link again.
 */
export async function redeemAccessLink(args: {
  rawToken: string;
  ipHash: string | null;
}): Promise<RedeemedSession> {
  const tokenHash = hashToken(args.rawToken);

  const { data: rows, error } = await db.rpc("redeem_access_link", { p_token_hash: tokenHash });
  if (error) throw new Error(error.message);
  const row = (rows ?? [])[0] as Record<string, unknown> | undefined;

  if (!row) {
    // Distinguish "doesn't exist / guessed" from "existed but is now dead"
    // only for audit purposes — the recipient always sees the same
    // generic message either way, so a guesser learns nothing either way.
    const { data: dead } = await db
      .from("repo_access_links")
      .select("id, workspace_id, full_name, status")
      .eq("token_hash", tokenHash)
      .maybeSingle();
    if (dead) {
      await logAudit({
        workspaceId: dead.workspace_id,
        linkId: dead.id,
        fullName: dead.full_name,
        event: "link_rejected",
        ipHash: args.ipHash,
        metadata: { reason: dead.status },
      });
    }
    throw new Error("This access link has expired or has already reached its maximum number of uses.");
  }

  const sessionToken = randomToken();
  const sessionExpiry = Math.min(
    Date.now() + SESSION_LIFETIME_SECONDS * 1000,
    new Date(row.expires_at as string).getTime(),
  );

  const { data: session, error: sessionError } = await db
    .from("repo_access_sessions")
    .insert({
      link_id: row.id,
      session_token_hash: hashToken(sessionToken),
      workspace_id: row.workspace_id,
      account_id: row.account_id,
      full_name: row.full_name,
      role: row.role,
      allow_download: row.allow_download,
      expires_at: new Date(sessionExpiry).toISOString(),
    })
    .select("id, expires_at")
    .single();
  if (sessionError) throw new Error(sessionError.message);

  await logAudit({
    workspaceId: row.workspace_id as string,
    linkId: row.id as string,
    sessionId: session.id,
    fullName: row.full_name as string,
    event: "link_redeemed",
    ipHash: args.ipHash,
    metadata: { role: row.role, usesCount: row.uses_count },
  });

  return {
    sessionToken,
    role: row.role as ShareRole,
    fullName: row.full_name as string,
    accountId: row.account_id as string,
    workspaceId: row.workspace_id as string,
    allowDownload: row.allow_download as boolean,
    expiresAt: session.expires_at,
  };
}

export interface ActiveSession {
  id: string;
  linkId: string;
  role: ShareRole;
  fullName: string;
  accountId: string;
  workspaceId: string;
  allowDownload: boolean;
  expiresAt: string;
}

/** Validates a session token from the recipient's cookie. Also revokes-in-cascade if the parent link was revoked since. */
export async function validateSession(rawSessionToken: string): Promise<ActiveSession | null> {
  const tokenHash = hashToken(rawSessionToken);
  const { data: row, error } = await db
    .from("repo_access_sessions")
    .select(
      "id, link_id, role, full_name, account_id, workspace_id, allow_download, expires_at, revoked_at, repo_access_links!inner(status)",
    )
    .eq("session_token_hash", tokenHash)
    .maybeSingle();
  if (error || !row) return null;
  if (row.revoked_at) return null;
  if (new Date(row.expires_at as string).getTime() <= Date.now()) return null;
  const linkStatus = (row.repo_access_links as { status: string } | { status: string }[] | null);
  const status = Array.isArray(linkStatus) ? linkStatus[0]?.status : linkStatus?.status;
  if (status === "revoked") return null;

  await db.from("repo_access_sessions").update({ last_seen_at: new Date().toISOString() }).eq("id", row.id);

  return {
    id: row.id,
    linkId: row.link_id,
    role: row.role,
    fullName: row.full_name,
    accountId: row.account_id,
    workspaceId: row.workspace_id,
    allowDownload: row.allow_download,
    expiresAt: row.expires_at,
  };
}

export async function logSessionEvent(
  session: ActiveSession,
  event: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  await logAudit({
    workspaceId: session.workspaceId,
    linkId: session.linkId,
    sessionId: session.id,
    fullName: session.fullName,
    event,
    metadata,
  });
}
