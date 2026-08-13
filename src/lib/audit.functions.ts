import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type { AuditLogEntry, AuditLogFilters, AuditLogPage } from "@/lib/workspaces/audit.server";
export { AUDIT_CATEGORIES, ALL_AUDIT_ACTIONS } from "@/lib/audit-categories";

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
      page?: number;
      pageSize?: number;
      search?: string;
      actions?: string[];
      actorId?: string;
      from?: string;
      to?: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { listAuditLog } = await import("./workspaces/audit.server");
    return listAuditLog(context.userId, data.workspaceId, data.page ?? 1, data.pageSize ?? 25, {
      search: data.search,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: data.actions as any,
      actorId: data.actorId,
      from: data.from,
      to: data.to,
    });
  });

export const exportWorkspaceAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      workspaceId: string;
      search?: string;
      actions?: string[];
      actorId?: string;
      from?: string;
      to?: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { exportAuditLogCsv } = await import("./workspaces/audit.server");
    const csv = await exportAuditLogCsv(context.userId, data.workspaceId, {
      search: data.search,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      actions: data.actions as any,
      actorId: data.actorId,
      from: data.from,
      to: data.to,
    });
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
