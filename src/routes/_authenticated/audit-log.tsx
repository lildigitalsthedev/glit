import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { Download, Loader2, SearchX, ShieldCheck, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { listWorkspaceAuditLog, exportWorkspaceAuditLog } from "@/lib/audit.functions";
import { listWorkspaceMembers } from "@/lib/workspaces.functions";
import { AUDIT_CATEGORIES } from "@/lib/audit-categories";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit log — GitPush" },
      {
        name: "description",
        content: "Search, filter, and export every login, push, and settings change in this workspace.",
      },
      { property: "og:title", content: "Audit log — GitPush" },
      {
        property: "og:description",
        content: "Search, filter, and export every login, push, and settings change in this workspace.",
      },
    ],
  }),
  component: AuditLogPage,
});

const PAGE_SIZE = 25;

function AuditLogPage() {
  const { activeWorkspace, activeWorkspaceId, can, isLoading: workspaceLoading } = useWorkspaces();
  const canView = can("activity:view");

  const listFn = useServerFn(listWorkspaceAuditLog);
  const exportFn = useServerFn(exportWorkspaceAuditLog);
  const membersFn = useServerFn(listWorkspaceMembers);

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryKey, setCategoryKey] = useState<string>("all");
  const [actorId, setActorId] = useState<string>("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  // Debounce free-text search so every keystroke doesn't fire a request.
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  const actions = useMemo(
    () => AUDIT_CATEGORIES.find((c) => c.key === categoryKey)?.actions,
    [categoryKey],
  );

  const filters = {
    search: search || undefined,
    actions,
    actorId: actorId === "all" ? undefined : actorId,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(`${to}T23:59:59.999`).toISOString() : undefined,
  };

  const members = useQuery({
    queryKey: ["workspace-members", activeWorkspaceId],
    queryFn: () => membersFn({ data: { workspaceId: activeWorkspaceId! } }),
    enabled: Boolean(activeWorkspaceId) && canView,
  });

  const auditQuery = useQuery({
    queryKey: ["audit-log", activeWorkspaceId, page, filters.search, categoryKey, actorId, from, to],
    queryFn: () =>
      listFn({
        data: { workspaceId: activeWorkspaceId!, page, pageSize: PAGE_SIZE, ...filters },
      }),
    enabled: Boolean(activeWorkspaceId) && canView,
  });

  async function handleExport() {
    if (!activeWorkspaceId) return;
    setExporting(true);
    try {
      const { csv } = await exportFn({ data: { workspaceId: activeWorkspaceId, ...filters } });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `audit-log-${activeWorkspace?.name?.toLowerCase().replace(/\s+/g, "-") ?? "workspace"}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't export the audit log.");
    } finally {
      setExporting(false);
    }
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setCategoryKey("all");
    setActorId("all");
    setFrom("");
    setTo("");
    setPage(1);
  }

  const hasActiveFilters = Boolean(search || categoryKey !== "all" || actorId !== "all" || from || to);
  const total = auditQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const entries = auditQuery.data?.entries ?? [];

  return (
    <main className="mx-auto max-w-5xl px-3 py-4">
      <p className="label-caps">Workspace</p>
      <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <ShieldCheck className="size-5 text-primary" />
        Audit log
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every login, push, settings change, member action, AI use, and API key change in{" "}
        {activeWorkspace?.name ?? "this workspace"}.
      </p>

      {!workspaceLoading && !canView && (
        <EmptyState
          className="mt-6"
          icon={ShieldCheck}
          title="No access"
          description="Your role in this workspace doesn't include audit log access."
        />
      )}

      {canView && (
        <>
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search summary, repo, or member…"
                  className="h-9 pr-8 text-sm"
                />
                {searchInput && (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="size-3.5" />
                  </button>
                )}
              </div>

              <Select
                value={actorId}
                onValueChange={(v) => {
                  setActorId(v);
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-9 w-[160px] text-xs">
                  <SelectValue placeholder="All members" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    All members
                  </SelectItem>
                  {(members.data ?? []).map((m) => (
                    <SelectItem key={m.userId} value={m.userId} className="text-xs">
                      {m.displayName ?? m.email ?? "Unknown"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-[140px] text-xs"
                aria-label="From date"
              />
              <Input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-[140px] text-xs"
                aria-label="To date"
              />

              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={exporting || entries.length === 0}
              >
                {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
                Export CSV
              </Button>

              {hasActiveFilters && (
                <Button size="sm" variant="ghost" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setCategoryKey("all");
                  setPage(1);
                }}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs transition-colors duration-150",
                  categoryKey === "all"
                    ? "border-primary/40 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                All
              </button>
              {AUDIT_CATEGORIES.map((cat) => (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => {
                    setCategoryKey(cat.key);
                    setPage(1);
                  }}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs transition-colors duration-150",
                    categoryKey === cat.key
                      ? "border-primary/40 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-4">
            {auditQuery.isLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : auditQuery.isError ? (
              <p className="text-sm text-destructive">{(auditQuery.error as Error).message}</p>
            ) : entries.length === 0 ? (
              <EmptyState
                icon={SearchX}
                title="No matching events"
                description={
                  hasActiveFilters
                    ? "Nothing matches these filters. Try widening the date range or clearing a filter."
                    : "Nothing has happened in this workspace yet."
                }
                size="compact"
              />
            ) : (
              <div className="overflow-hidden rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[140px]">When</TableHead>
                      <TableHead className="w-[140px]">Actor</TableHead>
                      <TableHead className="w-[160px]">Action</TableHead>
                      <TableHead>Summary</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell
                          className="whitespace-nowrap font-mono text-[11px] text-muted-foreground"
                          title={new Date(entry.createdAt).toLocaleString()}
                        >
                          {formatDistanceToNowStrict(new Date(entry.createdAt), { addSuffix: true })}
                        </TableCell>
                        <TableCell className="text-xs">{entry.actor?.displayName ?? "System"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px] font-normal">
                            {entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">
                          {entry.summary}
                          {entry.repoFullName && (
                            <span className="ml-1.5 font-mono text-[11px] text-muted-foreground">
                              {entry.repoFullName}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {total.toLocaleString()} event{total === 1 ? "" : "s"} · page {page} of {totalPages}
              </p>
              <Pagination className="mx-0 w-auto">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => page > 1 && setPage(page - 1)}
                      className={cn(page <= 1 && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                  {Array.from({ length: totalPages })
                    .map((_, i) => i + 1)
                    .filter((n) => n === 1 || n === totalPages || Math.abs(n - page) <= 1)
                    .reduce<number[]>((acc, n) => {
                      if (acc.length > 0 && n - acc[acc.length - 1] > 1) acc.push(-1);
                      acc.push(n);
                      return acc;
                    }, [])
                    .map((n, i) =>
                      n === -1 ? (
                        <PaginationItem key={`ellipsis-${i}`}>
                          <span className="px-2 text-muted-foreground">…</span>
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={n}>
                          <PaginationLink isActive={n === page} onClick={() => setPage(n)}>
                            {n}
                          </PaginationLink>
                        </PaginationItem>
                      ),
                    )}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => page < totalPages && setPage(page + 1)}
                      className={cn(page >= totalPages && "pointer-events-none opacity-50")}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </>
      )}
    </main>
  );
}
