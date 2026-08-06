import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useDeferredValue, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  GitBranch,
  Lock,
  SearchX,
  Star,
  Unlock,
  Loader2,
  Github,
  LayoutGrid,
  List,
  Settings2,
  Plus,
} from "lucide-react";
import { ConnectGithubDialog, useAccounts } from "@/components/connect-github";
import { CreateRepositoryDialog } from "@/components/create-repository-dialog";
import { listRepos, type RepoCard } from "@/lib/github.functions";
import { getPreferences, listRepoPrefs, saveRepoPref, updatePreferences } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { usePersistentState } from "@/hooks/use-persistent-state";
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

type RepoView = "grid" | "list";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

interface RepoTileProps {
  repo: RepoCard;
  index: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  opening: boolean;
}

/** A single repository card, used in the grid view. */
function RepoGridCard({ repo, index, isFavorite, onToggleFavorite, onOpen, opening }: RepoTileProps) {
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={cn(
        "group flex animate-in fade-in flex-col rounded-md border bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
        isFavorite ? "border-primary/30" : "border-border",
      )}
    >
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 truncate font-mono text-sm">
          <span className="text-muted-foreground">{repo.owner}/</span>
          {repo.name}
        </h2>
        <button
          onClick={onToggleFavorite}
          aria-label={isFavorite ? "Remove Favorite" : "Favorite"}
          title={isFavorite ? "Remove Favorite" : "Favorite"}
          className="transition-transform duration-150 hover:scale-110 active:scale-95"
        >
          <Star
            className={cn(
              "size-3.5 transition-colors duration-150",
              isFavorite ? "fill-primary text-primary" : "text-muted-foreground group-hover:text-foreground",
            )}
          />
        </button>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
        {repo.description ?? "No description"}
      </p>
      <div className="mt-2 flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
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
      <Button size="sm" className="mt-3" disabled={!repo.canPush || opening} onClick={onOpen}>
        {repo.canPush ? "Open in workspace" : "Read-only"}
      </Button>
    </article>
  );
}

/** A single repository row, used in the compact list view. */
function RepoListRow({ repo, index, isFavorite, onToggleFavorite, onOpen, opening }: RepoTileProps) {
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      className={cn(
        "group flex animate-in fade-in items-center gap-3 rounded-md border bg-card px-3 py-2 shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md",
        isFavorite ? "border-primary/30" : "border-border",
      )}
    >
      <button
        onClick={onToggleFavorite}
        aria-label={isFavorite ? "Remove Favorite" : "Favorite"}
        title={isFavorite ? "Remove Favorite" : "Favorite"}
        className="shrink-0 transition-transform duration-150 hover:scale-110 active:scale-95"
      >
        <Star
          className={cn(
            "size-3.5 transition-colors duration-150",
            isFavorite ? "fill-primary text-primary" : "text-muted-foreground group-hover:text-foreground",
          )}
        />
      </button>

      <div className="min-w-0 flex-1">
        <h2 className="truncate font-mono text-sm">
          <span className="text-muted-foreground">{repo.owner}/</span>
          {repo.name}
        </h2>
        <p className="truncate text-xs text-muted-foreground sm:hidden">
          {repo.description ?? "No description"}
        </p>
      </div>

      <p className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground sm:block">
        {repo.description ?? "No description"}
      </p>

      <div className="hidden shrink-0 items-center gap-3 font-mono text-[11px] text-muted-foreground md:flex">
        <span className="flex items-center gap-1">
          {repo.isPrivate ? <Lock className="size-3" /> : <Unlock className="size-3" />}
          {repo.isPrivate ? "private" : "public"}
        </span>
        <span className="flex items-center gap-1">
          <GitBranch className="size-3" />
          {repo.defaultBranch}
        </span>
        <span className="w-14 text-right">{timeAgo(repo.updatedAt)}</span>
      </div>

      <Button size="sm" variant="secondary" className="shrink-0" disabled={!repo.canPush || opening} onClick={onOpen}>
        {repo.canPush ? "Open" : "Read-only"}
      </Button>
    </article>
  );
}

function RepoTile(props: RepoTileProps & { view: RepoView }) {
  return props.view === "grid" ? <RepoGridCard {...props} /> : <RepoListRow {...props} />;
}

function repoSectionClass(view: RepoView) {
  return view === "grid" ? "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3" : "flex flex-col gap-1.5";
}

/** Compact chip strip for switching between connected GitHub accounts — replaces the old full account-card grid, which duplicated what already lives on Settings → Connections. */
function AccountStrip({
  accounts,
  activeId,
  onSelect,
}: {
  accounts: { id: string; login: string; avatarUrl: string | null; repoCount: number; status: string }[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
}) {
  if (accounts.length === 0) return null;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
      {accounts.map((account) => {
        const active = account.id === activeId;
        return (
          <button
            key={account.id}
            onClick={() => onSelect(account.id)}
            aria-pressed={active}
            className={cn(
              "flex shrink-0 items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-xs transition-colors",
              active
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            <Avatar className="size-5">
              <AvatarImage src={account.avatarUrl ?? undefined} alt={account.login} />
              <AvatarFallback className="text-[9px]">{account.login.slice(0, 2).toUpperCase()}</AvatarFallback>
            </Avatar>
            <span className="font-mono font-medium">@{account.login}</span>
            <span className={cn("font-mono", active ? "text-primary/70" : "text-muted-foreground/70")}>
              {account.repoCount}
            </span>
            {account.status !== "ok" && account.status !== "connected" && (
              <span className="size-1.5 rounded-full bg-destructive" title={`Status: ${account.status}`} />
            )}
          </button>
        );
      })}
      <Link
        to="/settings"
        search={{ tab: "connections" }}
        className="flex shrink-0 items-center gap-1 rounded-full border border-dashed border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
      >
        <Settings2 className="size-3" />
        Manage
      </Link>
    </div>
  );
}

function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const accounts = useAccounts();
  const [query, setQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [view, setView] = usePersistentState<RepoView>("glit:repo-view", "grid");

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
    placeholderData: keepPreviousData,
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

  const switchAccount = useMutation({
    mutationFn: (nextAccountId: string) => updatePrefsFn({ data: { activeAccountId: nextAccountId } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["prefs"] }),
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
      // Only "prefs" actually changed here (active repo/account/branch).
      // The workspace route's queries are keyed by accountId/fullName, so
      // they fetch fresh data on their own — invalidating everything else
      // just re-triggers requests (the repo list, other accounts' data,
      // favorites, etc.) that are still perfectly valid.
      void queryClient.invalidateQueries({ queryKey: ["prefs"] });
      void navigate({ to: "/workspace" });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function handleRepoCreated(repo: RepoCard) {
    void queryClient.invalidateQueries({ queryKey: ["repos", accountId] });
    openRepo.mutate({ fullName: repo.fullName, defaultBranch: repo.defaultBranch });
  }

  const deferredQuery = useDeferredValue(query);
  const filtered = (repos.data ?? [])
    .filter((repo) => (onlyFavorites ? favorites.has(repo.fullName) : true))
    .filter((repo) => repo.fullName.toLowerCase().includes(deferredQuery.toLowerCase()));

  // Pinned (favorited) repositories always float to the top of the grid,
  // in their own labeled section, regardless of the search term or the
  // "Favorites" filter toggle.
  const pinned = filtered.filter((repo) => favorites.has(repo.fullName));
  const unpinned = filtered.filter((repo) => !favorites.has(repo.fullName));

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

  const sectionClass = repoSectionClass(view);

  return (
    <main className="mx-auto max-w-6xl px-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold tracking-tight">Repositories</h1>
        <div className="flex items-center gap-2">
          <CreateRepositoryDialog accountId={accountId} onCreated={handleRepoCreated} />
          <ConnectGithubDialog
            trigger={
              <Button variant="outline" size="sm">
                <Plus className="size-3.5" />
                Add account
              </Button>
            }
          />
        </div>
      </div>

      <div className="mt-3">
        <AccountStrip
          accounts={accounts.data ?? []}
          activeId={accountId}
          onSelect={(id) => switchAccount.mutate(id)}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Filter repositories…"
          className="min-w-56 flex-1"
          inputClassName="h-9 font-mono text-xs"
        />
        <Button
          variant={onlyFavorites ? "default" : "outline"}
          size="sm"
          onClick={() => setOnlyFavorites((v) => !v)}
        >
          <Star className="size-3.5" />
          Favorites
        </Button>
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(next) => next && setView(next as RepoView)}
          className="rounded-md border border-border p-0.5"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view" title="Grid view" size="sm" className="h-8 px-2.5">
            <LayoutGrid className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view" title="List view" size="sm" className="h-8 px-2.5">
            <List className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {repos.isLoading && (
        <section className={cn("mt-3", sectionClass)}>
          {Array.from({ length: 6 }).map((_, i) =>
            view === "grid" ? (
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
            ) : (
              <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                <Skeleton className="size-3.5 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="ml-auto h-8 w-20" />
              </div>
            ),
          )}
        </section>
      )}
      {repos.isError && (
        <p className="mt-8 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm animate-in fade-in duration-200">
          {(repos.error as Error).message}
        </p>
      )}

      {pinned.length > 0 && (
        <section className="mt-3">
          <p className="label-caps flex items-center gap-1.5 text-muted-foreground">
            <Star className="size-3 fill-primary text-primary" />
            Pinned
          </p>
          <div className={cn("mt-1.5", sectionClass)}>
            {pinned.map((repo, index) => (
              <RepoTile
                key={repo.id}
                repo={repo}
                index={index}
                view={view}
                isFavorite
                onToggleFavorite={() => toggleFavorite.mutate(repo.fullName)}
                onOpen={() => openRepo.mutate({ fullName: repo.fullName, defaultBranch: repo.defaultBranch })}
                opening={openRepo.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {unpinned.length > 0 && (
        <section className="mt-3">
          {pinned.length > 0 && <p className="label-caps text-muted-foreground">All repositories</p>}
          <div className={cn(sectionClass, pinned.length > 0 && "mt-1.5")}>
            {unpinned.map((repo, index) => (
              <RepoTile
                key={repo.id}
                repo={repo}
                index={index}
                view={view}
                isFavorite={false}
                onToggleFavorite={() => toggleFavorite.mutate(repo.fullName)}
                onOpen={() => openRepo.mutate({ fullName: repo.fullName, defaultBranch: repo.defaultBranch })}
                opening={openRepo.isPending}
              />
            ))}
          </div>
        </section>
      )}

      {!repos.isLoading && filtered.length === 0 && (
        <EmptyState
          className="mt-6"
          size="compact"
          icon={SearchX}
          title="No repositories match."
          description={
            onlyFavorites
              ? "You haven't favorited any repositories yet. Tap the star on a repo to pin it here."
              : "Try a different search term or clear the favorites filter."
          }
        />
      )}
    </main>
  );
}
