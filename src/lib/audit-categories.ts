import type { WorkspaceActivityAction } from "@/lib/workspaces/activity.server";

/**
 * Feature 9: Audit Logs. The 7 tracked categories the audit page filters
 * by, each mapped to the underlying `workspace_activity` action types.
 * Not `.server` — the audit page's filter chips import this directly, and
 * the server functions re-export the same list so a filter request can
 * never smuggle in an action outside this known set.
 */
export interface AuditCategory {
  key: string;
  label: string;
  actions: WorkspaceActivityAction[];
}

export const AUDIT_CATEGORIES: AuditCategory[] = [
  { key: "login", label: "Login", actions: ["login"] },
  {
    key: "repository",
    label: "Repository changes",
    actions: ["repository_created", "repository_deleted"],
  },
  { key: "pushes", label: "Pushes", actions: ["push_completed"] },
  {
    key: "settings",
    label: "Settings changes",
    actions: ["workspace_updated", "workspace_archived"],
  },
  {
    key: "members",
    label: "Member actions",
    actions: [
      "member_joined",
      "member_removed",
      "member_invited",
      "member_left",
      "member_role_changed",
      "ownership_transferred",
    ],
  },
  {
    key: "ai",
    label: "AI usage",
    actions: ["ai_generation", "ai_edit", "ai_chat", "ai_commit_message"],
  },
  {
    key: "apikeys",
    label: "API key changes",
    actions: ["team_key_added", "team_key_removed", "team_key_updated"],
  },
];

export const ALL_AUDIT_ACTIONS: WorkspaceActivityAction[] = AUDIT_CATEGORIES.flatMap((c) => c.actions);
