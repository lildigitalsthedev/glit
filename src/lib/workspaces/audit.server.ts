// Server-only. Feature 9: Audit Logs. Deliberately reuses `workspace_activity`
// (Feature 6) rather than a second table — see the migration for why. This
// file is the *query* layer on top of it: offset pagination with an exact
// count, full-text-ish search, and action/actor/date filters, plus a CSV
// export that shares the same filter logic so "what you filtered is what
// you export" always holds.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireCapability } from "./store.server";
import type { ActivityActor, WorkspaceActivityAction } from "./activity.server";

export interface AuditLogEntry {
  id: string;
  action: WorkspaceActivityAction;
  summary: string;
  repoFullName: string | null;
  metadata: Record<string, unknown>;
  actor: ActivityActor | null;
  createdAt: string;
}

export interface AuditLogFilters {
  search?: string;
  actions?: WorkspaceActivityAction[];
  actorId?: string;
  from?: string;
  to?: string;
}

export interface AuditLogPage {
  entries: AuditLogEntry[];
  total: number;
  page: number;
  pageSize: number;
}

const MAX_PAGE_SIZE = 100;
const EXPORT_ROW_CAP = 10_000;

/**
 * Resolved separately (and *before* the query is built) rather than inline:
 * Supabase's query builder is "thenable", so awaiting anything partway
 * through building one — inside the same function that also returns the
 * builder — risks the runtime treating the builder itself as the thing
 * being awaited and firing the query early, before `.order()`/`.range()`
 * are attached. Keeping this lookup in its own plain `await` sidesteps
 * that entirely.
 */
async function resolveSearchActorIds(term: string | undefined): Promise<string[]> {
  if (!term) return [];
  const { data } = await supabaseAdmin.from("profiles").select("id").ilike("display_name", `%${term}%`);
  return (data ?? []).map((p) => p.id as string);
}

/**
 * Applies every filter shared between listing and export, so the two paths
 * can never silently drift apart. Synchronous on purpose — see
 * `resolveSearchActorIds` above for why nothing here is awaited.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyFilters(query: any, workspaceId: string, filters: AuditLogFilters, searchActorIds: string[]) {
  let q = query.eq("workspace_id", workspaceId);

  if (filters.actions && filters.actions.length > 0) q = q.in("action", filters.actions);
  if (filters.actorId) q = q.eq("actor_id", filters.actorId);
  if (filters.from) q = q.gte("created_at", filters.from);
  if (filters.to) q = q.lte("created_at", filters.to);

  const term = filters.search?.trim();
  if (term) {
    const escaped = term.replace(/[%,]/g, "");
    const clauses = [`summary.ilike.%${escaped}%`, `repo_full_name.ilike.%${escaped}%`];
    if (searchActorIds.length > 0) clauses.push(`actor_id.in.(${searchActorIds.join(",")})`);
    q = q.or(clauses.join(","));
  }

  return q;
}

async function loadActors(ids: (string | null)[]): Promise<Map<string, ActivityActor>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  if (unique.length === 0) return new Map();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url")
    .in("id", unique);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((p) => [
      p.id as string,
      { userId: p.id as string, displayName: p.display_name as string | null, avatarUrl: p.avatar_url as string | null },
    ]),
  );
}

/**
 * Page-numbered (not cursor) on purpose: the audit page needs a total
 * count and jump-to-page for compliance review, which cursor pagination
 * (used by the lightweight Feature 6 feed) can't give you alongside
 * arbitrary filters.
 */
export async function listAuditLog(
  userId: string,
  workspaceId: string,
  page: number,
  pageSize: number,
  filters: AuditLogFilters = {},
): Promise<AuditLogPage> {
  await requireCapability(userId, workspaceId, "activity:view");

  const size = Math.min(Math.max(pageSize, 1), MAX_PAGE_SIZE);
  const pageNum = Math.max(page, 1);
  const from = (pageNum - 1) * size;
  const to = from + size - 1;

  const searchActorIds = await resolveSearchActorIds(filters.search?.trim());
  const base = supabaseAdmin
    .from("workspace_activity")
    .select("id, actor_id, action, summary, repo_full_name, metadata, created_at", { count: "exact" });
  const query = applyFilters(base, workspaceId, filters, searchActorIds);
  const { data: rows, error, count } = await query.order("created_at", { ascending: false }).range(from, to);
  if (error) throw new Error(error.message);

  const actors = await loadActors((rows ?? []).map((r) => r.actor_id as string | null));
  const entries: AuditLogEntry[] = (rows ?? []).map((row) => ({
    id: row.id as string,
    action: row.action as WorkspaceActivityAction,
    summary: row.summary as string,
    repoFullName: row.repo_full_name as string | null,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    actor: row.actor_id ? (actors.get(row.actor_id as string) ?? null) : null,
    createdAt: row.created_at as string,
  }));

  return { entries, total: count ?? entries.length, page: pageNum, pageSize: size };
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Same filters as `listAuditLog`, capped at `EXPORT_ROW_CAP` rows (newest
 * first) rather than truly unbounded — an audit table can grow into the
 * millions of rows over a workspace's lifetime, and a single export
 * request has to stay a single request/response rather than a background
 * job for this feature to stay simple. Callers who need the full history
 * beyond the cap should narrow the date range and export in slices.
 */
export async function exportAuditLogCsv(
  userId: string,
  workspaceId: string,
  filters: AuditLogFilters = {},
): Promise<string> {
  await requireCapability(userId, workspaceId, "activity:view");

  const searchActorIds = await resolveSearchActorIds(filters.search?.trim());
  const base = supabaseAdmin
    .from("workspace_activity")
    .select("id, actor_id, action, summary, repo_full_name, metadata, created_at");
  const query = applyFilters(base, workspaceId, filters, searchActorIds);
  const { data: rows, error } = await query.order("created_at", { ascending: false }).limit(EXPORT_ROW_CAP);
  if (error) throw new Error(error.message);

  const actors = await loadActors((rows ?? []).map((r) => r.actor_id as string | null));

  const header = ["Timestamp", "Action", "Actor", "Summary", "Repository", "Metadata"];
  const lines = [header.map(csvCell).join(",")];
  for (const row of rows ?? []) {
    const actorId = row.actor_id as string | null;
    const actorName = actorId ? (actors.get(actorId)?.displayName ?? actorId) : "System";
    lines.push(
      [
        csvCell(row.created_at as string),
        csvCell(row.action as string),
        csvCell(actorName),
        csvCell(row.summary as string),
        csvCell((row.repo_full_name as string | null) ?? ""),
        csvCell(JSON.stringify(row.metadata ?? {})),
      ].join(","),
    );
  }
  return lines.join("\n");
}
