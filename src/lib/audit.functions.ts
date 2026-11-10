import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { AuditLogFilters } from "@/lib/workspaces/audit.server";

export type { AuditLogEntry, AuditLogFilters, AuditLogPage } from "@/lib/workspaces/audit.server";
export { AUDIT_CATEGORIES, ALL_AUDIT_ACTIONS } from "@/lib/audit-categories";

interface RawAuditFilters {
  search?: string | undefined;
  actions?: string[] | undefined;
  actorId?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

/**
 * `exactOptionalPropertyTypes` is on, so an optional property can't be
 * assigned `undefined` explicitly — only set the keys that actually have a
 * value. Shared by list and export so both build filters identically.
 */
function buildFilters(raw: RawAuditFilters): AuditLogFilters {
  const filters: AuditLogFilters = {};
  if (raw.search !== undefined) filters.search = raw.search;
  // Action names are validated server-side against the known enum by the query itself.
  if (raw.actions !== undefined) filters.actions = raw.actions as NonNullable<AuditLogFilters["actions"]>;
  if (raw.actorId !== undefined) filters.actorId = raw.actorId;
  if (raw.from !== undefined) filters.from = raw.from;
  if (raw.to !== undefined) filters.to = raw.to;
  return filters;
}

/**
 * Feature 9: Audit Logs. `listWorkspaceAuditLog` and `exportWorkspaceAuditLog`
 * share the exact same filters (see `applyFilters` in `audit.server`) so
 * exporting always matches what's on screen. Gated on `activity:view` —
 * every workspace role currently holds that capability (see Feature 6),
 * so this doesn't newly restrict who can see the log; it just makes what
 * they could already see searchable and exportable.
 */
export const listWorkspaceAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      workspaceId: string;
      page?: number | undefined;
      pageSize?: number | undefined;
      search?: string | undefined;
      actions?: string[] | undefined;
      actorId?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { listAuditLog } = await import("./workspaces/audit.server");
    return listAuditLog(context.userId, data.workspaceId, data.page ?? 1, data.pageSize ?? 25, buildFilters(data));
  });

export const exportWorkspaceAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      workspaceId: string;
      search?: string | undefined;
      actions?: string[] | undefined;
      actorId?: string | undefined;
      from?: string | undefined;
      to?: string | undefined;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { exportAuditLogCsv } = await import("./workspaces/audit.server");
    const csv = await exportAuditLogCsv(context.userId, data.workspaceId, buildFilters(data));
    return { csv };
  });

/**
 * Called once per genuine sign-in — see `useAuth.tsx`, which fires this
 * only on the Supabase `SIGNED_IN` event, never on a page-refresh session
 * restore. Logged against the caller's *active* workspace: someone who
 * belongs to several workspaces only gets a login entry in whichever one
 * they were last using, which is the same "active workspace" scoping
 * every other capability check in this app already uses. Swallows its own
 * errors — a failed audit write should never block someone from actually
 * signing in.
 */
export const recordLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    try {
      const { getActiveWorkspaceId } = await import("./workspaces/store.server");
      const { logActivity } = await import("./workspaces/activity.server");
      const workspaceId = await getActiveWorkspaceId(context.userId);
      await logActivity({ workspaceId, actorId: context.userId, action: "login", summary: "Signed in" });
    } catch (err) {
      console.error("[audit] recordLogin failed:", err);
    }
    return { ok: true };
  });
