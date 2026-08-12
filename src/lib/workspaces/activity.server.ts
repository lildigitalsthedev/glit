// Server-only. Uses the service-role Supabase client (bypasses RLS) — see
// the migration for why: workspace_activity has RLS enabled with no client
// policies at all, so every read/write goes through here.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCapability } from "./store.server";

export type WorkspaceActivityAction =
  | "repository_created"
  | "repository_deleted"
  | "push_completed"
  | "ai_generation"
  | "ai_edit"
  | "prompt_created"
  | "member_joined"
  | "member_removed"
  | "workspace_updated"
  | "team_key_added"
  | "team_key_removed";

export interface ActivityActor {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface ActivityEntry {
  id: string;
  action: WorkspaceActivityAction;
  summary: string;
  repoFullName: string | null;
  metadata: Record<string, unknown>;
  actor: ActivityActor | null;
  createdAt: string;
}

/**
 * Records one feed entry. Deliberately swallows its own errors — logging
 * is a side effect of an action that has *already succeeded* (a push, an
 * invite, an AI edit), and a broken feed insert should never turn into a
 * user-facing failure for the real action that already went through.
 */
export async function logActivity(args: {
  workspaceId: string;
  actorId: string | null;
  action: WorkspaceActivityAction;
  summary: string;
  repoFullName?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("workspace_activity").insert({
      workspace_id: args.workspaceId,
      actor_id: args.actorId,
      action: args.action,
      summary: args.summary,
      repo_full_name: args.repoFullName ?? null,
      metadata: args.metadata ?? {},
    });
    if (error) console.error("[workspace_activity] insert failed:", error.message);
  } catch (err) {
    console.error("[workspace_activity] insert threw:", err);
  }
}

const PAGE_SIZE = 25;

/**
 * Newest-first, cursor-paginated by `created_at` (the created-before value
 * of the last row already shown) rather than offset — the feed is
 * append-only and can grow quickly, so an offset would skip or repeat rows
 * whenever a new entry lands between page loads.
 */
export async function listActivity(
  userId: string,
  workspaceId: string,
  before?: string | null,
): Promise<{ entries: ActivityEntry[]; nextBefore: string | null }> {
  await requireCapability(userId, workspaceId, "activity:view");

  let query = supabaseAdmin
    .from("workspace_activity")
    .select("id, actor_id, action, summary, repo_full_name, metadata, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE);
  if (before) query = query.lt("created_at", before);

  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return { entries: [], nextBefore: null };

  const actorIds = Array.from(new Set(rows.map((r) => r.actor_id as string | null).filter((id): id is string => Boolean(id))));
  const actors = new Map<string, ActivityActor>();
  if (actorIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", actorIds);
    if (profileError) throw new Error(profileError.message);
    for (const profile of profileRows ?? []) {
      actors.set(profile.id as string, {
        userId: profile.id as string,
        displayName: profile.display_name as string | null,
        avatarUrl: profile.avatar_url as string | null,
      });
    }
  }

  const entries: ActivityEntry[] = rows.map((row) => ({
    id: row.id as string,
    action: row.action as WorkspaceActivityAction,
    summary: row.summary as string,
    repoFullName: row.repo_full_name as string | null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    actor: row.actor_id ? (actors.get(row.actor_id as string) ?? null) : null,
    createdAt: row.created_at as string,
  }));

  return {
    entries,
    nextBefore: rows.length === PAGE_SIZE ? (rows[rows.length - 1].created_at as string) : null,
  };
}
