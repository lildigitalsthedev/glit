export type ShareRole = "viewer" | "editor" | "developer" | "admin";

export const SHARE_ROLES: readonly ShareRole[] = ["viewer", "editor", "developer", "admin"] as const;

export const SHARE_ROLE_LABELS: Record<ShareRole, string> = {
  viewer: "Viewer",
  editor: "Editor",
  developer: "Developer",
  admin: "Admin",
};

export const SHARE_ROLE_DESCRIPTIONS: Record<ShareRole, string> = {
  viewer: "Browse files, read file contents and commit history. No edits, no downloads unless allowed.",
  editor: "Everything Viewer can do, plus create, edit and delete files.",
  developer: "Everything Editor can do, plus create branches and download/clone the repository.",
  admin: "Everything Developer can do, plus rename the repository and toggle archived status.",
};

export type ShareCapability =
  | "repo:view"
  | "repo:browse"
  | "repo:readFile"
  | "repo:commits"
  | "repo:branches"
  | "repo:download"
  | "repo:writeFile"
  | "repo:deleteFile"
  | "repo:createBranch"
  | "repo:adminSettings";

export interface AccessLinkSummary {
  id: string;
  fullName: string;
  role: ShareRole;
  tokenPrefix: string;
  allowDownload: boolean;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string;
  status: "active" | "revoked" | "expired" | "exhausted";
  createdAt: string;
  createdBy: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}