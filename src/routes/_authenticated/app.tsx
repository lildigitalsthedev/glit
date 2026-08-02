import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { GitBranch, Lock, Search, SearchX, Star, Unlock, Loader2, Github } from "lucide-react";
import { AccountRow, ConnectGithubDialog, useAccounts } from "@/components/connect-github";
import { listRepos } from "@/lib/github.functions";
import { getPreferences, listRepoPrefs, saveRepoPref, updatePreferences } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Repositories — GitPush" },
      { name: "description", content: "Browse your connected GitHub repositories in GitPush." },
      { property: "og:title", content: "Repositories — GitPush" },
      {
        property: "og:description",
        content: "Browse your connected GitHub repositories in GitPush.",
      },
    ],
  }),
  component: Dashboard,
});

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const [query, setQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);

  const prefsFn = useServerFn(getPreferences);
  const reposFn = useServerFn(listRepos);
  const repoPrefsFn = useServerFn(listRepoPrefs);
  const saveRepoPrefFn = useServerFn(saveRepoPref);
  const updatePrefsFn = useServerFn(updatePreferences);

  const prefs = useQuery({ queryKey: ["prefs"], queryFn: () => prefsFn() });
  const repoPrefs = useQuery({ queryKey: ["repo-prefs"], queryFn: () => repoPrefsFn() });

  const accountId =
    prefs.data?.activeAccountId && accounts.data?.some((a) => a.id === prefs.data?.activeAccountId)
      ? prefs.data.activeAccountId
      : accounts.data?.[0]?.id;

  const repos = useQuery({
    queryKey: ["repos", accountId],
    queryFn: () => reposFn({ data: { accountId: accountId! } }),
    enabled: Boolean(accountId),
  });

  const favorites = useMemo(
    () => new Set((repoPrefs.data ?? []).filter((p) => p.isFavorite).map((p) => p.fullName)),
    [repoPrefs.data],
  );

  const toggleFavorite = useMutation({
    mutationFn: (fullName: string) =>
      saveRepoPrefFn({
        data: { fullName, accountId: accountId!, isFavorite: !favorites.has(fullName) },
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["repo-prefs"] }),
    onError: (error: Error) => toast.error(error.message),
  });

  const openRepo = useMutation({
    mutationFn: async (repo: { fullName: string; defaultBranch: string }) => {
      await saveRepoPrefFn({
        data: {
          fullName: repo.fullName,
          accountId: accountId!,
          preferredBranch: repo.defaultBranch,
          touch: true,
        },
      });
      await updatePrefsFn({
        data: { activeRepo: repo.fullName, activeAccountId: accountId!, defaultBranch: repo.defaultBranch },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries();
      void navigate({ to: "/workspace" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const filtered = (repos.data ?? [])
    .filter((repo) => (onlyFavorites ? favorites.has(repo.fullName) : true))
    .filter((repo) => repo.fullName.toLowerCase().includes(query.toLowerCase()));

  if (accounts.isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if ((accounts.data ?? []).length === 0) {
    return (
      <main className="mx-auto flex min-h-[60vh] max-w-lg items-center justify-center px-4">
        <EmptyState
          icon={Github}
          title="Connect GitHub to start"
          description="Authorize GitHub once and every repository you can push to becomes editable right here."
          action={<ConnectGithubDialog />}
        />
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="label-caps">Dashboard</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Repositories</h1>
        </div>
        <ConnectGithubDialog />
      </div>

      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(accounts.data ?? []).map((account) => (
          <AccountRow key={account.id} {...account} />
        ))}
      </section>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-56">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter repositories…"
            className="pl-9 font-mono text-xs"
          />
        </div>
        <Button
          variant={onlyFavorites ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyFavorites((v) => !v)}
        >
          <Star className="size-3.5" />
          Favorites
        </Button>
        {(accounts.data ?? []).length > 1 && (
          <div className="flex items-center gap-1 rounded-md border border-border p-1">
            {(accounts.data ?? []).map((account) => (
              <button
                key={account.id}
                onClick={() =>
                  void updatePrefsFn({ data: { activeAccountId: account.id } }).then(() =>
                    queryClient.invalidateQueries(),
                  )
                }
                className={cn(
                  "rounded px-2 py-1 font-mono text-xs",
                  account.id === accountId
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                @{account.login}
              </button>
            ))}
          </div>
        )}
      </div>

      {repos.isLoading && (
        <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex flex-col rounded-md border border-border bg-card p-4">
              <div className="flex items-start gap-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="ml-auto size-3.5 shrink-0 rounded-full" />
              </div>
              <Skeleton className="mt-3 h-3 w-full" />
              <Skeleton className="mt-1.5 h-3 w-4/5" />
              <div className="mt-4 flex items-center gap-3">
                <Skeleton className="h-3 w-14" />
                <Skeleton className="h-3 w-14" />
                <Skeleton className="ml-auto h-3 w-10" />
              </div>
              <Skeleton className="mt-4 h-8 w-full" />
            </div>
          ))}
        </section>
      )}
      {repos.isError && (
        <p className="mt-8 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm animate-in fade-in duration-200">
          {(repos.error as Error).message}
        </p>
      )}

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((repo, index) => (
          <article
            key={repo.id}
            style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
            className="group flex animate-in fade-in flex-col rounded-md border border-border bg-card p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md"
          >
            <div className="flex items-start gap-2">
              <h2 className="min-w-0 flex-1 truncate font-mono text-sm">
                <span className="text-muted-foreground">{repo.owner}/</span>
                {repo.name}
              </h2>
              <button
                onClick={() => toggleFavorite.mutate(repo.fullName)}
                aria-label="Toggle favorite"
                className="transition-transform duration-150 hover:scale-110 active:scale-95"
              >
                <Star
                  className={cn(
                    "size-3.5 transition-colors duration-150",
                    favorites.has(repo.fullName)
                      ? "fill-primary text-primary"
                      : "text-muted-foreground group-hover:text-foreground",
                  )}
                />
              </button>
            </div>
            <p className="mt-2 line-clamp-2 min-h-8 text-xs text-muted-foreground">
              {repo.description ?? "No description"}
            </p>
            <div className="mt-3 flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1">
                {repo.isPrivate ? <Lock className="size-3" /> : <Unlock className="size-3" />}
                {repo.isPrivate ? "private" : "public"}
              </span>
              <span className="flex items-center gap-1">
                <GitBranch className="size-3" />
                {repo.defaultBranch}
              </span>
              <span className="ml-auto">{timeAgo(repo.updatedAt)}</span>
            </div>
            <Button
              size="sm"
              className="mt-4"
              disabled={!repo.canPush || openRepo.isPending}
              onClick={() =>
                openRepo.mutate({ fullName: repo.fullName, defaultBranch: repo.defaultBranch })
              }
            >
              {repo.canPush ? "Open in workspace" : "Read-only"}
            </Button>
          </article>
        ))}
      </section>

      {!repos.isLoading && filtered.length === 0 && (
        <EmptyState
          className="mt-6"
          size="compact"
          icon={SearchX}
          title="No repositories match."
          description="Try a different search term or clear the favorites filter."
        />
      )}
    </main>
  );
}