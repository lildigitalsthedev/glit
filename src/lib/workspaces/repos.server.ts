// Server-only. Uses the service-role Supabase client (bypasses RLS) because
// building a *shared* workspace repo list means reading repo_prefs rows that
// belong to other members — something the request-scoped, RLS-enforcing
// client can never see (each row is locked to its own user_id). This file
// must only ever be reached via `await import()` inside a handler that has
// already called `requireCapability`/`requireActiveWorkspaceCapability`.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface WorkspaceMemberRef {
  userId: string;
  displayName: string | null;
  avatarUrl: string | null;
}

export interface WorkspaceRepoRef {
  fullName: string;
  /** The GitHub connection whose token should be used to fetch this repo's live metadata — the most recently touched repo_prefs row's account. */
  accountId: string;
  /** Workspace members who've opened/pushed this repo through GitPush — not raw GitHub commit history. */
  contributors: WorkspaceMemberRef[];
  addedBy: WorkspaceMemberRef | null;
  isFavoriteForCaller: boolean;
}

/**
 * Aggregates every member's `repo_prefs` rows for a workspace into one
 * shared list — one entry per distinct repository, regardless of which
 * member's GitHub connection originally added it.
 */
export async function listWorkspaceRepoRefs(
  workspaceId: string,
  callerId: string,
): Promise<WorkspaceRepoRef[]> {
  const { data: rows, error } = await supabaseAdmin
    .from("repo_prefs")
    .select("user_id, account_id, full_name, is_favorite, created_at, updated_at")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) return [];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id as string)));
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", userIds);
  if (profilesError) throw new Error(profilesError.message);

  const profileById = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      { userId: p.id as string, displayName: p.display_name as string | null, avatarUrl: p.avatar_url as string | null },
    ]),
  );

  const byFullName = new Map<
    string,
    {
      accountId: string;
      contributorIds: Set<string>;
      addedByUserId: string;
      addedByCreatedAt: string;
      callerFavorite: boolean;
      newestUpdatedAt: string;
    }
  >();

  for (const row of rows) {
    const fullName = row.full_name as string;
    const userId = row.user_id as string;
    const existing = byFullName.get(fullName);
    if (!existing) {
      byFullName.set(fullName, {
        accountId: row.account_id as string,
        contributorIds: new Set([userId]),
        addedByUserId: userId,
        addedByCreatedAt: row.created_at as string,
        callerFavorite: userId === callerId ? Boolean(row.is_favorite) : false,
        newestUpdatedAt: row.updated_at as string,
      });
      continue;
    }
    existing.contributorIds.add(userId);
    if (userId === callerId) existing.callerFavorite = Boolean(row.is_favorite);
    // Rows are already ordered newest-updated-first, so the first row seen
    // for a fullName is the most recently touched one — keep its account as
    // the canonical one to fetch live GitHub metadata with.
    if ((row.created_at as string) < existing.addedByCreatedAt) {
      existing.addedByUserId = userId;
      existing.addedByCreatedAt = row.created_at as string;
    }
  }

  const refs: WorkspaceRepoRef[] = [];
  for (const [fullName, agg] of byFullName) {
    refs.push({
      fullName,
      accountId: agg.accountId,
      contributors: Array.from(agg.contributorIds)
        .map((id) => profileById.get(id))
        .filter((p): p is WorkspaceMemberRef => Boolean(p)),
      addedBy: profileById.get(agg.addedByUserId) ?? null,
      isFavoriteForCaller: agg.callerFavorite,
    });
  }
  return refs;
}
