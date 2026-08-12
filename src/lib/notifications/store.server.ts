// Server-only. Uses the service-role Supabase client because notifications
// are frequently created for someone other than the caller (an invite
// recipient, a removed member, other workspace members on a share/archive)
// — the request-scoped, RLS-enforcing client can only ever write rows for
// `auth.uid()`, and `public.notifications` doesn't grant `authenticated`
// INSERT at all. Reading/marking-read/deleting a user's *own* notifications
// doesn't need this file — that goes straight through their own client in
// notifications.functions.ts, since RLS already scopes those to `user_id`.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type NotificationType =
  | "workspace_invited"
  | "workspace_removed"
  | "repository_shared"
  | "ai_generation_completed"
  | "push_completed"
  | "repository_archived";

export interface NotifyArgs {
  type: NotificationType;
  title: string;
  body?: string | null;
  workspaceId?: string | null;
  repoFullName?: string | null;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Inserts one notification for one recipient. Deliberately swallows its
 * own errors, same rationale as `logActivity` — this is a side effect of
 * an action that has *already succeeded*, and a broken insert should never
 * turn into a user-facing failure for the real action that already went
 * through.
 */
export async function notifyUser(userId: string, args: NotifyArgs): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      actor_id: args.actorId ?? null,
      type: args.type,
      title: args.title,
      body: args.body ?? null,
      workspace_id: args.workspaceId ?? null,
      repo_full_name: args.repoFullName ?? null,
      metadata: args.metadata ?? {},
    });
    if (error) console.error("[notifications] insert failed:", error.message);
  } catch (err) {
    console.error("[notifications] insert threw:", err);
  }
}

/** The same notification fanned out to several recipients at once (e.g. every other workspace member on a share/archive). */
export async function notifyUsers(userIds: string[], args: NotifyArgs): Promise<void> {
  const unique = Array.from(new Set(userIds));
  if (unique.length === 0) return;
  try {
    const rows = unique.map((userId) => ({
      user_id: userId,
      actor_id: args.actorId ?? null,
      type: args.type,
      title: args.title,
      body: args.body ?? null,
      workspace_id: args.workspaceId ?? null,
      repo_full_name: args.repoFullName ?? null,
      metadata: args.metadata ?? {},
    }));
    const { error } = await supabaseAdmin.from("notifications").insert(rows);
    if (error) console.error("[notifications] bulk insert failed:", error.message);
  } catch (err) {
    console.error("[notifications] bulk insert threw:", err);
  }
}

/**
 * Looks up an existing account by email for invite-time notifications.
 * Returns null (rather than throwing) when nobody with that email has
 * signed up yet — the invitation itself is still created either way, this
 * is only for the best-effort "notify them right now if they're already a
 * GitPush user" case.
 */
export async function findUserIdByEmail(email: string): Promise<string | null> {
  try {
    const { data, error } = await supabaseAdmin.rpc("get_user_id_by_email", { _email: email });
    if (error) {
      console.error("[notifications] email lookup failed:", error.message);
      return null;
    }
    return (data as string | null) ?? null;
  } catch (err) {
    console.error("[notifications] email lookup threw:", err);
    return null;
  }
}
