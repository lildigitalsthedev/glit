import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, ShieldCheck, Search, ArrowUpCircle, ArrowDownCircle, Crown } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useRole } from "@/hooks/useRole";
import { listManagedUsers, setManagedUserRole } from "@/lib/roles.functions";
import { Input } from "@/components/ui/input";
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
  return "outline";
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
    mutationFn: (input: { targetUserId: string; role: "admin" | "user" }) => setRoleFn({ data: input }),
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
        Signed in as {user?.email}. Promote users to Admin or demote Admins back to User. Role
        changes take effect immediately.
      </p>

      <div className="mt-6 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search users by email…"
            className="pl-9"
          />
        </div>
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

              {row.role !== "owner" && !isSelf && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={pending}
                  onClick={() =>
                    changeRole.mutate({
                      targetUserId: row.userId,
                      role: row.role === "admin" ? "user" : "admin",
                    })
                  }
                >
                  {pending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : row.role === "admin" ? (
                    <ArrowDownCircle className="size-3.5" />
                  ) : (
                    <ArrowUpCircle className="size-3.5" />
                  )}
                  {row.role === "admin" ? "Demote to User" : "Promote to Admin"}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </main>
  );
}
