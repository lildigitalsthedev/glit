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
  Grid3x3,
  List,
  Settings2,
  Plus,
  MoreVertical,
  Pencil,
  Archive,
  ArchiveRestore,
  ExternalLink,
  Users,
  Code2,
  ArrowUpDown,
  Filter,
  UploadCloud,
} from "lucide-react";
import { ConnectGithubDialog, useAccounts } from "@/components/connect-github";
import { CreateRepositoryDialog } from "@/components/create-repository-dialog";
import { RenameRepositoryDialog } from "@/components/rename-repository-dialog";
import { listRepos, listWorkspaceRepoCards, archiveRepository, type RepoCard } from "@/lib/github.functions";
import { getPreferences, listRepoPrefs, saveRepoPref, updatePreferences } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/search-input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { useWorkspaces } from "@/hooks/useWorkspaces";
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

type RepoView = "grid" | "compact" | "list";
type SortKey = "updated" | "name" | "owner";

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function initials(name: string) {
  return name.slice(0, 2).toUpperCase();
}

/** Small avatar stack for "who's touched this repo through GitPush" — capped at 4 with a "+N" overflow chip. */
function ContributorStack({ contributors }: { contributors: RepoCard["contributors"] }) {
  if (!contributors || contributors.length === 0) return null;
  const shown = contributors.slice(0, 4);
  const overflow = contributors.length - shown.length;
  return (
    <div className="flex items-center -space-x-1.5" title={contributors.map((c) => c.name).join(", ")}>
      {shown.map((c) => (
        <Avatar key={c.userId} className="size-4 border border-background">
          {c.avatarUrl ? <AvatarImage src={c.avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-[8px]">{initials(c.name || "?")}</AvatarFallback>
        </Avatar>
      ))}
      {overflow > 0 && (
        <span className="flex size-4 items-center justify-center rounded-full border border-background bg-secondary text-[8px] text-muted-foreground">
          +{overflow}
        </span>
      )}
    </div>
  );
}

/** Quick-actions "⋮" menu shared by the grid and list cards. Push/Rename/Archive only appear when this card is backed by a GitHub connection the caller actually owns — everyone can still browse and favorite a teammate's repo, but editing it needs your own access to that connection. */
function RepoQuickActions({
  repo,
  ownedByCaller,
  canPush,
  canManage,
  onPush,
  onRename,
  onArchive,
}: {
  repo: RepoCard;
  ownedByCaller: boolean;
  canPush: boolean;
  canManage: boolean;
  onPush: () => void;
  onRename: () => void;
  onArchive: () => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          onClick={(e) => e.stopPropagation()}
          aria-label="Repository quick actions"
          className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity duration-150 hover:bg-secondary hover:text-foreground group-hover:opacity-100 group-focus-within:opacity-100 data-[state=open]:opacity-100"
        >
          <MoreVertical className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {ownedByCaller && canPush && (
          <DropdownMenuItem onSelect={onPush}>
            <UploadCloud className="size-3.5" />
            Push files…
          </DropdownMenuItem>
        )}
        {ownedByCaller && canManage && (
          <DropdownMenuItem onSelect={onRename}>
            <Pencil className="size-3.5" />
            Rename
          </DropdownMenuItem>
        )}
        {ownedByCaller && canManage && (
          <DropdownMenuItem
            onSelect={onArchive}
            className={repo.archived ? "" : "text-destructive focus:bg-destructive/10 focus:text-destructive"}
          >
            {repo.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
            {repo.archived ? "Unarchive" : "Archive"}
          </DropdownMenuItem>
        )}
        {ownedByCaller && (canPush || canManage) && repo.htmlUrl && <DropdownMenuSeparator />}
        {repo.htmlUrl && (
          <DropdownMenuItem onSelect={() => window.open(repo.htmlUrl!, "_blank", "noreferrer")}>
            <ExternalLink className="size-3.5" />
            View on GitHub
          </DropdownMenuItem>
        )}
        {!ownedByCaller && (
          <p className="px-2 py-1.5 text-[11px] text-muted-foreground">
            Added via a teammate's GitHub connection — connect that account yourself to push,
            rename or archive it.
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RepoTileProps {
  repo: RepoCard;
  index: number;
  isFavorite: boolean;
  onToggleFavorite: () => void;
  onOpen: () => void;
  opening: boolean;
  shared?: boolean;
  ownedByCaller?: boolean;
  canPush?: boolean;
  canManage?: boolean;
  onRename?: () => void;
  onArchive?: () => void;
}

/** A single repository card, used in the grid view. */
function RepoGridCard({
  repo,
  index,
  isFavorite,
  onToggleFavorite,
  onOpen,
  opening,
  shared,
  ownedByCaller = true,
  canPush = true,
  canManage = false,
  onRename,
  onArchive,
}: RepoTileProps) {
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 40}ms` }}
      className={cn(
        "group flex animate-in fade-in flex-col rounded-md border bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
        isFavorite ? "border-primary/30" : "border-border",
        repo.archived && "opacity-60",
      )}
    >
      <div className="flex items-start gap-2">
        <h2 className="min-w-0 flex-1 truncate font-mono text-sm">
          <span className="text-muted-foreground">{repo.owner}/</span>
          {repo.name}
        </h2>
        {shared && (
          <RepoQuickActions
            repo={repo}
            ownedByCaller={ownedByCaller}
            canPush={canPush}
            canManage={canManage}
            onPush={onOpen}
            onRename={onRename ?? (() => {})}
            onArchive={onArchive ?? (() => {})}
          />
        )}
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
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1">
          {repo.isPrivate ? <Lock className="size-3" /> : <Unlock className="size-3" />}
          {repo.isPrivate ? "private" : "public"}
        </span>
        <span className="flex items-center gap-1">
          <GitBranch className="size-3" />
          {repo.defaultBranch}
        </span>
        {repo.language && (
          <span className="flex items-center gap-1">
            <Code2 className="size-3" />
            {repo.language}
          </span>
        )}
        {repo.archived && <span className="text-destructive">archived</span>}
        <span className="ml-auto">{timeAgo(repo.updatedAt)}</span>
      </div>
      {shared && repo.contributors && repo.contributors.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5">
          <ContributorStack contributors={repo.contributors} />
          <span className="text-[10px] text-muted-foreground">
            {repo.contributors.length === 1 ? "1 contributor" : `${repo.contributors.length} contributors`}
          </span>
        </div>
      )}
      <Button size="sm" className="mt-3" disabled={!repo.canPush || opening} onClick={onOpen}>
        {repo.canPush ? "Open in workspace" : "Read-only"}
      </Button>
    </article>
  );
}

/** A denser card for the "Compact" grid — shows two-up on phones (up to 5-up on desktop) by trading the description and most metadata for a smaller footprint. */
function RepoCompactCard({ repo, index, isFavorite, onToggleFavorite, onOpen, opening }: RepoTileProps) {
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      className={cn(
        "group flex animate-in fade-in flex-col rounded-md border bg-card p-2 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md",
        isFavorite ? "border-primary/30" : "border-border",
        repo.archived && "opacity-60",
      )}
    >
      <div className="flex items-start gap-1">
        <p className="min-w-0 flex-1 truncate text-[10px] text-muted-foreground">{repo.owner}</p>
        <button
          onClick={onToggleFavorite}
          aria-label={isFavorite ? "Remove Favorite" : "Favorite"}
          title={isFavorite ? "Remove Favorite" : "Favorite"}
          className="shrink-0 transition-transform duration-150 hover:scale-110 active:scale-95"
        >
          <Star
            className={cn(
              "size-3 transition-colors duration-150",
              isFavorite ? "fill-primary text-primary" : "text-muted-foreground group-hover:text-foreground",
            )}
          />
        </button>
      </div>
      <h2 className="truncate font-mono text-xs font-medium leading-tight">{repo.name}</h2>
      <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        {repo.isPrivate ? <Lock className="size-2.5 shrink-0" /> : <Unlock className="size-2.5 shrink-0" />}
        <span className="truncate">{timeAgo(repo.updatedAt)}</span>
      </div>
      <Button
        size="sm"
        variant={repo.canPush ? "default" : "secondary"}
        className="mt-2 h-7 w-full text-[11px]"
        disabled={!repo.canPush || opening}
        onClick={onOpen}
      >
        {repo.canPush ? "Open" : "Read-only"}
      </Button>
    </article>
  );
}

/** A single repository row, used in the compact list view. */
function RepoListRow({
  repo,
  index,
  isFavorite,
  onToggleFavorite,
  onOpen,
  opening,
  shared,
  ownedByCaller = true,
  canPush = true,
  canManage = false,
  onRename,
  onArchive,
}: RepoTileProps) {
  return (
    <article
      style={{ animationDelay: `${Math.min(index, 8) * 30}ms` }}
      className={cn(
        "group flex animate-in fade-in items-center gap-3 rounded-md border bg-card px-3 py-2 shadow-sm transition-all duration-200 hover:border-primary/50 hover:shadow-md",
        isFavorite ? "border-primary/30" : "border-border",
        repo.archived && "opacity-60",
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

      {shared && repo.contributors && repo.contributors.length > 0 && (
        <div className="hidden shrink-0 md:block">
          <ContributorStack contributors={repo.contributors} />
        </div>
      )}

      <div className="hidden shrink-0 items-center gap-3 font-mono text-[11px] text-muted-foreground md:flex">
        <span className="flex items-center gap-1">
          {repo.isPrivate ? <Lock className="size-3" /> : <Unlock className="size-3" />}
          {repo.isPrivate ? "private" : "public"}
        </span>
        {repo.language && (
          <span className="flex items-center gap-1">
            <Code2 className="size-3" />
            {repo.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <GitBranch className="size-3" />
          {repo.defaultBranch}
        </span>
        <span className="w-14 text-right">{timeAgo(repo.updatedAt)}</span>
      </div>

      <Button size="sm" variant="secondary" className="shrink-0" disabled={!repo.canPush || opening} onClick={onOpen}>
        {repo.canPush ? "Open" : "Read-only"}
      </Button>

      {shared && (
        <RepoQuickActions
          repo={repo}
          ownedByCaller={ownedByCaller}
          canPush={canPush}
          canManage={canManage}
          onPush={onOpen}
          onRename={onRename ?? (() => {})}
          onArchive={onArchive ?? (() => {})}
        />
      )}
    </article>
  );
}

function RepoTile(props: RepoTileProps & { view: RepoView }) {
  if (props.view === "grid") return <RepoGridCard {...props} />;
  if (props.view === "compact") return <RepoCompactCard {...props} />;
  return <RepoListRow {...props} />;
}

function repoSectionClass(view: RepoView) {
  if (view === "grid") return "grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3";
  if (view === "compact") return "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5";
  return "flex flex-col gap-1.5";
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
  const { can, activeWorkspace, activeWorkspaceId } = useWorkspaces();
  const shared = Boolean(activeWorkspace && !activeWorkspace.isPersonal);
  const canPush = can("repos:push");
  const canManageRepo = can("repos:manage");

  const [query, setQuery] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [view, setView] = usePersistentState<RepoView>("glit:repo-view", "grid");
  const [sortBy, setSortBy] = usePersistentState<SortKey>("glit:repo-sort", "updated");
  const [visibilityFilter, setVisibilityFilter] = useState<"all" | "private" | "public">("all");
  const [languageFilter, setLanguageFilter] = useState<string>("all");
  const [renameTarget, setRenameTarget] = useState<RepoCard | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<RepoCard | null>(null);

  const prefsFn = useServerFn(getPreferences);
  const reposFn = useServerFn(listRepos);
  const workspaceReposFn = useServerFn(listWorkspaceRepoCards);
  const repoPrefsFn = useServerFn(listRepoPrefs);
  const saveRepoPrefFn = useServerFn(saveRepoPref);
  const updatePrefsFn = useServerFn(updatePreferences);
  const archiveFn = useServerFn(archiveRepository);

  const prefs = useQuery({ queryKey: ["prefs"], queryFn: () => prefsFn() });
  const repoPrefs = useQuery({ queryKey: ["repo-prefs"], queryFn: () => repoPrefsFn() });

  const accountId =
    prefs.data?.activeAccountId && accounts.data?.some((a) => a.id === prefs.data?.activeAccountId)
      ? prefs.data.activeAccountId
      : accounts.data?.[0]?.id;

  const personalRepos = useQuery({
    queryKey: ["repos", accountId],
    queryFn: () => reposFn({ data: { accountId: accountId! } }),
    enabled: Boolean(accountId) && !shared,
    placeholderData: keepPreviousData,
  });

  const sharedRepos = useQuery({
    queryKey: ["workspace-repo-cards", activeWorkspaceId],
    queryFn: () => workspaceReposFn(),
    enabled: shared && Boolean(activeWorkspaceId),
    placeholderData: keepPreviousData,
  });

  const repos = shared ? sharedRepos : personalRepos;
  const ownedAccountIds = useMemo(() => new Set((accounts.data ?? []).map((a) => a.id)), [accounts.data]);

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    for (const repo of repos.data ?? []) if (repo.language) langs.add(repo.language);
    return Array.from(langs).sort();
  }, [repos.data]);

  const favorites = useMemo(
    () => new Set((repoPrefs.data ?? []).filter((p) => p.isFavorite).map((p) => p.fullName)),
    [repoPrefs.data],
  );

  const toggleFavorite = useMutation({
    mutationFn: (repo: RepoCard) =>
      saveRepoPrefFn({
        data: {
          fullName: repo.fullName,
          accountId: repo.accountId,
          isFavorite: !favorites.has(repo.fullName),
          workspaceId: activeWorkspaceId ?? undefined,
        },
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
    mutationFn: async (repo: { fullName: string; defaultBranch: string; accountId: string }) => {
      await saveRepoPrefFn({
        data: {
          fullName: repo.fullName,
          accountId: repo.accountId,
          preferredBranch: repo.defaultBranch,
          touch: true,
          workspaceId: activeWorkspaceId ?? undefined,
        },
      });
      await updatePrefsFn({
        data: { activeRepo: repo.fullName, activeAccountId: repo.accountId, defaultBranch: repo.defaultBranch },
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

  const archiveMutation = useMutation({
    mutationFn: (args: { repo: RepoCard; archived: boolean }) =>
      archiveFn({ data: { accountId: args.repo.accountId, fullName: args.repo.fullName, archived: args.archived } }),
    onSuccess: (_result, args) => {
      toast.success(args.archived ? `Archived ${args.repo.fullName}` : `Unarchived ${args.repo.fullName}`);
      setArchiveTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["workspace-repo-cards"] });
      void queryClient.invalidateQueries({ queryKey: ["repos", accountId] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "GitHub rejected that change.");
    },
  });

  function handleRepoCreated(repo: RepoCard) {
    void queryClient.invalidateQueries({ queryKey: ["repos", accountId] });
    void queryClient.invalidateQueries({ queryKey: ["workspace-repo-cards"] });
    openRepo.mutate({ fullName: repo.fullName, defaultBranch: repo.defaultBranch, accountId: repo.accountId });
  }

  function handleRenamed(newFullName: string) {
    void queryClient.invalidateQueries({ queryKey: ["workspace-repo-cards"] });
    void queryClient.invalidateQueries({ queryKey: ["repos", accountId] });
    toast.success(`Renamed to ${newFullName}`);
  }

  const deferredQuery = useDeferredValue(query);
  const filtered = (repos.data ?? [])
    .filter((repo) => (onlyFavorites ? favorites.has(repo.fullName) : true))
    .filter((repo) =>
      visibilityFilter === "all" ? true : visibilityFilter === "private" ? repo.isPrivate : !repo.isPrivate,
    )
    .filter((repo) => (languageFilter === "all" ? true : repo.language === languageFilter))
    .filter((repo) => repo.fullName.toLowerCase().includes(deferredQuery.toLowerCase()))
    .sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "owner") return a.owner.localeCompare(b.owner) || a.name.localeCompare(b.name);
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });

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

  function renderTile(repo: RepoCard, index: number, isFavorite: boolean) {
    return (
      <RepoTile
        key={`${repo.accountId}:${repo.fullName}`}
        repo={repo}
        index={index}
        view={view}
        isFavorite={isFavorite}
        shared={shared}
        ownedByCaller={ownedAccountIds.has(repo.accountId)}
        canPush={canPush}
        canManage={canManageRepo}
        onToggleFavorite={() => toggleFavorite.mutate(repo)}
        onOpen={() =>
          openRepo.mutate({ fullName: repo.fullName, defaultBranch: repo.defaultBranch, accountId: repo.accountId })
        }
        onRename={() => setRenameTarget(repo)}
        onArchive={() => setArchiveTarget(repo)}
        opening={openRepo.isPending}
      />
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-base font-semibold tracking-tight">Repositories</h1>
        <div className="flex items-center gap-2">
          <CreateRepositoryDialog accountId={accountId} onCreated={handleRepoCreated} disabled={!can("repos:create")} />
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
        {shared ? (
          <p className="text-xs text-muted-foreground">
            <Users className="mr-1 inline size-3" />
            Every repository anyone in <span className="text-foreground">{activeWorkspace?.name}</span> has opened
            in GitPush, across everyone's connected GitHub accounts.
          </p>
        ) : (
          <AccountStrip
            accounts={accounts.data ?? []}
            activeId={accountId}
            onSelect={(id) => switchAccount.mutate(id)}
          />
        )}
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

        <Select value={visibilityFilter} onValueChange={(v) => setVisibilityFilter(v as typeof visibilityFilter)}>
          <SelectTrigger className="h-9 w-32 text-xs">
            <Filter className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All visibility</SelectItem>
            <SelectItem value="private">Private</SelectItem>
            <SelectItem value="public">Public</SelectItem>
          </SelectContent>
        </Select>

        {availableLanguages.length > 0 && (
          <Select value={languageFilter} onValueChange={setLanguageFilter}>
            <SelectTrigger className="h-9 w-32 text-xs">
              <Code2 className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {availableLanguages.map((lang) => (
                <SelectItem key={lang} value={lang}>
                  {lang}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
          <SelectTrigger className="h-9 w-36 text-xs">
            <ArrowUpDown className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="updated">Last updated</SelectItem>
            <SelectItem value="name">Name (A–Z)</SelectItem>
            <SelectItem value="owner">Owner</SelectItem>
          </SelectContent>
        </Select>

        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(next) => next && setView(next as RepoView)}
          className="rounded-md border border-border p-0.5"
        >
          <ToggleGroupItem value="grid" aria-label="Grid view" title="Grid view" size="sm" className="h-8 px-2.5">
            <LayoutGrid className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem
            value="compact"
            aria-label="Compact grid view"
            title="Compact grid view"
            size="sm"
            className="h-8 px-2.5"
          >
            <Grid3x3 className="size-3.5" />
          </ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="List view" title="List view" size="sm" className="h-8 px-2.5">
            <List className="size-3.5" />
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {repos.isLoading && (
        <section className={cn("mt-3", sectionClass)}>
          {Array.from({ length: view === "compact" ? 10 : 6 }).map((_, i) => {
            if (view === "grid") {
              return (
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
              );
            }
            if (view === "compact") {
              return (
                <div key={i} className="flex flex-col rounded-md border border-border bg-card p-2">
                  <div className="flex items-start gap-1">
                    <Skeleton className="h-2.5 w-10" />
                    <Skeleton className="ml-auto size-3 shrink-0 rounded-full" />
                  </div>
                  <Skeleton className="mt-1.5 h-3.5 w-4/5" />
                  <Skeleton className="mt-1.5 h-2.5 w-1/2" />
                  <Skeleton className="mt-2 h-7 w-full" />
                </div>
              );
            }
            return (
              <div key={i} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                <Skeleton className="size-3.5 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="ml-auto h-8 w-20" />
              </div>
            );
          })}
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
            {pinned.map((repo, index) => renderTile(repo, index, true))}
          </div>
        </section>
      )}

      {unpinned.length > 0 && (
        <section className="mt-3">
          {pinned.length > 0 && <p className="label-caps text-muted-foreground">All repositories</p>}
          <div className={cn(sectionClass, pinned.length > 0 && "mt-1.5")}>
            {unpinned.map((repo, index) => renderTile(repo, index, false))}
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
              : shared
                ? "No one in this workspace has opened a repository here yet. Open one from your own account to add it."
                : "Try a different search term or clear the favorites filter."
          }
        />
      )}

      {renameTarget && (
        <RenameRepositoryDialog
          open={Boolean(renameTarget)}
          onOpenChange={(open) => !open && setRenameTarget(null)}
          accountId={renameTarget.accountId}
          fullName={renameTarget.fullName}
          onRenamed={handleRenamed}
        />
      )}

      <AlertDialog open={Boolean(archiveTarget)} onOpenChange={(open) => !open && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {archiveTarget?.archived ? "Unarchive" : "Archive"} {archiveTarget?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {archiveTarget?.archived
                ? "This makes the repository writable on GitHub again."
                : "GitHub archives the repository as read-only. Nothing is deleted, and this can be undone at any time from here or on GitHub."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiveMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveMutation.isPending}
              onClick={() =>
                archiveTarget && archiveMutation.mutate({ repo: archiveTarget, archived: !archiveTarget.archived })
              }
            >
              {archiveMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              {archiveTarget?.archived ? "Unarchive" : "Archive"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
