// Server-only. Uses the service-role Supabase client (bypasses RLS), so it
// must never be imported from anything that reaches the browser — route and
// *.functions.ts files reach it only via `await import()` inside a handler.
//
// Every function here that can change something takes the *caller's* id and
// re-derives their workspace role from the database before acting. The client
// never gets to say what role it has; `@/lib/workspaces/permissions` is only
// used to decide what to show.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { can, type WorkspaceCapability, type WorkspaceRole } from "./permissions";

export interface WorkspaceRecord {
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

export interface MemberRecord {
  id: string;
  userId: string;
  role: WorkspaceRole;
  displayName: string | null;
  email: string | null;
  avatarUrl: string | null;
  lastActiveAt: string | null;
  joinedAt: string;
}

export interface InvitationRecord {
  id: string;
  workspaceId: string;
  workspaceName: string;
  email: string;
  role: WorkspaceRole;
  status: "pending" | "accepted" | "rejected" | "revoked";
  expiresAt: string;
  createdAt: string;
  invitedByName: string | null;
}

const WORKSPACE_COLUMNS =
  "id, owner_id, name, description, avatar_url, is_personal, default_branch, default_folder, archived_at, created_at";

/** Throws unless the caller's role in this workspace allows `capability`. */
export async function requireCapability(
  userId: string,
  workspaceId: string,
  capability: WorkspaceCapability,
): Promise<WorkspaceRole> {
  const role = await getMemberRole(userId, workspaceId);
  if (!role) throw new Error("You don't have access to this workspace.");
  if (!can(role, capability)) {
    throw new Error("Your role in this workspace doesn't allow that.");
  }
  return role;
}

export async function getMemberRole(userId: string, workspaceId: string): Promise<WorkspaceRole | null> {
  const { data, error } = await supabaseAdmin
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.role as WorkspaceRole | undefined) ?? null;
}

/** Personal workspaces are created by the signup trigger; this backfills. */
export async function ensurePersonalWorkspace(userId: string): Promise<string> {
  const { data: existing, error } = await supabaseAdmin
    .from("workspaces")
    .select("id")
    .eq("owner_id", userId)
    .eq("is_personal", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (existing) return existing.id;

  const { data: created, error: createError } = await supabaseAdmin
    .from("workspaces")
    .insert({ owner_id: userId, name: "Personal Workspace", description: "Your private space", is_personal: true })
    .select("id")
    .single();
  if (createError) throw new Error(createError.message);
  const { error: memberError } = await supabaseAdmin
    .from("workspace_members")
    .insert({ workspace_id: created.id, user_id: userId, role: "owner" });
  if (memberError) throw new Error(memberError.message);
  return created.id;
}

export async function listMyWorkspaces(userId: string): Promise<WorkspaceRecord[]> {
  await ensurePersonalWorkspace(userId);

  const { data: memberships, error } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id, role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const ids = (memberships ?? []).map((row) => row.workspace_id);
  if (ids.length === 0) return [];

  const roleByWorkspace = new Map(
    (memberships ?? []).map((row) => [row.workspace_id, row.role as WorkspaceRole]),
  );

  const { data: rows, error: wsError } = await supabaseAdmin
    .from("workspaces")
    .select(WORKSPACE_COLUMNS)
    .in("id", ids)
    .order("is_personal", { ascending: false })
    .order("created_at", { ascending: true });
  if (wsError) throw new Error(wsError.message);

  const { data: counts, error: countError } = await supabaseAdmin
    .from("workspace_members")
    .select("workspace_id")
    .in("workspace_id", ids);
  if (countError) throw new Error(countError.message);
  const memberCounts = new Map<string, number>();
  for (const row of counts ?? []) {
    memberCounts.set(row.workspace_id, (memberCounts.get(row.workspace_id) ?? 0) + 1);
  }

  return (rows ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    avatarUrl: row.avatar_url,
    isPersonal: row.is_personal,
    defaultBranch: row.default_branch,
    defaultFolder: row.default_folder,
    archivedAt: row.archived_at,
    ownerId: row.owner_id,
    role: roleByWorkspace.get(row.id) ?? "viewer",
    memberCount: memberCounts.get(row.id) ?? 1,
    createdAt: row.created_at,
  }));
}

export async function getWorkspace(userId: string, workspaceId: string): Promise<WorkspaceRecord> {
  const all = await listMyWorkspaces(userId);
  const found = all.find((workspace) => workspace.id === workspaceId);
  if (!found) throw new Error("You don't have access to this workspace.");
  return found;
}

export async function createTeamWorkspace(
  userId: string,
  input: { name: string; description?: string | null; avatarUrl?: string | null },
): Promise<WorkspaceRecord> {
  const name = input.name.trim();
  if (!name) throw new Error("Give the workspace a name.");
  if (name.length > 60) throw new Error("Workspace names are limited to 60 characters.");

  const { data: created, error } = await supabaseAdmin
    .from("workspaces")
    .insert({
      owner_id: userId,
      name,
      description: input.description?.trim() || null,
      avatar_url: input.avatarUrl?.trim() || null,
      is_personal: false,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { error: memberError } = await supabaseAdmin
    .from("workspace_members")
    .insert({ workspace_id: created.id, user_id: userId, role: "owner" });
  if (memberError) throw new Error(memberError.message);

  return getWorkspace(userId, created.id);
}

export async function updateWorkspace(
  userId: string,
  workspaceId: string,
  patch: {
    name?: string;
    description?: string | null;
    avatarUrl?: string | null;
    defaultBranch?: string | null;
    defaultFolder?: string | null;
  },
): Promise<WorkspaceRecord> {
  await requireCapability(userId, workspaceId, "workspace:update");
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Give the workspace a name.");
    update["name"] = name;
  }
  if (patch.description !== undefined) update["description"] = patch.description?.trim() || null;
  if (patch.avatarUrl !== undefined) update["avatar_url"] = patch.avatarUrl?.trim() || null;
  if (patch.defaultBranch !== undefined) update["default_branch"] = patch.defaultBranch?.trim() || null;
  if (patch.defaultFolder !== undefined) update["default_folder"] = patch.defaultFolder?.trim() || null;

  if (Object.keys(update).length > 0) {
    const { error } = await supabaseAdmin.from("workspaces").update(update).eq("id", workspaceId);
    if (error) throw new Error(error.message);
  }
  return getWorkspace(userId, workspaceId);
}

export async function setWorkspaceArchived(
  userId: string,
  workspaceId: string,
  archived: boolean,
): Promise<WorkspaceRecord> {
  await requireCapability(userId, workspaceId, "workspace:archive");
  const workspace = await getWorkspace(userId, workspaceId);
  if (workspace.isPersonal) throw new Error("Your personal workspace can't be archived.");
  const { error } = await supabaseAdmin
    .from("workspaces")
    .update({ archived_at: archived ? new Date().toISOString() : null })
    .eq("id", workspaceId);
  if (error) throw new Error(error.message);
  return getWorkspace(userId, workspaceId);
}

export async function deleteWorkspace(userId: string, workspaceId: string): Promise<void> {
  await requireCapability(userId, workspaceId, "workspace:delete");
  const workspace = await getWorkspace(userId, workspaceId);
  if (workspace.isPersonal) throw new Error("Your personal workspace can't be deleted.");
  const { error } = await supabaseAdmin.from("workspaces").delete().eq("id", workspaceId);
  if (error) throw new Error(error.message);

  // Anyone left pointing at the deleted workspace falls back to personal.
  await supabaseAdmin
    .from("user_preferences")
    .update({ active_workspace_id: null })
    .eq("active_workspace_id", workspaceId);
}

/**
 * Hands the Owner role to an existing member and steps the previous owner
 * down to Admin, so a workspace always has exactly one owner and the person
 * transferring doesn't accidentally lock themselves out entirely.
 */
export async function transferOwnership(
  userId: string,
  workspaceId: string,
  targetUserId: string,
): Promise<void> {
  await requireCapability(userId, workspaceId, "workspace:transfer");
  const workspace = await getWorkspace(userId, workspaceId);
  if (workspace.isPersonal) throw new Error("Your personal workspace can't be transferred.");
  if (targetUserId === userId) throw new Error("You already own this workspace.");

  const targetRole = await getMemberRole(targetUserId, workspaceId);
  if (!targetRole) throw new Error("That person isn't a member of this workspace.");

  const { error: promoteError } = await supabaseAdmin
    .from("workspace_members")
    .update({ role: "owner" })
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUserId);
  if (promoteError) throw new Error(promoteError.message);

  const { error: demoteError } = await supabaseAdmin
    .from("workspace_members")
    .update({ role: "admin" })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (demoteError) throw new Error(demoteError.message);

  const { error: ownerError } = await supabaseAdmin
    .from("workspaces")
    .update({ owner_id: targetUserId })
    .eq("id", workspaceId);
  if (ownerError) throw new Error(ownerError.message);
}

export async function listMembers(userId: string, workspaceId: string): Promise<MemberRecord[]> {
  await requireCapability(userId, workspaceId, "members:view");
  const { data: rows, error } = await supabaseAdmin
    .from("workspace_members")
    .select("id, user_id, role, last_active_at, created_at")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const ids = (rows ?? []).map((row) => row.user_id);
  const profiles = new Map<string, { display_name: string | null; avatar_url: string | null }>();
  if (ids.length > 0) {
    const { data: profileRows, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, display_name, avatar_url")
      .in("id", ids);
    if (profileError) throw new Error(profileError.message);
    for (const profile of profileRows ?? []) {
      profiles.set(profile.id, { display_name: profile.display_name, avatar_url: profile.avatar_url });
    }
  }

  const members: MemberRecord[] = [];
  for (const row of rows ?? []) {
    // Emails live in auth, not profiles, so they need the admin API.
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    const profile = profiles.get(row.user_id);
    members.push({
      id: row.id,
      userId: row.user_id,
      role: row.role as WorkspaceRole,
      displayName: profile?.display_name ?? null,
      email: authUser?.user?.email ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      lastActiveAt: row.last_active_at,
      joinedAt: row.created_at,
    });
  }
  return members;
}

export async function setMemberRole(
  userId: string,
  workspaceId: string,
  targetUserId: string,
  role: WorkspaceRole,
): Promise<void> {
  const callerRole = await requireCapability(userId, workspaceId, "members:setRole");
  if (targetUserId === userId) throw new Error("You can't change your own role.");
  if (role === "owner") throw new Error("Use Transfer ownership to make someone the Owner.");

  const targetRole = await getMemberRole(targetUserId, workspaceId);
  if (!targetRole) throw new Error("That person isn't a member of this workspace.");
  if (targetRole === "owner") throw new Error("The Owner's role can't be changed here.");
  // Admins manage Developers and Viewers; only the Owner touches Admins.
  if (callerRole === "admin" && (role === "admin" || targetRole === "admin")) {
    throw new Error("Only the workspace Owner can manage Admins.");
  }

  const { error } = await supabaseAdmin
    .from("workspace_members")
    .update({ role })
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUserId);
  if (error) throw new Error(error.message);
}

export async function removeMember(userId: string, workspaceId: string, targetUserId: string): Promise<void> {
  const callerRole = await requireCapability(userId, workspaceId, "members:remove");
  if (targetUserId === userId) throw new Error("Leave the workspace instead of removing yourself.");

  const targetRole = await getMemberRole(targetUserId, workspaceId);
  if (!targetRole) throw new Error("That person isn't a member of this workspace.");
  if (targetRole === "owner") throw new Error("The Owner can't be removed. Transfer ownership first.");
  if (callerRole === "admin" && targetRole === "admin") {
    throw new Error("Only the workspace Owner can remove an Admin.");
  }

  const { error } = await supabaseAdmin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", targetUserId);
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("user_preferences")
    .update({ active_workspace_id: null })
    .eq("user_id", targetUserId)
    .eq("active_workspace_id", workspaceId);
}

export async function leaveWorkspace(userId: string, workspaceId: string): Promise<void> {
  const role = await getMemberRole(userId, workspaceId);
  if (!role) throw new Error("You're not a member of this workspace.");
  if (role === "owner") throw new Error("Transfer ownership before leaving this workspace.");

  const { error } = await supabaseAdmin
    .from("workspace_members")
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  await supabaseAdmin
    .from("user_preferences")
    .update({ active_workspace_id: null })
    .eq("user_id", userId)
    .eq("active_workspace_id", workspaceId);
}

export async function inviteMember(
  userId: string,
  workspaceId: string,
  email: string,
  role: WorkspaceRole,
): Promise<void> {
  const callerRole = await requireCapability(userId, workspaceId, "members:invite");
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("Enter a valid email address.");
  if (role === "owner") throw new Error("You can't invite someone as Owner.");
  if (callerRole === "admin" && role === "admin") {
    throw new Error("Only the workspace Owner can invite Admins.");
  }

  const workspace = await getWorkspace(userId, workspaceId);
  if (workspace.isPersonal) throw new Error("Create a team workspace to invite people.");

  const { error } = await supabaseAdmin.from("workspace_invitations").insert({
    workspace_id: workspaceId,
    email: normalized,
    role,
    invited_by: userId,
  });
  if (error) {
    if (error.code === "23505" || error.message.includes("duplicate")) {
      throw new Error("There's already a pending invitation for that email.");
    }
    throw new Error(error.message);
  }
}

export async function listInvitations(userId: string, workspaceId: string): Promise<InvitationRecord[]> {
  await requireCapability(userId, workspaceId, "members:view");
  const workspace = await getWorkspace(userId, workspaceId);
  const { data, error } = await supabaseAdmin
    .from("workspace_invitations")
    .select("id, workspace_id, email, role, status, expires_at, created_at, invited_by")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    workspaceId: row.workspace_id,
    workspaceName: workspace.name,
    email: row.email,
    role: row.role as WorkspaceRole,
    status: row.status as InvitationRecord["status"],
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    invitedByName: null,
  }));
}

export async function revokeInvitation(userId: string, invitationId: string): Promise<void> {
  const { data: invitation, error } = await supabaseAdmin
    .from("workspace_invitations")
    .select("id, workspace_id, status")
    .eq("id", invitationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!invitation) throw new Error("Invitation not found.");
  await requireCapability(userId, invitation.workspace_id, "members:invite");

  const { error: updateError } = await supabaseAdmin
    .from("workspace_invitations")
    .update({ status: "revoked", responded_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (updateError) throw new Error(updateError.message);
}

/** Invitations addressed to the signed-in user's own email. */
export async function listMyInvitations(email: string | null | undefined): Promise<InvitationRecord[]> {
  if (!email) return [];
  const { data, error } = await supabaseAdmin
    .from("workspace_invitations")
    .select("id, workspace_id, email, role, status, expires_at, created_at, workspaces(name)")
    .eq("email", email.toLowerCase())
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => {
    const workspace = row.workspaces as { name?: string } | null;
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      workspaceName: workspace?.name ?? "Workspace",
      email: row.email,
      role: row.role as WorkspaceRole,
      status: "pending" as const,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      invitedByName: null,
    };
  });
}

/**
 * Accept/reject is matched on the invited email address rather than an id the
 * client picks, so a user can only ever respond to invitations that were
 * actually addressed to them.
 */
export async function respondToInvitation(
  userId: string,
  email: string | null | undefined,
  invitationId: string,
  accept: boolean,
): Promise<{ workspaceId: string | null }> {
  if (!email) throw new Error("Your account has no email address to match invitations against.");
  const { data: invitation, error } = await supabaseAdmin
    .from("workspace_invitations")
    .select("id, workspace_id, email, role, status, expires_at")
    .eq("id", invitationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!invitation) throw new Error("Invitation not found.");
  if (invitation.email.toLowerCase() !== email.toLowerCase()) {
    throw new Error("That invitation wasn't sent to your account.");
  }
  if (invitation.status !== "pending") throw new Error("That invitation is no longer pending.");
  if (new Date(invitation.expires_at).getTime() < Date.now()) throw new Error("That invitation has expired.");

  const { error: statusError } = await supabaseAdmin
    .from("workspace_invitations")
    .update({ status: accept ? "accepted" : "rejected", responded_at: new Date().toISOString() })
    .eq("id", invitationId);
  if (statusError) throw new Error(statusError.message);

  if (!accept) return { workspaceId: null };

  const { error: memberError } = await supabaseAdmin
    .from("workspace_members")
    .upsert(
      { workspace_id: invitation.workspace_id, user_id: userId, role: invitation.role },
      { onConflict: "workspace_id,user_id" },
    );
  if (memberError) throw new Error(memberError.message);
  return { workspaceId: invitation.workspace_id };
}

export async function getActiveWorkspaceId(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("user_preferences")
    .select("active_workspace_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const active = data?.active_workspace_id;
  if (active && (await getMemberRole(userId, active))) return active;

  const personal = await ensurePersonalWorkspace(userId);
  await setActiveWorkspace(userId, personal);
  return personal;
}

export async function setActiveWorkspace(userId: string, workspaceId: string): Promise<void> {
  const role = await getMemberRole(userId, workspaceId);
  if (!role) throw new Error("You don't have access to this workspace.");
  const { error } = await supabaseAdmin
    .from("user_preferences")
    .upsert({ user_id: userId, active_workspace_id: workspaceId }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  await supabaseAdmin
    .from("workspace_members")
    .update({ last_active_at: new Date().toISOString() })
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId);
}