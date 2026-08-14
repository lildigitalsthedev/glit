import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type { NotificationType } from "@/lib/notifications/store.server";
import type { NotificationType } from "@/lib/notifications/store.server";

export interface NotificationRecord {
  id: string;
  type: NotificationType;
  title: string;
  body: string | null;
  workspaceId: string | null;
  repoFullName: string | null;
  actorId: string | null;
  metadata: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
}

const PAGE_SIZE = 30;

/**
 * Reads go straight through the caller's own RLS-scoped client — unlike
 * the Team Activity Feed, `notifications` grants `authenticated` SELECT
 * gated on `auth.uid() = user_id`, so there's no admin bypass needed here,
 * only for the writes in notifications/store.server.ts.
 */
export const listNotifications = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { before?: string | null }) => data)
  .handler(async ({ data, context }): Promise<{ entries: NotificationRecord[]; nextBefore: string | null }> => {
    let query = context.supabase
      .from("notifications")
      .select("id, type, title, body, workspace_id, repo_full_name, actor_id, metadata, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(PAGE_SIZE);
    if (data.before) query = query.lt("created_at", data.before);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const entries: NotificationRecord[] = (rows ?? []).map((row) => ({
      id: row.id as string,
      type: row.type as NotificationType,
      title: row.title as string,
      body: row.body as string | null,
      workspaceId: row.workspace_id as string | null,
      repoFullName: row.repo_full_name as string | null,
      actorId: row.actor_id as string | null,
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      readAt: row.read_at as string | null,
      createdAt: row.created_at as string,
    }));

    return {
      entries,
      nextBefore: entries.length === PAGE_SIZE ? entries[entries.length - 1].createdAt : null,
    };
  });

export const getUnreadNotificationCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ count: number }> => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { count: count ?? 0 };
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", data.id)
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markNotificationUnread = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: null })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("notifications").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
