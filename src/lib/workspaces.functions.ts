import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { WorkspaceRole } from "@/lib/workspaces/permissions";

export interface WorkspaceDto {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  isPersonal: boolean;
  defaultBranch: string | null;
  defaultFolder: string | null;
  archivedAt: string | null;
  ownerId: string;
  role: WorkspaceRole;
  memberCount: number;
  createdAt: string;
}

export interface MemberDto {
  id: string;
  userId: string;
  role: WorkspaceRole;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  lastActiveAt: string | null;
  joinedAt: string;
}

export interface InvitationDto {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: WorkspaceRole;
  status: "pending" | "accepted" | "rejected" | "revoked";
  expiresAt: string;
  createdAt: string;
}

/** Every workspace the caller belongs to, plus which one is currently active. */
export const listWorkspaces = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ workspaces: WorkspaceDto[]; activeWorkspaceId: string }> => {
    const store = await import("./workspaces/store.server");
    const [workspaces, activeWorkspaceId] = await Promise.all([
      store.listMyWorkspaces(context.userId),
      store.getActiveWorkspaceId(context.userId),
    ]);
    return { workspaces, activeWorkspaceId };
  });

export const setActiveWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    const store = await import("./workspaces/store.server");
    await store.setActiveWorkspace(context.userId, data.workspaceId);
    return { ok: true };
  });

/**
 * Team workspaces are a Pro feature (personal workspaces stay free), so this
 * is gated on the server rather than only hiding the button.
 */
export const createWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { name: string; description?: string | null }) => data)
  .handler(async ({ data, context }): Promise<WorkspaceDto> => {
    const { assertTeamsPlan } = await import("./workspaces/plan.server");
    await assertTeamsPlan(context.userId);
    const store = await import("./workspaces/store.server");
    const created = await store.createTeamWorkspace(context.userId, {
      name: data.name,
      description: data.description ?? null,
    });
    await store.setActiveWorkspace(context.userId, created.id);
    return created;
  });

export const updateWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      workspaceId: string;
      name?: string;
      description?: string | null;
      defaultBranch?: string | null;
      defaultFolder?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<WorkspaceDto> => {
    const store = await import("./workspaces/store.server");
    const { workspaceId, ...patch } = data;
    return store.updateWorkspace(context.userId, workspaceId, patch);
  });

export const setWorkspaceArchived = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string; archived: boolean }) => data)
  .handler(async ({ data, context }): Promise<WorkspaceDto> => {
    const store = await import("./workspaces/store.server");
    return store.setWorkspaceArchived(context.userId, data.workspaceId, data.archived);
  });

export const deleteWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    const store = await import("./workspaces/store.server");
    await store.deleteWorkspace(context.userId, data.workspaceId);
    return { ok: true };
  });

export const transferWorkspaceOwnership = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string; targetUserId: string }) => data)
  .handler(async ({ data, context }) => {
    const store = await import("./workspaces/store.server");
    await store.transferOwnership(context.userId, data.workspaceId, data.targetUserId);
    return { ok: true };
  });

export const listWorkspaceMembers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }): Promise<MemberDto[]> => {
    const store = await import("./workspaces/store.server");
    return store.listMembers(context.userId, data.workspaceId);
  });

export const setWorkspaceMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string; targetUserId: string; role: WorkspaceRole }) => data)
  .handler(async ({ data, context }) => {
    const store = await import("./workspaces/store.server");
    await store.setMemberRole(context.userId, data.workspaceId, data.targetUserId, data.role);
    return { ok: true };
  });

export const removeWorkspaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string; targetUserId: string }) => data)
  .handler(async ({ data, context }) => {
    const store = await import("./workspaces/store.server");
    await store.removeMember(context.userId, data.workspaceId, data.targetUserId);
    return { ok: true };
  });

export const leaveWorkspace = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }) => {
    const store = await import("./workspaces/store.server");
    await store.leaveWorkspace(context.userId, data.workspaceId);
    return { ok: true };
  });

export const inviteWorkspaceMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string; email: string; role: WorkspaceRole }) => data)
  .handler(async ({ data, context }) => {
    const store = await import("./workspaces/store.server");
    await store.inviteMember(context.userId, data.workspaceId, data.email, data.role);
    return { ok: true };
  });

export const listWorkspaceInvitations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { workspaceId: string }) => data)
  .handler(async ({ data, context }): Promise<InvitationDto[]> => {
    const store = await import("./workspaces/store.server");
    return store.listInvitations(context.userId, data.workspaceId);
  });

export const revokeWorkspaceInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invitationId: string }) => data)
  .handler(async ({ data, context }) => {
    const store = await import("./workspaces/store.server");
    await store.revokeInvitation(context.userId, data.invitationId);
    return { ok: true };
  });

/** Invitations waiting for the signed-in user, shown as a banner in Team. */
export const listMyInvitations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InvitationDto[]> => {
    const store = await import("./workspaces/store.server");
    return store.listMyInvitations(context.claims.email as string | undefined);
  });

export const respondToInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { invitationId: string; accept: boolean }) => data)
  .handler(async ({ data, context }) => {
    const store = await import("./workspaces/store.server");
    const result = await store.respondToInvitation(
      context.userId,
      context.claims.email as string | undefined,
      data.invitationId,
      data.accept,
    );
    if (result.workspaceId) {
      await store.setActiveWorkspace(context.userId, result.workspaceId);
    }
    return result;
  });