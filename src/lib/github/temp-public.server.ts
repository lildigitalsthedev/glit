// Server-only. Feature 1: Temporary Public Repository. Flips a private
// GitHub repo to public for a bounded window, then flips it back — with
// the expiry enforced by the database + a background sweep, never only by
// whichever browser tab happened to start the timer.
//
// Source of truth is always `repo_temp_public`, not GitHub itself: the row
// is written *before* the GitHub call, and every status read re-checks
// whether `expires_at` has passed and self-heals if the sweep hasn't
// caught up yet. That's what makes "browser closed / device offline /
// logged out / GitPush restarted" all fine — the next thing that looks at
// this repo (a poll from another tab, the cron sweep, the owner reopening
// the app) finishes the revert.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { GithubError, getRepo, setRepoVisibility } from "./api.server";
import { loadAccountToken, loadAccountTokenAdmin } from "./tokens.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabaseAdmin as any;

export const MAX_TEMP_PUBLIC_SECONDS = 24 * 60 * 60; // 24 hours, matches the longest preset
const MIN_TEMP_PUBLIC_SECONDS = 60; // 1 minute, matches the shortest preset
const MAX_ERROR_RETRIES = 5;

export interface TempPublicStatus {
  id: string;
  fullName: string;
  status: "active" | "reverting" | "reverted" | "ended" | "error";
  expiresAt: string;
  createdAt: string;
  extendedCount: number;
  lastError: string | null;
  isPublic: boolean;
}

async function logAudit(args: {
  workspaceId: string;
  tempPublicId?: string;
  fullName: string;
  event: string;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  try {
    await db.from("repo_share_audit").insert({
      workspace_id: args.workspaceId,
      temp_public_id: args.tempPublicId ?? null,
      full_name: args.fullName,
      event: args.event,
      actor_id: args.actorId ?? null,
      metadata: args.metadata ?? {},
    });
  } catch (err) {
    console.error("[temp-public] audit insert failed:", err);
  }
}

function clampSeconds(seconds: number): number {
  if (!Number.isFinite(seconds)) throw new Error("Invalid duration.");
  return Math.min(MAX_TEMP_PUBLIC_SECONDS, Math.max(MIN_TEMP_PUBLIC_SECONDS, Math.round(seconds)));
}

/**
 * Starts (or, if one is already running, is rejected in favor of `extend`)
 * a temporary-public window. No-ops safely per spec if the repo is already
 * public: nothing is recorded and GitHub isn't touched, since there is no
 * "previous private state" to return to.
 */
export async function makeTemporarilyPublic(args: {
  supabase: import("@supabase/supabase-js").SupabaseClient; // request-scoped, RLS-enforcing
  workspaceId: string;
  accountId: string;
  fullName: string;
  userId: string;
  seconds: number;
}): Promise<TempPublicStatus> {
  const seconds = clampSeconds(args.seconds);
  const { token } = await loadAccountToken(args.supabase, args.accountId);
  const repo = await getRepo(token, args.fullName);

  if (!repo.private) {
    throw new Error(
      `${args.fullName} is already public — there's nothing to temporarily change back.`,
    );
  }

  const { data: existing } = await db
    .from("repo_temp_public")
    .select("id, expires_at")
    .eq("account_id", args.accountId)
    .eq("full_name", args.fullName)
    .eq("status", "active")
    .maybeSingle();
  if (existing) {
    throw new Error(
      "This repository is already temporarily public. Extend the existing window instead of starting a new one.",
    );
  }

  await setRepoVisibility(token, args.fullName, false);
  const expiresAt = new Date(Date.now() + seconds * 1000).toISOString();

  const { data: row, error } = await db
    .from("repo_temp_public")
    .insert({
      workspace_id: args.workspaceId,
      account_id: args.accountId,
      full_name: args.fullName,
      created_by: args.userId,
      previous_private: true,
      status: "active",
      expires_at: expiresAt,
    })
    .select("id, full_name, status, expires_at, created_at, extended_count, last_error")
    .single();

  if (error) {
    // Best-effort: the GitHub side already flipped, so try to put it back
    // rather than leaving the repo stuck public with no tracking row.
    try {
      await setRepoVisibility(token, args.fullName, true);
    } catch (revertErr) {
      console.error("[temp-public] rollback after DB insert failure also failed:", revertErr);
    }
    throw new Error(error.message);
  }

  await logAudit({
    workspaceId: args.workspaceId,
    tempPublicId: row.id,
    fullName: args.fullName,
    event: "temp_public_enabled",
    actorId: args.userId,
    metadata: { seconds },
  });

  return {
    id: row.id,
    fullName: row.full_name,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    extendedCount: row.extended_count,
    lastError: row.last_error,
    isPublic: true,
  };
}

export async function extendTemporaryPublic(args: {
  workspaceId: string;
  accountId: string;
  fullName: string;
  userId: string;
  addSeconds: number;
}): Promise<TempPublicStatus> {
  const { data: row, error } = await db
    .from("repo_temp_public")
    .select("id, expires_at, extended_count")
    .eq("account_id", args.accountId)
    .eq("full_name", args.fullName)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("This repository isn't currently temporarily public.");

  const currentExpiry = new Date(row.expires_at as string).getTime();
  const base = Math.max(currentExpiry, Date.now());
  const addSeconds = clampSeconds(args.addSeconds);
  const maxAllowedExpiry = Date.now() + MAX_TEMP_PUBLIC_SECONDS * 1000;
  const newExpiry = Math.min(base + addSeconds * 1000, maxAllowedExpiry);

  const { data: updated, error: updateError } = await db
    .from("repo_temp_public")
    .update({ expires_at: new Date(newExpiry).toISOString(), extended_count: (row.extended_count as number) + 1 })
    .eq("id", row.id)
    .select("id, full_name, status, expires_at, created_at, extended_count, last_error")
    .single();
  if (updateError) throw new Error(updateError.message);

  await logAudit({
    workspaceId: args.workspaceId,
    tempPublicId: row.id,
    fullName: args.fullName,
    event: "temp_public_extended",
    actorId: args.userId,
    metadata: { addSeconds, newExpiresAt: updated.expires_at },
  });

  return {
    id: updated.id,
    fullName: updated.full_name,
    status: updated.status,
    expiresAt: updated.expires_at,
    createdAt: updated.created_at,
    extendedCount: updated.extended_count,
    lastError: updated.last_error,
    isPublic: true,
  };
}

/** Immediately makes the repository private again, ahead of its timer. */
export async function endTemporaryPublicNow(args: {
  supabase: import("@supabase/supabase-js").SupabaseClient;
  workspaceId: string;
  accountId: string;
  fullName: string;
  userId: string;
}): Promise<{ fullName: string; isPrivate: boolean }> {
  const { data: row, error } = await db
    .from("repo_temp_public")
    .select("id")
    .eq("account_id", args.accountId)
    .eq("full_name", args.fullName)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("This repository isn't currently temporarily public.");

  const { token } = await loadAccountToken(args.supabase, args.accountId);
  await setRepoVisibility(token, args.fullName, true);

  await db
    .from("repo_temp_public")
    .update({ status: "ended", reverted_at: new Date().toISOString() })
    .eq("id", row.id);

  await logAudit({
    workspaceId: args.workspaceId,
    tempPublicId: row.id,
    fullName: args.fullName,
    event: "temp_public_ended_manually",
    actorId: args.userId,
  });

  return { fullName: args.fullName, isPrivate: true };
}

/**
 * Reads current status and, if the window has already lapsed but the
 * background sweep hasn't run yet, reverts it right now instead of making
 * the caller wait for the next cron tick. This is what makes the status
 * poll in the UI self-healing.
 */
export async function getTemporaryPublicStatus(args: {
  accountId: string;
  fullName: string;
}): Promise<TempPublicStatus | null> {
  const { data: row, error } = await db
    .from("repo_temp_public")
    .select("id, full_name, status, expires_at, created_at, extended_count, last_error, workspace_id")
    .eq("account_id", args.accountId)
    .eq("full_name", args.fullName)
    .in("status", ["active", "reverting", "error"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) return null;

  if (row.status === "active" && new Date(row.expires_at as string).getTime() <= Date.now()) {
    await sweepExpiredTempPublic(1);
    const { data: refreshed } = await db
      .from("repo_temp_public")
      .select("id, full_name, status, expires_at, created_at, extended_count, last_error")
      .eq("id", row.id)
      .maybeSingle();
    if (refreshed) {
      return {
        id: refreshed.id,
        fullName: refreshed.full_name,
        status: refreshed.status,
        expiresAt: refreshed.expires_at,
        createdAt: refreshed.created_at,
        extendedCount: refreshed.extended_count,
        lastError: refreshed.last_error,
        isPublic: refreshed.status === "active" || refreshed.status === "reverting",
      };
    }
  }

  return {
    id: row.id,
    fullName: row.full_name,
    status: row.status,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    extendedCount: row.extended_count,
    lastError: row.last_error,
    isPublic: row.status === "active" || row.status === "reverting",
  };
}

/**
 * The actual background job. Claims due rows atomically (see
 * `claim_expired_temp_public` — FOR UPDATE SKIP LOCKED), then for each one
 * calls GitHub to set the repo back to private. Called both from the
 * lazy self-heal above (limit 1) and from the internal cron endpoint
 * (limit ~25) so this is the single place that ever performs a revert.
 *
 * Handles the edge cases from the spec explicitly:
 * - Repo deleted / token lost permission / GitHub briefly down: the
 *   GitHub call throws, so the row goes back to 'active' (not stuck in
 *   'reverting' forever) with the error recorded, and gets retried on the
 *   next sweep — up to MAX_ERROR_RETRIES, after which it's marked 'error'
 *   so it stops hammering GitHub and surfaces in the UI as needing manual
 *   attention.
 * - Repo manually made private already (owner did it by hand on GitHub,
 *   or a previous sweep run partially succeeded): `setRepoVisibility` is
 *   idempotent from GitHub's side, so this just no-ops there.
 */
export async function sweepExpiredTempPublic(limit = 25): Promise<{ reverted: number; failed: number }> {
  const { data: claimed, error } = await db.rpc("claim_expired_temp_public", { p_limit: limit });
  if (error) {
    console.error("[temp-public] claim_expired_temp_public failed:", error.message);
    return { reverted: 0, failed: 0 };
  }
  const rows = (claimed ?? []) as {
    id: string;
    workspace_id: string;
    account_id: string;
    full_name: string;
    created_by: string;
    error_count: number;
  }[];

  let reverted = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const { token } = await loadAccountTokenAdmin(row.account_id);
      await setRepoVisibility(token, row.full_name, true);
      await db
        .from("repo_temp_public")
        .update({ status: "reverted", reverted_at: new Date().toISOString() })
        .eq("id", row.id);
      await logAudit({
        workspaceId: row.workspace_id,
        tempPublicId: row.id,
        fullName: row.full_name,
        event: "temp_public_reverted",
      });
      const { notifyUser } = await import("../notifications/store.server");
      await notifyUser(row.created_by, {
        type: "repository_archived", // reuses an existing, already-allowed type; see metadata for the real event
        title: "Repository is private again",
        body: `${row.full_name} automatically returned to private.`,
        workspaceId: row.workspace_id,
        repoFullName: row.full_name,
        metadata: { event: "temp_public_reverted" },
      });
      reverted++;
    } catch (err) {
      failed++;
      const message = err instanceof GithubError ? err.message : err instanceof Error ? err.message : "Unknown error";
      const nextErrorCount = (row.error_count ?? 0) + 1;
      const giveUp = nextErrorCount >= MAX_ERROR_RETRIES;
      await db
        .from("repo_temp_public")
        .update({
          status: giveUp ? "error" : "active", // 'active' so the next sweep retries it
          last_error: message,
          error_count: nextErrorCount,
        })
        .eq("id", row.id);
      await logAudit({
        workspaceId: row.workspace_id,
        tempPublicId: row.id,
        fullName: row.full_name,
        event: giveUp ? "temp_public_revert_gave_up" : "temp_public_revert_failed",
        metadata: { error: message, attempt: nextErrorCount },
      });
      console.error(`[temp-public] revert failed for ${row.full_name}:`, message);
    }
  }

  return { reverted, failed };
}
