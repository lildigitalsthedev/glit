import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2,
  ShieldCheck,
  ArrowUpCircle,
  ArrowDownCircle,
  Crown,
  Code2,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { listManagedUsers, setManagedUserRole } from "@/lib/roles.functions";
import type { AppRole } from "@/lib/permissions";
import { SearchInput } from "@/components/search-input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/owner")({
  head: () => ({
    meta: [
      { title: "Owner Dashboard — GitPush" },
      { name: "description", content: "Manage user roles." },
    ],
  }),
  component: OwnerDashboard,
});

function roleBadgeVariant(role: string): "default" | "secondary" | "outline" {
  if (role === "owner") return "default";
  if (role === "admin") return "secondary";
  if (role === "developer") return "outline";
  return "outline";
}

/** Every role transition the Owner is allowed to make for a given row, per the role hierarchy. */
function availableActions(
  role: AppRole,
): { label: string; nextRole: "admin" | "developer" | "user"; icon: typeof ArrowUpCircle }[] {
  if (role === "user") {
    return [
      { label: "Make Developer", nextRole: "developer", icon: Code2 },
      { label: "Make Admin", nextRole: "admin", icon: ArrowUpCircle },
    ];
  }
  if (role === "developer") {
    return [
      { label: "Promote to Admin", nextRole: "admin", icon: ArrowUpCircle },
      { label: "Remove Developer", nextRole: "user", icon: ArrowDownCircle },
    ];
  }
  if (role === "admin") {
    return [{ label: "Demote to User", nextRole: "user", icon: ArrowDownCircle }];
  }
  return [];
}

function OwnerDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { isOwner, isLoading: roleLoading } = useRole();
  const [search, setSearch] = useState("");

  const listFn = useServerFn(listManagedUsers);
  const users = useQuery({
    queryKey: ["owner", "users"],
    queryFn: () => listFn(),
    // Only the Owner can call this without the server throwing — don't fire
    // it at all until we know the caller is the Owner.
    enabled: isOwner,
  });

  const setRoleFn = useServerFn(setManagedUserRole);
  const changeRole = useMutation({
    mutationFn: (input: { targetUserId: string; role: "admin" | "developer" | "user" }) =>
      setRoleFn({ data: input }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["owner", "users"] });
      toast.success("Role updated.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update that user's role."),
  });

  const filtered = useMemo(() => {
    const rows = users.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => (row.email ?? "").toLowerCase().includes(q));
  }, [users.data, search]);

  // Not the Owner: this dashboard is hidden, not just visually — bounce
  // straight back to the main app. The actual enforcement lives on the
  // backend (listManagedUsers / setManagedUserRole both re-check the
  // caller's role), this is just so a non-owner never sees the screen.
  if (!roleLoading && !isOwner) {
    void navigate({ to: "/app" });
    return null;
  }

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p className="label-caps">Owner</p>
      <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Crown className="size-5 text-primary" />
        Owner Dashboard
      </h1>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        Signed in as {user?.email}. Create Developers, promote them to Admin, or manage Admins
        directly. Role changes take effect immediately.
      </p>

      <div className="mt-6 flex items-center gap-2">
        <SearchInput
          value={search}
          onValueChange={setSearch}
          placeholder="Search users by email…"
          className="flex-1"
        />
        <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">
          {filtered.length} of {(users.data ?? []).length}
        </Badge>
      </div>

      <div className="mt-4 divide-y divide-border rounded-md border border-border bg-card">
        {users.isLoading && (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="size-4 animate-spin text-primary" />
          </div>
        )}

        {!users.isLoading && filtered.length === 0 && (
          <EmptyState
            size="compact"
            icon={ShieldCheck}
            title="No users found."
            description="Try a different search."
          />
        )}

        {filtered.map((row) => {
          const isSelf = row.userId === user?.id;
          const pending = changeRole.isPending && changeRole.variables?.targetUserId === row.userId;
          const actions = row.role !== "owner" && !isSelf ? availableActions(row.role) : [];
          return (
            <div key={row.userId} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{row.email ?? "Unknown"}</p>
                  <Badge variant={roleBadgeVariant(row.role)} className="font-mono text-[10px]">
                    {row.role}
                  </Badge>
                  {isSelf && (
                    <Badge variant="outline" className="font-mono text-[10px]">
                      you
                    </Badge>
                  )}
                </div>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {row.subscriptionPlan} plan · user id {row.userId.slice(0, 8)}…
                </p>
              </div>

              {actions.length > 0 && (
                <div className={cn("flex shrink-0 items-center gap-2")}>
                  {actions.map((action) => (
                    <Button
                      key={action.label}
                      variant="outline"
                      size="sm"
                      disabled={pending}
                      onClick={() => changeRole.mutate({ targetUserId: row.userId, role: action.nextRole })}
                    >
                      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <action.icon className="size-3.5" />}
                      {action.label}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
