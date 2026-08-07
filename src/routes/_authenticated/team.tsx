import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, LogOut, Mail, Plus, Shield, Trash2, UserMinus, Users, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/empty-state";
import { CreateWorkspaceDialog, WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import {
  deleteWorkspace,
  inviteWorkspaceMember,
  leaveWorkspace,
  listMyInvitations,
  listWorkspaceInvitations,
  listWorkspaceMembers,
  removeWorkspaceMember,
  respondToInvitation,
  revokeWorkspaceInvitation,
  setWorkspaceArchived,
  setWorkspaceMemberRole,
  transferWorkspaceOwnership,
  updateWorkspace,
} from "@/lib/workspaces.functions";
import {
  assignableRoles,
  WORKSPACE_ROLE_DESCRIPTIONS,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from "@/lib/workspaces/permissions";

export const Route = createFileRoute("/_authenticated/team")({
  head: () => ({
    meta: [
      { title: "Team & workspaces — GitPush" },
      {
        name: "description",
        content: "Manage your GitPush workspaces, invite teammates and set per-workspace roles.",
      },
      { property: "og:title", content: "Team & workspaces — GitPush" },
      {
        property: "og:description",
        content: "Manage your GitPush workspaces, invite teammates and set per-workspace roles.",
      },
    ],
  }),
  component: TeamPage,
});

function TeamPage() {
  const { activeWorkspace, isLoading, can } = useWorkspaces();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <main className="mx-auto w-full max-w-3xl px-3 py-4">
      <header className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="font-mono text-base font-semibold">Team &amp; workspaces</h1>
          <p className="text-xs text-muted-foreground">
            Repositories, activity and AI settings are scoped to the active workspace.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          New
        </Button>
      </header>

      <div className="mt-3 max-w-xs">
        <WorkspaceSwitcher />
      </div>

      <PendingInvitations />

      {isLoading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : !activeWorkspace ? (
        <EmptyState
          icon={Users}
          title="No workspace"
          description="Create a team workspace to collaborate with others."
        />
      ) : (
        <Tabs defaultValue="members" className="mt-4">
          <TabsList>
            <TabsTrigger value="members">Members</TabsTrigger>
            <TabsTrigger value="invitations">Invitations</TabsTrigger>
            <TabsTrigger value="settings">Settings</TabsTrigger>
          </TabsList>

          <TabsContent value="members" className="mt-3">
            <MembersTab workspaceId={activeWorkspace.id} />
          </TabsContent>
          <TabsContent value="invitations" className="mt-3">
            {activeWorkspace.isPersonal ? (
              <p className="text-sm text-muted-foreground">
                Your personal workspace is private. Create a team workspace to invite people.
              </p>
            ) : can("members:invite") ? (
              <InvitationsTab workspaceId={activeWorkspace.id} />
            ) : (
              <p className="text-sm text-muted-foreground">
                Only Admins and the workspace Owner can manage invitations.
              </p>
            )}
          </TabsContent>
          <TabsContent value="settings" className="mt-3">
            <SettingsTab workspaceId={activeWorkspace.id} />
          </TabsContent>
        </Tabs>
      )}

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </main>
  );
}

/** Invitations addressed to the signed-in user, matched server-side on email. */
function PendingInvitations() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listMyInvitations);
  const respondFn = useServerFn(respondToInvitation);
  const query = useQuery({ queryKey: ["my-invitations"], queryFn: () => listFn() });

  const respond = useMutation({
    mutationFn: (input: { invitationId: string; accept: boolean }) => respondFn({ data: input }),
    onSuccess: async (_result, input) => {
      toast.success(input.accept ? "Invitation accepted" : "Invitation declined");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const invitations = query.data ?? [];
  if (invitations.length === 0) return null;

  return (
    <section className="mt-3 space-y-2">
      {invitations.map((invitation) => (
        <div
          key={invitation.id}
          className="flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2.5"
        >
          <Mail className="size-4 text-primary" />
          <p className="min-w-0 flex-1 text-sm">
            You've been invited to <span className="font-medium">{invitation.workspaceName}</span> as{" "}
            {WORKSPACE_ROLE_LABELS[invitation.role]}.
          </p>
          <Button
            size="sm"
            disabled={respond.isPending}
            onClick={() => respond.mutate({ invitationId: invitation.id, accept: true })}
          >
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={respond.isPending}
            onClick={() => respond.mutate({ invitationId: invitation.id, accept: false })}
          >
            Decline
          </Button>
        </div>
      ))}
    </section>
  );
}

function MembersTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const { role, can, activeWorkspace } = useWorkspaces();
  const listFn = useServerFn(listWorkspaceMembers);
  const setRoleFn = useServerFn(setWorkspaceMemberRole);
  const removeFn = useServerFn(removeWorkspaceMember);
  const transferFn = useServerFn(transferWorkspaceOwnership);

  const query = useQuery({
    queryKey: ["workspace-members", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
  });

  const setRole = useMutation({
    mutationFn: (input: { targetUserId: string; role: WorkspaceRole }) =>
      setRoleFn({ data: { workspaceId, ...input } }),
    onSuccess: async () => {
      toast.success("Role updated");
      await queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: (targetUserId: string) => removeFn({ data: { workspaceId, targetUserId } }),
    onSuccess: async () => {
      toast.success("Member removed");
      await queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const transfer = useMutation({
    mutationFn: (targetUserId: string) => transferFn({ data: { workspaceId, targetUserId } }),
    onSuccess: async () => {
      toast.success("Ownership transferred");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <Skeleton className="h-24 w-full" />;
  const members = query.data ?? [];
  const options = assignableRoles(role);

  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div key={member.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2.5">
          <Avatar className="size-8">
            {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-xs">
              {(member.displayName ?? member.email ?? "?").slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{member.displayName ?? member.email ?? "Unknown"}</p>
            <p className="truncate font-mono text-xs text-muted-foreground">{member.email ?? member.userId}</p>
          </div>

          {member.role === "owner" || !can("members:setRole") || options.length === 0 ? (
            <Badge variant="secondary" className="gap-1">
              {member.role === "owner" ? <Shield className="size-3" /> : null}
              {WORKSPACE_ROLE_LABELS[member.role]}
            </Badge>
          ) : (
            <Select
              value={member.role}
              onValueChange={(value) =>
                setRole.mutate({ targetUserId: member.userId, role: value as WorkspaceRole })
              }
            >
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option} value={option} className="text-xs">
                    {WORKSPACE_ROLE_LABELS[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {can("workspace:transfer") && member.role !== "owner" ? (
            <Button
              size="sm"
              variant="ghost"
              title="Transfer ownership"
              disabled={transfer.isPending}
              onClick={() => transfer.mutate(member.userId)}
            >
              <Shield className="size-4" />
            </Button>
          ) : null}

          {can("members:remove") && member.role !== "owner" ? (
            <Button
              size="sm"
              variant="ghost"
              title="Remove from workspace"
              disabled={remove.isPending}
              onClick={() => remove.mutate(member.userId)}
            >
              <UserMinus className="size-4 text-destructive" />
            </Button>
          ) : null}
        </div>
      ))}

      {activeWorkspace?.isPersonal ? (
        <p className="text-xs text-muted-foreground">
          Your personal workspace always has exactly one member — you.
        </p>
      ) : (
        <div className="pt-1">
          <p className="label-caps text-muted-foreground">Roles</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {(["admin", "developer", "viewer"] as const).map((entry) => (
              <li key={entry}>
                <span className="text-foreground">{WORKSPACE_ROLE_LABELS[entry]}</span> —{" "}
                {WORKSPACE_ROLE_DESCRIPTIONS[entry]}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InvitationsTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const { role } = useWorkspaces();
  const listFn = useServerFn(listWorkspaceInvitations);
  const inviteFn = useServerFn(inviteWorkspaceMember);
  const revokeFn = useServerFn(revokeWorkspaceInvitation);

  const options = assignableRoles(role);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<WorkspaceRole>("developer");

  const query = useQuery({
    queryKey: ["workspace-invitations", workspaceId],
    queryFn: () => listFn({ data: { workspaceId } }),
  });

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { workspaceId, email, role: inviteRole } }),
    onSuccess: async () => {
      toast.success(`Invitation created for ${email}`);
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const revoke = useMutation({
    mutationFn: (invitationId: string) => revokeFn({ data: { invitationId } }),
    onSuccess: async () => {
      toast.success("Invitation revoked");
      await queryClient.invalidateQueries({ queryKey: ["workspace-invitations", workspaceId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const invitations = query.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border p-2.5">
        <div className="min-w-40 flex-1 space-y-1.5">
          <Label htmlFor="invite-email">Invite by email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="teammate@company.com"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Role</Label>
          <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as WorkspaceRole)}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option} value={option}>
                  {WORKSPACE_ROLE_LABELS[option]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={() => invite.mutate()} disabled={!email.trim() || invite.isPending} className="gap-1.5">
          {invite.isPending ? <Loader2 className="size-4 animate-spin" /> : <Mail className="size-4" />}
          Invite
        </Button>
      </div>

      {query.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : invitations.length === 0 ? (
        <p className="text-sm text-muted-foreground">No invitations yet.</p>
      ) : (
        <div className="space-y-2">
          {invitations.map((invitation) => (
            <div
              key={invitation.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2.5"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm">{invitation.email}</p>
                <p className="text-xs text-muted-foreground">
                  {WORKSPACE_ROLE_LABELS[invitation.role]} · {invitation.status}
                </p>
              </div>
              {invitation.status === "pending" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Revoke invitation"
                  disabled={revoke.isPending}
                  onClick={() => revoke.mutate(invitation.id)}
                >
                  <X className="size-4 text-destructive" />
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Invitations are matched to the invited email address when that person signs in — they'll see them on this
        page.
      </p>
    </div>
  );
}

function SettingsTab({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const { activeWorkspace, can } = useWorkspaces();
  const updateFn = useServerFn(updateWorkspace);
  const archiveFn = useServerFn(setWorkspaceArchived);
  const deleteFn = useServerFn(deleteWorkspace);
  const leaveFn = useServerFn(leaveWorkspace);

  const [name, setName] = useState(activeWorkspace?.name ?? "");
  const [description, setDescription] = useState(activeWorkspace?.description ?? "");

  // Keep the form in step with workspace switching.
  useEffect(() => {
    setName(activeWorkspace?.name ?? "");
    setDescription(activeWorkspace?.description ?? "");
  }, [activeWorkspace?.id, activeWorkspace?.name, activeWorkspace?.description]);

  const save = useMutation({
    mutationFn: () => updateFn({ data: { workspaceId, name, description: description || null } }),
    onSuccess: async () => {
      toast.success("Workspace updated");
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) => archiveFn({ data: { workspaceId, archived } }),
    onSuccess: async () => {
      toast.success("Workspace updated");
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const destroy = useMutation({
    mutationFn: () => deleteFn({ data: { workspaceId } }),
    onSuccess: async () => {
      toast.success("Workspace deleted");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const leave = useMutation({
    mutationFn: () => leaveFn({ data: { workspaceId } }),
    onSuccess: async () => {
      toast.success("You left the workspace");
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (!activeWorkspace) return null;
  const editable = can("workspace:update") && !activeWorkspace.isPersonal;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-md border border-border p-2.5">
        <div className="space-y-1.5">
          <Label htmlFor="ws-name">Name</Label>
          <Input
            id="ws-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!editable}
            maxLength={60}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ws-description">Description</Label>
          <Textarea
            id="ws-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={!editable}
            rows={2}
          />
        </div>
        {editable ? (
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending || !name.trim()}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Save changes
          </Button>
        ) : (
          <p className="text-xs text-muted-foreground">
            {activeWorkspace.isPersonal
              ? "Your personal workspace can't be renamed, archived or deleted."
              : "Only Admins and the workspace Owner can change these settings."}
          </p>
        )}
      </div>

      {!activeWorkspace.isPersonal ? (
        <div className="space-y-2 rounded-md border border-destructive/30 p-2.5">
          <p className="label-caps text-muted-foreground">Danger zone</p>
          <div className="flex flex-wrap gap-2">
            {can("workspace:archive") ? (
              <Button
                size="sm"
                variant="outline"
                disabled={archive.isPending}
                onClick={() => archive.mutate(!activeWorkspace.archivedAt)}
              >
                {activeWorkspace.archivedAt ? "Unarchive" : "Archive"} workspace
              </Button>
            ) : null}
            {can("workspace:delete") ? (
              <Button
                size="sm"
                variant="destructive"
                className="gap-1.5"
                disabled={destroy.isPending}
                onClick={() => {
                  if (window.confirm(`Delete “${activeWorkspace.name}”? This can't be undone.`)) destroy.mutate();
                }}
              >
                <Trash2 className="size-4" />
                Delete workspace
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                disabled={leave.isPending}
                onClick={() => leave.mutate()}
              >
                <LogOut className="size-4" />
                Leave workspace
              </Button>
            )}
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        Looking for repositories? Head to <Link to="/app" className="text-primary underline">Repositories</Link>.
      </p>
    </div>
  );
}