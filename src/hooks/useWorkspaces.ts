import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listWorkspaces, setActiveWorkspace, type WorkspaceDto } from "@/lib/workspaces.functions";
import { can, type WorkspaceCapability, type WorkspaceRole } from "@/lib/workspaces/permissions";

/**
 * The shared "which workspace am I in, and what can I do here?" hook.
 *
 * `role` always comes from the server (`workspace_members`), never from
 * anything the client holds, and `can()` is the exact same matrix the server
 * enforces with `requireCapability` — so UI affordances and server rules can't
 * drift apart.
 */
export function useWorkspaces() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listWorkspaces);
  const switchFn = useServerFn(setActiveWorkspace);

  const query = useQuery({ queryKey: ["workspaces"], queryFn: () => listFn() });

  const workspaces: WorkspaceDto[] = query.data?.workspaces ?? [];
  const activeWorkspaceId = query.data?.activeWorkspaceId ?? null;
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeWorkspaceId) ?? null;
  const role = (activeWorkspace?.role ?? null) as WorkspaceRole | null;

  const switchWorkspace = useMutation({
    mutationFn: (workspaceId: string) => switchFn({ data: { workspaceId } }),
    onSuccess: async () => {
      // The active workspace scopes repositories, activity and members, so
      // everything downstream has to refetch after a switch.
      await queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return {
    workspaces,
    activeWorkspace,
    activeWorkspaceId,
    role,
    isLoading: query.isLoading,
    can: (capability: WorkspaceCapability) => can(role, capability),
    switchWorkspace: (workspaceId: string) => switchWorkspace.mutate(workspaceId),
    isSwitching: switchWorkspace.isPending,
  };
}