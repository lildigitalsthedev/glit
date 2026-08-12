import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type { WorkspaceActivityAction, ActivityActor, ActivityEntry } from "@/lib/workspaces/activity.server";

/**
 * Feature 6: Team Activity Feed. Read-only, gated on `activity:view` — every
 * workspace role (including Viewer) can see it. Paginated with `before`, a
 * cursor on `created_at` from the last entry of the previous page; omit it
 * for the first page.
 */
export const listWorkspaceActivity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string; before?: string | null }) => data)
  .handler(async ({ data, context }) => {
    const { listActivity } = await import("./workspaces/activity.server");
    return listActivity(context.userId, data.workspaceId, data.before ?? null);
  });
