/**
 * Per-workspace RBAC. Deliberately separate from `@/lib/permissions`, which
 * describes the app-wide GitPush staff roles (owner/admin/developer/user of
 * the *product*). This file describes what a member can do *inside one
 * workspace* — the same person can be Owner of their personal workspace and
 * a Viewer in someone else's team.
 *
 * No Supabase imports here on purpose: both the server (workspaces.server.ts)
 * and the UI (useWorkspaces, route guards, disabled buttons) read the exact
 * same matrix, so a button can never be enabled for something the server
 * will refuse.
 */

export type WorkspaceRole = "owner" | "admin" | "developer" | "viewer";

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ["owner", "admin", "developer", "viewer"] as const;

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "Owner",
  admin: "Admin",
  developer: "Developer",
  viewer: "Viewer",
};

export const WORKSPACE_ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  owner: "Full control, including deleting the workspace and transferring ownership.",
  admin: "Manage repositories, members, API keys and settings.",
  developer: "Push code, use AI, create repositories, view activity.",
  viewer: "Read-only access.",
};

/** Every gated action in a workspace. */
export type WorkspaceCapability =
  | "workspace:view"
  | "workspace:update"
  | "workspace:delete"
  | "workspace:archive"
  | "workspace:transfer"
  | "members:view"
  | "members:invite"
  | "members:remove"
  | "members:setRole"
  | "repos:manage"
  | "repos:create"
  | "repos:push"
  | "keys:manage"
  | "keys:use"
  | "ai:use"
  | "activity:view";

const MATRIX: Record<WorkspaceRole, readonly WorkspaceCapability[]> = {
  // Owner has everything; listed explicitly so the matrix stays readable.
  owner: [
    "workspace:view",
    "workspace:update",
    "workspace:delete",
    "workspace:archive",
    "workspace:transfer",
    "members:view",
    "members:invite",
    "members:remove",
    "members:setRole",
    "repos:manage",
    "repos:create",
    "repos:push",
    "keys:manage",
    "keys:use",
    "ai:use",
    "activity:view",
  ],
  admin: [
    "workspace:view",
    "workspace:update",
    "members:view",
    "members:invite",
    "members:remove",
    "members:setRole",
    "repos:manage",
    "repos:create",
    "repos:push",
    "keys:manage",
    "keys:use",
    "ai:use",
    "activity:view",
  ],
  developer: [
    "workspace:view",
    "members:view",
    "repos:create",
    "repos:push",
    "keys:use",
    "ai:use",
    "activity:view",
  ],
  viewer: ["workspace:view", "members:view", "activity:view"],
};

export function can(role: WorkspaceRole | null | undefined, capability: WorkspaceCapability): boolean {
  if (!role) return false;
  return MATRIX[role]?.includes(capability) ?? false;
}

/** Roles an Admin is allowed to hand out. Only the Owner can create Admins. */
export const ASSIGNABLE_BY_ADMIN: readonly WorkspaceRole[] = ["developer", "viewer"] as const;
export const ASSIGNABLE_BY_OWNER: readonly WorkspaceRole[] = ["admin", "developer", "viewer"] as const;

export function assignableRoles(role: WorkspaceRole | null | undefined): readonly WorkspaceRole[] {
  if (role === "owner") return ASSIGNABLE_BY_OWNER;
  if (role === "admin") return ASSIGNABLE_BY_ADMIN;
  return [];
}

export function isWorkspaceRole(value: string): value is WorkspaceRole {
  return (WORKSPACE_ROLES as readonly string[]).includes(value);
}