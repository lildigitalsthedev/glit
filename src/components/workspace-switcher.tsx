import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Loader2, Lock, Plus, User, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { usePlan } from "@/hooks/usePlan";
import { createWorkspace } from "@/lib/workspaces.functions";
import { WORKSPACE_ROLE_LABELS } from "@/lib/workspaces/permissions";
import { cn } from "@/lib/utils";

/**
 * Workspace picker. Everything scoped to a workspace (repositories, activity,
 * members) follows whatever is selected here, so switching invalidates the
 * whole query cache — see `useWorkspaces`.
 */
export function WorkspaceSwitcher({ onNavigate }: { onNavigate?: () => void }) {
  const { workspaces, activeWorkspace, isLoading, switchWorkspace, isSwitching } = useWorkspaces();
  const { isPro } = usePlan();
  const [createOpen, setCreateOpen] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-2 text-left text-sm transition-colors duration-150 hover:border-primary/40"
          >
            {activeWorkspace?.isPersonal ? (
              <User className="size-4 shrink-0 text-primary" />
            ) : (
              <Users className="size-4 shrink-0 text-primary" />
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">
                {isLoading ? "Loading…" : (activeWorkspace?.name ?? "No workspace")}
              </span>
              {activeWorkspace ? (
                <span className="block truncate text-xs text-muted-foreground">
                  {WORKSPACE_ROLE_LABELS[activeWorkspace.role]}
                  {activeWorkspace.isPersonal ? "" : ` · ${activeWorkspace.memberCount} members`}
                </span>
              ) : null}
            </span>
            {isSwitching ? (
              <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
            ) : (
              <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuLabel className="label-caps text-muted-foreground">Workspaces</DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onSelect={() => {
                if (workspace.id !== activeWorkspace?.id) switchWorkspace(workspace.id);
              }}
              className="gap-2"
            >
              {workspace.isPersonal ? <User className="size-4" /> : <Users className="size-4" />}
              <span className="min-w-0 flex-1 truncate">
                {workspace.name}
                {workspace.archivedAt ? <span className="text-muted-foreground"> (archived)</span> : null}
              </span>
              {workspace.id === activeWorkspace?.id ? <Check className="size-4 text-primary" /> : null}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setCreateOpen(true);
              onNavigate?.();
            }}
            className="gap-2"
          >
            {isPro ? <Plus className="size-4" /> : <Lock className="size-4" />}
            New team workspace
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  );
}

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { isPro } = usePlan();
  const createFn = useServerFn(createWorkspace);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const create = useMutation({
    mutationFn: () => createFn({ data: { name, description: description || null } }),
    onSuccess: async (workspace) => {
      toast.success(`Created ${workspace.name}`);
      setName("");
      setDescription("");
      onOpenChange(false);
      await queryClient.invalidateQueries();
      void navigate({ to: "/team" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New team workspace</DialogTitle>
          <DialogDescription>
            {isPro
              ? "Team workspaces let you share repositories, activity and AI settings with others."
              : "Team workspaces are a GitPush Pro feature. Upgrade to create one."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Acme Engineering"
              maxLength={60}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="workspace-description">Description (optional)</Label>
            <Textarea
              id="workspace-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this workspace is for"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          {isPro ? (
            <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
              {create.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Create workspace
            </Button>
          ) : (
            <Button
              onClick={() => {
                onOpenChange(false);
                void navigate({ to: "/pricing" });
              }}
              className={cn("gap-1.5")}
            >
              Upgrade to Pro
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}