import { createFileRoute, Link } from "@tanstack/react-router";
import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Loader2,
  LogOut,
  Mail,
  Plus,
  Shield,
  SearchX,
  Trash2,
  Users,
  X,
  History,
  FolderPlus,
  FolderMinus,
  GitCommitHorizontal,
  Sparkles,
  Wand2,
  FileText,
  UserPlus,
  UserMinus,
  Settings2,
  ChevronDown,
} from "lucide-react";
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
import { SearchInput } from "@/components/search-input";
import { MemberProfileDrawer } from "@/components/member-profile-drawer";
import { CreateWorkspaceDialog, WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useAuth } from "@/hooks/useAuth";
import { getMemberStatus, presenceDotClass } from "@/lib/member-status";
import { cn } from "@/lib/utils";
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
  type MemberDto,
} from "@/lib/workspaces.functions";
import {
  assignableRoles,
  WORKSPACE_ROLE_DESCRIPTIONS,
  WORKSPACE_ROLE_LABELS,
  type WorkspaceRole,
} from "@/lib/workspaces/permissions";
import { listWorkspaceActivity } from "@/lib/activity.functions";
import type { ActivityEntry, WorkspaceActivityAction } from "@/lib/activity.functions";

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
            <TabsTrigger value="activity">Activity</TabsTrigger>
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
          <TabsContent value="activity" className="mt-3">
            <ActivityTab workspaceId={activeWorkspace.id} />
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
  const { user } = useAuth();
  const { role, can, activeWorkspace } = useWorkspaces();
  const listFn = useServerFn(listWorkspaceMembers);
  const setRoleFn = useServerFn(setWorkspaceMemberRole);
  const removeFn = useServerFn(removeWorkspaceMember);
  const transferFn = useServerFn(transferWorkspaceOwnership);

  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

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
      setSelectedMemberId(null);
      await queryClient.invalidateQueries({ queryKey: ["workspace-members", workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const transfer = useMutation({
    mutationFn: (targetUserId: string) => transferFn({ data: { workspaceId, targetUserId } }),
    onSuccess: async () => {
      toast.success("Ownership transferred");
      setSelectedMemberId(null);
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (query.isLoading) return <Skeleton className="h-24 w-full" />;
  const members = query.data ?? [];
  const options = assignableRoles(role);

  const trimmedSearch = deferredSearch.trim().toLowerCase();
  const filteredMembers = trimmedSearch
    ? members.filter((member) => {
        const haystack = `${member.displayName ?? ""} ${member.email ?? ""}`.toLowerCase();
        return haystack.includes(trimmedSearch);
      })
    : members;

  const selectedMember: MemberDto | null =
    members.find((member) => member.id === selectedMemberId) ?? null;

  return (
    <div className="space-y-2">
      {members.length > 1 ? (
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search members by name or email…"
          ariaLabel="Search members"
        />
      ) : null}

      {filteredMembers.length === 0 ? (
        <EmptyState
          icon={SearchX}
          title="No members match"
          description={`Nothing found for "${deferredSearch}".`}
          size="compact"
        />
      ) : (
        filteredMembers.map((member) => {
          const status = getMemberStatus(member.lastActiveAt);
          const name = member.displayName ?? member.email ?? "Unknown";
          return (
            <button
              key={member.id}
              type="button"
              onClick={() => setSelectedMemberId(member.id)}
              className="flex w-full flex-wrap items-center gap-2 rounded-md border border-border p-2.5 text-left transition-colors hover:bg-white/5"
            >
              <span className="relative shrink-0">
                <Avatar className="size-8">
                  {member.avatarUrl ? <AvatarImage src={member.avatarUrl} alt="" /> : null}
                  <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <span
                  className={cn(
                    "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background",
                    presenceDotClass(status.presence),
                  )}
                  aria-hidden
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{name}</p>
                <p className="truncate font-mono text-xs text-muted-foreground">{member.email ?? member.userId}</p>
              </div>

              <div className="flex flex-col items-end gap-1">
                <Badge variant="secondary" className="gap-1">
                  {member.role === "owner" ? <Shield className="size-3" /> : null}
                  {WORKSPACE_ROLE_LABELS[member.role]}
                </Badge>
                <span className="text-[11px] text-muted-foreground">{status.label}</span>
              </div>
            </button>
          );
        })
      )}

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

      <MemberProfileDrawer
        member={selectedMember}
        open={selectedMember !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedMemberId(null);
        }}
        isSelf={selectedMember !== null && selectedMember.userId === user?.id}
        roleOptions={options}
        canSetRole={can("members:setRole")}
        canRemove={can("members:remove")}
        canTransfer={can("workspace:transfer")}
        onSetRole={(nextRole) => {
          if (selectedMember) setRole.mutate({ targetUserId: selectedMember.userId, role: nextRole });
        }}
        onRemove={() => {
          if (selectedMember) remove.mutate(selectedMember.userId);
        }}
        onTransfer={() => {
          if (selectedMember) transfer.mutate(selectedMember.userId);
        }}
        isSettingRole={setRole.isPending}
        isRemoving={remove.isPending}
        isTransferring={transfer.isPending}
      />
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

const ACTIVITY_META: Record<WorkspaceActivityAction, { label: string; icon: typeof History }> = {
  repository_created: { label: "Repository created", icon: FolderPlus },
  repository_deleted: { label: "Repository deleted", icon: FolderMinus },
  push_completed: { label: "Push completed", icon: GitCommitHorizontal },
  ai_generation: { label: "AI generation", icon: Sparkles },
  ai_edit: { label: "AI edit", icon: Wand2 },
  prompt_created: { label: "Prompt created", icon: FileText },
  member_joined: { label: "Member joined", icon: UserPlus },
  member_removed: { label: "Member removed", icon: UserMinus },
  workspace_updated: { label: "Workspace updated", icon: Settings2 },
};

/** Feature 6: Team Activity Feed. Every workspace role — including Viewer — can see this, since `activity:view` is in every role's capability set. */
function ActivityTab({ workspaceId }: { workspaceId: string }) {
  const listFn = useServerFn(listWorkspaceActivity);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const query = useInfiniteQuery({
    queryKey: ["workspace-activity", workspaceId],
    queryFn: ({ pageParam }: { pageParam: string | null }) =>
      listFn({ data: { workspaceId, before: pageParam } }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextBefore,
  });

  const entries: ActivityEntry[] = query.data?.pages.flatMap((page) => page.entries) ?? [];

  if (query.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return <p className="text-sm text-destructive">{(query.error as Error).message}</p>;
  }

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No activity yet"
        description="Repository, push, AI and team events in this workspace will show up here."
        size="compact"
      />
    );
  }

  return (
    <div className="space-y-2">
      <ul className="divide-y divide-border rounded-md border border-border">
        {entries.map((entry, index) => {
          const meta = ACTIVITY_META[entry.action] ?? { label: entry.action, icon: History };
          const Icon = meta.icon;
          const name = entry.actor?.displayName ?? "Someone";
          const hasDetails = entry.repoFullName || Object.keys(entry.metadata).length > 0;
          const isExpanded = expandedId === entry.id;
          return (
            <li
              key={entry.id}
              style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
              className="animate-in fade-in px-3 py-2.5 transition-colors duration-300"
            >
              <div className="flex items-start gap-2.5">
                <Avatar className="size-7 shrink-0">
                  {entry.actor?.avatarUrl ? <AvatarImage src={entry.actor.avatarUrl} alt="" /> : null}
                  <AvatarFallback className="text-[10px]">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="text-sm">
                    <span className="font-medium">{name}</span>{" "}
                    <span className="text-muted-foreground">{entry.summary}</span>
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Icon className="size-3" />
                    <span>{meta.label}</span>
                    {entry.repoFullName && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="font-mono">{entry.repoFullName}</span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <span>{formatDistanceToNowStrict(new Date(entry.createdAt), { addSuffix: true })}</span>
                    {hasDetails && (
                      <button
                        type="button"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                        className="ml-auto flex items-center gap-0.5 text-primary hover:underline"
                      >
                        View details
                        <ChevronDown className={cn("size-3 transition-transform", isExpanded && "rotate-180")} />
                      </button>
                    )}
                  </div>
                  {isExpanded && (
                    <dl className="mt-2 space-y-1 rounded-md border border-border bg-card p-2 font-mono text-[11px]">
                      {entry.repoFullName && (
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">repo</dt>
                          <dd className="min-w-0 flex-1 truncate">{entry.repoFullName}</dd>
                        </div>
                      )}
                      {Object.entries(entry.metadata).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <dt className="shrink-0 text-muted-foreground">{key}</dt>
                          <dd className="min-w-0 flex-1 truncate">
                            {typeof value === "string" ? value : JSON.stringify(value)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {query.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          disabled={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? <Loader2 className="size-3.5 animate-spin" /> : null}
          Load more
        </Button>
      )}
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