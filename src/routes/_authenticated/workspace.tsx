import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";
import { diffLines } from "diff";
import {
  FilePlus,
  FilePlus2,
  FileCode2,
  FolderGit2,
  GitBranch,
  Loader2,
  Lock,
  Menu,
  Upload,
  UploadCloud,
  FolderUp,
  FileArchive,
  GitCommitHorizontal,
  MoreVertical,
  Download,
  Pencil,
  RefreshCw,
  Copy,
  History,
  Star,
  Info,
  Plus,
  Sparkles,
  Wand2,
  MessageSquare,
  X,
  ClipboardPaste,
  TextSelect,
  Undo2,
  Redo2,
  Search,
  Hash,
  AlignLeft,
  Slash,
  Eraser,
  Scissors,
  Trash2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Command,
  LayoutDashboard,
  Activity,
  Settings,
  CreditCard,
  Eye,
  ShieldAlert,
} from "lucide-react";
import {
  listRepoBranches,
  listRepoTree,
  readRepoFile,
  pushFile,
  pushFiles,
  deleteFile,
  deleteFolder,
  downloadRepoZip,
  listRepoCommits,
  getRepoDetails,
  undoPush,
} from "@/lib/github.functions";
import { generateCommitMessage } from "@/lib/ai.functions";
import {
  getPreferences,
  updatePreferences,
  listRecentFiles,
  touchRecentFile,
  clearRecentFiles,
  listFavoritePaths,
  setPathFavorite,
} from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkspaceTools } from "@/components/workspace-tools";
import { usePersistentState } from "@/hooks/use-persistent-state";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { RenameRepositoryDialog } from "@/components/rename-repository-dialog";
import { RepositoryInfoDialog } from "@/components/repository-info-dialog";
import { DeleteFileDialog } from "@/components/delete-file-dialog";
import { DeleteFolderDialog } from "@/components/delete-folder-dialog";
import { NewFileDialog } from "@/components/new-file-dialog";
import { BulkUploadDialog } from "@/components/bulk-upload-dialog";
import { UploadFolderDialog } from "@/components/upload-folder-dialog";
import { UploadZipDialog } from "@/components/upload-zip-dialog";
import { ProUpgradeDialog } from "@/components/pro-upgrade-dialog";
import { AiGenerateDialog } from "@/components/ai-generate-dialog";
import { AiEditDialog } from "@/components/ai-edit-dialog";
import { AiRepoChatDialog } from "@/components/ai-repo-chat-dialog";
import { CommandPalette, type CommandPaletteGroup } from "@/components/command-palette";
import { FileTree } from "@/components/file-tree";
import { FileBreadcrumbs } from "@/components/breadcrumb-nav";
import { EmptyState } from "@/components/empty-state";
import { usePlan } from "@/hooks/usePlan";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { useAccounts } from "@/components/connect-github";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  defineCustomEditorThemes,
  editorFontStack,
  monacoThemeName,
} from "@/lib/theme";

export const Route = createFileRoute("/_authenticated/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — GitPush" },
      { name: "description", content: "Create, edit and commit files to GitHub from the browser." },
      { property: "og:title", content: "Workspace — GitPush" },
      {
        property: "og:description",
        content: "Create, edit and commit files to GitHub from the browser.",
      },
    ],
  }),
  component: Workspace,
});

function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    json: "json",
    md: "markdown",
    css: "css",
    html: "html",
    py: "python",
    go: "go",
    rs: "rust",
    sh: "shell",
    yml: "yaml",
    yaml: "yaml",
    sql: "sql",
  };
  return map[ext] ?? "plaintext";
}

/**
 * One open editor tab. Mirrors the same fields the "active file" state
 * (`path`/`content`/`original`/`baseSha`) already tracks — a tab is just a
 * saved snapshot of those for a file that isn't necessarily the one on
 * screen right now.
 */
type OpenTab = {
  path: string;
  content: string;
  original: string;
  baseSha: string | null;
};

function Workspace() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const prefsFn = useServerFn(getPreferences);
  const updatePrefsFn = useServerFn(updatePreferences);
  const branchesFn = useServerFn(listRepoBranches);
  const treeFn = useServerFn(listRepoTree);
  const readFn = useServerFn(readRepoFile);
  const pushFn = useServerFn(pushFile);
  const pushFilesFn = useServerFn(pushFiles);
  const deleteFileFn = useServerFn(deleteFile);
  const deleteFolderFn = useServerFn(deleteFolder);
  const zipFn = useServerFn(downloadRepoZip);
  const commitsFn = useServerFn(listRepoCommits);
  const repoDetailsFn = useServerFn(getRepoDetails);
  const recentFilesFn = useServerFn(listRecentFiles);
  const touchRecentFileFn = useServerFn(touchRecentFile);
  const clearRecentFilesFn = useServerFn(clearRecentFiles);
  const favoritePathsFn = useServerFn(listFavoritePaths);
  const setPathFavoriteFn = useServerFn(setPathFavorite);
  const generateCommitMessageFn = useServerFn(generateCommitMessage);
  const undoPushFn = useServerFn(undoPush);

  const prefs = useQuery({ queryKey: ["prefs"], queryFn: () => prefsFn() });
  const accountId = prefs.data?.activeAccountId ?? null;
  const fullName = prefs.data?.activeRepo ?? null;

  // Reads off the shared ["accounts"] cache (same one the settings page
  // populates), so this doesn't trigger an extra fetch on its own — just
  // gives us the connected account's avatar to show next to the repo name.
  const accounts = useAccounts();
  const activeAccount = accounts.data?.find((a) => a.id === accountId) ?? null;
  const repoOwner = fullName?.split("/")[0] ?? null;
  const repoShortName = fullName ? (fullName.split("/").slice(1).join("/") || fullName) : null;

  // Reads off the same ["prefs"] cache already populated above, so this
  // doesn't trigger an extra fetch — see usePlan for the shared plan logic.
  const { isPro } = usePlan();

  // Workspace-role gates for Feature 3 (RBAC) — a Viewer can browse and
  // read everything below, but every write/AI action gets hidden or
  // disabled at its entry point. The server independently re-checks all
  // of these (see github.functions.ts / ai.functions.ts), so this is
  // strictly a UX layer, not the actual security boundary.
  const { can } = useWorkspaces();
  const canPush = can("repos:push");
  const canManageRepo = can("repos:manage");
  const canUseAi = can("ai:use");

  const [branch, setBranch] = useState<string>("");
  const [path, setPath] = useState("");
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [baseSha, setBaseSha] = useState<string | null>(null);
  // All currently-open editor tabs, active one included. `path`/`content`/
  // `original`/`baseSha` above stay the single source of truth for
  // *whatever tab is active* (everything else in this file that reads
  // them keeps working unchanged); this array exists purely to remember
  // the *other* open tabs so switching back to one restores in-progress
  // edits instead of re-fetching and silently discarding them.
  const [tabs, setTabs] = useState<OpenTab[]>([]);
  // Persisted per-repo so open tabs survive a reload, same spirit as
  // `lastFilePath` below — just remembers *which paths* were open, not
  // their content, since content is always re-fetched fresh on restore.
  const [persistedTabPaths, setPersistedTabPaths] = usePersistentState<string[]>(
    fullName ? `gitpush:workspace:tabs:${fullName}` : null,
    [],
  );
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [filter, setFilter] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [repoInfoOpen, setRepoInfoOpen] = useState(false);
  // Persisted per-repo so returning to Workspace — whether by switching
  // tabs and coming back, or reopening the app later — drops the user back
  // into the exact folder they were browsing, instead of always resetting
  // to the repo root. Keyed by `fullName` so different repos don't bleed
  // their locations into each other; falls back to plain in-memory state
  // until `fullName` has loaded.
  const [activeFolder, setActiveFolder] = usePersistentState<string | null>(
    fullName ? `gitpush:workspace:activeFolder:${fullName}` : null,
    null,
  );
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkUploadUpgradeOpen, setBulkUploadUpgradeOpen] = useState(false);
  const [uploadFolderOpen, setUploadFolderOpen] = useState(false);
  const [uploadFolderUpgradeOpen, setUploadFolderUpgradeOpen] = useState(false);
  const [uploadZipOpen, setUploadZipOpen] = useState(false);
  const [uploadZipUpgradeOpen, setUploadZipUpgradeOpen] = useState(false);
  const [aiGenerateOpen, setAiGenerateOpen] = useState(false);
  const [aiEditOpen, setAiEditOpen] = useState(false);
  const [aiChatOpen, setAiChatOpen] = useState(false);
  const [aiUpgradeOpen, setAiUpgradeOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileCommitOpen, setMobileCommitOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  // Desktop & tablet only: lets the persistent file-tree / commit side
  // panes be closed to give the editor the full width, mirroring the
  // collapse affordance code editors like VS Code offer. Global (not
  // per-repo) since it's a layout preference, not repo-specific state.
  const [leftPaneCollapsed, setLeftPaneCollapsed] = usePersistentState<boolean>(
    "gitpush:workspace:leftPaneCollapsed",
    false,
  );
  const [rightPaneCollapsed, setRightPaneCollapsed] = usePersistentState<boolean>(
    "gitpush:workspace:rightPaneCollapsed",
    false,
  );
  const uploadInputRef = useRef<HTMLInputElement>(null);
  // Holds the live Monaco editor instance once mounted, so the mobile
  // edit-actions menu (select all / copy all / paste) can drive it directly —
  // touch browsers often don't surface a usable long-press menu inside
  // Monaco's own text area, so these buttons are the reliable fallback.
  // Typed loosely (rather than importing monaco-editor's own types) since
  // only a handful of well-known editor methods are used here.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorInstanceRef = useRef<any>(null);
  // The monaco namespace itself (captured in beforeMount), needed to force
  // a font re-measurement — see the effect below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef = useRef<any>(null);

  // Monaco caches character-width measurements per font signature and
  // reuses them until told otherwise. Two related gotchas this works
  // around: (1) if a webfont (e.g. Fira Code) is still loading the moment
  // Monaco first measures it, the browser silently measures the fallback
  // and never re-checks once the real font arrives; (2) switching the
  // font-family preference alone doesn't reliably trigger Monaco to
  // recompute glyph widths / line height metrics in every browser. Calling
  // `remeasureFonts()` after the target webfont has actually finished
  // loading (and once more as a fallback) fixes both.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    const remeasure = () => monaco.editor.remeasureFonts();
    if (typeof document !== "undefined" && "fonts" in document) {
      void document.fonts.ready.then(remeasure);
    }
    const timeout = setTimeout(remeasure, 150);
    return () => clearTimeout(timeout);
  }, [prefs.data?.editorFont, prefs.data?.editorFontSize, prefs.data?.editorTheme]);
  // Tracks which repo we've already tried to auto-reopen the last file
  // for, so the restore effect below fires once per repo visit rather
  // than re-triggering on every render or fighting the user's own clicks.
  const restoredFileRef = useRef<string | null>(null);

  // Mirrors whatever file is open into a persisted "last file" pointer,
  // per repo. This is deliberately separate from `path` itself — `path`
  // stays plain, transient editor state, and is never restored directly
  // with stale content. Restoring instead re-fetches through `openFile`
  // below, so the reopened file is always current, never cached/stale.
  const [lastFilePath, setLastFilePath] = usePersistentState<string>(
    fullName ? `gitpush:workspace:lastFile:${fullName}` : null,
    "",
  );
  useEffect(() => {
    if (path) setLastFilePath(path);
  }, [path]);

  useEffect(() => {
    if (!branch && prefs.data?.defaultBranch) setBranch(prefs.data.defaultBranch);
  }, [branch, prefs.data?.defaultBranch]);

  // Global Cmd/Ctrl+K launcher, the way editors like VS Code and apps like
  // Linear do it — works from anywhere in the workspace, including while
  // focus is inside the Monaco editor or a text field.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setCommandPaletteOpen((open) => !open);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const branches = useQuery({
    queryKey: ["branches", accountId, fullName],
    queryFn: () => branchesFn({ data: { accountId: accountId!, fullName: fullName! } }),
    enabled: Boolean(accountId && fullName),
  });

  const tree = useQuery({
    queryKey: ["tree", accountId, fullName, branch],
    queryFn: () => treeFn({ data: { accountId: accountId!, fullName: fullName!, branch } }),
    enabled: Boolean(accountId && fullName && branch),
    // Switching branches (or repos) keeps the previous tree on screen while
    // the new one loads, instead of blanking the whole file panel back to a
    // spinner every time.
    placeholderData: keepPreviousData,
  });

  const latestCommit = useQuery({
    queryKey: ["commits", accountId, fullName, branch],
    queryFn: () => commitsFn({ data: { accountId: accountId!, fullName: fullName!, branch } }),
    enabled: Boolean(accountId && fullName && branch),
    select: (commits) => commits[0] ?? null,
    placeholderData: keepPreviousData,
  });

  // Only fetched while the "Repository info" dialog is actually open —
  // owner/size/visibility rarely change, so there's no need to pull them on
  // every workspace load.
  const repoDetails = useQuery({
    queryKey: ["repo-details", accountId, fullName],
    queryFn: () => repoDetailsFn({ data: { accountId: accountId!, fullName: fullName! } }),
    enabled: Boolean(accountId && fullName && repoInfoOpen),
  });

  const recentFiles = useQuery({
    queryKey: ["recent-files", fullName, branch],
    queryFn: () => recentFilesFn({ data: { fullName: fullName!, branch } }),
    enabled: Boolean(accountId && fullName && branch),
    placeholderData: keepPreviousData,
  });

  const favoritePaths = useQuery({
    queryKey: ["favorite-paths", fullName],
    queryFn: () => favoritePathsFn({ data: { fullName: fullName! } }),
    enabled: Boolean(accountId && fullName),
  });

  const isActiveFolderFavorite = Boolean(
    activeFolder &&
      favoritePaths.data?.some(
        (favorite) => favorite.kind === "folder" && favorite.path === activeFolder,
      ),
  );

  function toggleFolderFavorite(target: string, next: boolean) {
    if (!fullName) return;
    setPathFavoriteFn({ data: { fullName, path: target, kind: "folder", isFavorite: next } })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["favorite-paths", fullName] }))
      .catch((error: Error) => toast.error(error.message || "Couldn't update favorite paths."));
  }

  function toggleFileFavorite(target: string, next: boolean) {
    if (!fullName) return;
    setPathFavoriteFn({ data: { fullName, path: target, kind: "file", isFavorite: next } })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["favorite-paths", fullName] }))
      .catch((error: Error) => toast.error(error.message || "Couldn't update favorite paths."));
  }

  const favoriteFilePaths = useMemo(
    () =>
      new Set(
        (favoritePaths.data ?? [])
          .filter((favorite) => favorite.kind === "file")
          .map((favorite) => favorite.path),
      ),
    [favoritePaths.data],
  );

  // Routes a tap in the Favorites popup to the right place — a pinned
  // folder navigates the file tree, a pinned file opens straight into the
  // editor, matching how each kind is favorited in the first place.
  function navigateFavorite(favorite: { path: string; kind: "file" | "folder" }) {
    if (favorite.kind === "folder") {
      setActiveFolder(favorite.path);
    } else {
      openOrActivateFile(favorite.path);
    }
  }

  function removeFavorite(favorite: { path: string; kind: "file" | "folder" }) {
    if (favorite.kind === "folder") {
      toggleFolderFavorite(favorite.path, false);
    } else {
      toggleFileFavorite(favorite.path, false);
    }
  }

  // Fire-and-forget: records that a file was just opened or edited so it
  // shows up (and stays sorted) in the Recent Files panel. Failures here
  // shouldn't interrupt the user's actual work, so they're swallowed.
  function recordRecentFile(target: string) {
    if (!fullName || !branch) return;
    touchRecentFileFn({
      data: { accountId: accountId ?? null, fullName, branch, path: target },
    })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["recent-files", fullName, branch] }))
      .catch(() => {
        /* non-critical — recent files is a convenience feature */
      });
  }

  function handleClearRecentFiles() {
    if (!fullName || !branch) return;
    clearRecentFilesFn({ data: { fullName, branch } })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["recent-files", fullName, branch] }))
      .catch((error: Error) => toast.error(error.message || "Couldn't clear recent files."));
  }

  /**
   * Reverts a just-made push by moving its branch ref back to the commit's
   * parent — see undoPush() in github.functions.ts for the actual safety
   * checks (still the branch tip, still within the time window, not
   * already undone). Wired as the "Undo" action on the push success toast;
   * the same server function also backs the equivalent button on push
   * notifications in the notification bell.
   */
  function handleUndoPush(pushId: string | null | undefined) {
    if (!pushId) {
      toast.error("This push can't be undone.");
      return;
    }
    undoPushFn({ data: { pushId } })
      .then((result) => {
        toast.success(`Undone — ${result.branch} reverted to ${result.revertedTo}.`);
        void queryClient.invalidateQueries({ queryKey: ["tree"] });
        void queryClient.invalidateQueries({ queryKey: ["commits"] });
        void queryClient.invalidateQueries({ queryKey: ["branches"] });
      })
      .catch((error: Error) => toast.error(error.message || "Couldn't undo that push."));
  }

  const openFile = useMutation({
    mutationFn: (target: string) =>
      readFn({ data: { accountId: accountId!, fullName: fullName!, branch, path: target } }),
    onSuccess: (file, target) => {
      setPath(target);
      setContent(file.content);
      setOriginal(file.content);
      setBaseSha(file.sha);
      setShowDiff(false);
      const lastSlash = target.lastIndexOf("/");
      setActiveFolder(lastSlash === -1 ? null : target.slice(0, lastSlash));
      setMobileSidebarOpen(false);
      recordRecentFile(target);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  // Restores every tab that was open in this repo last time, once per repo
  // visit — not just the single active file. Falls back to `lastFilePath`
  // alone for repos that only ever had the old single-file restore data.
  // Fetches all of them fresh off GitHub in parallel (never restores from
  // stale cached content), and re-activates whichever one was active
  // before. A tab that fails to fetch (renamed/deleted since) is silently
  // dropped rather than blocking the rest from opening.
  useEffect(() => {
    if (!accountId || !fullName || !branch) return;
    if (path || openFile.isPending) return;
    if (restoredFileRef.current === fullName) return;
    const toRestore = persistedTabPaths.length > 0 ? persistedTabPaths : lastFilePath ? [lastFilePath] : [];
    if (toRestore.length === 0) return;
    restoredFileRef.current = fullName;
    const activeTarget = toRestore.includes(lastFilePath) ? lastFilePath : toRestore[0];
    Promise.all(
      toRestore.map((target) =>
        readFn({ data: { accountId: accountId!, fullName: fullName!, branch, path: target } })
          .then((file): OpenTab => ({ path: target, content: file.content, original: file.content, baseSha: file.sha }))
          .catch(() => null),
      ),
    ).then((results) => {
      const opened = results.filter((tab): tab is OpenTab => tab !== null);
      if (opened.length === 0) return;
      setTabs(opened);
      const active = opened.find((tab) => tab.path === activeTarget) ?? opened[0];
      if (!active) return;
      setPath(active.path);
      setContent(active.content);
      setOriginal(active.original);
      setBaseSha(active.baseSha);
      const lastSlash = active.path.lastIndexOf("/");
      setActiveFolder(lastSlash === -1 ? null : active.path.slice(0, lastSlash));
      recordRecentFile(active.path);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, fullName, branch, lastFilePath, persistedTabPaths]);

  // Mirrors whatever file is active into the matching tab entry — runs on
  // every content/original/baseSha change (i.e. as the user types), not
  // just on open/commit, so switching away and back never loses in-progress
  // edits. New tabs are created here too: opening a file that isn't already
  // a tab just falls out of this naturally once `path` points at it.
  useEffect(() => {
    if (!path) return;
    setTabs((prev) => {
      const idx = prev.findIndex((tab) => tab.path === path);
      if (idx === -1) return [...prev, { path, content, original, baseSha }];
      const existing = prev[idx];
      if (!existing) return prev;
      if (existing.content === content && existing.original === original && existing.baseSha === baseSha) {
        return prev;
      }
      const next = [...prev];
      next[idx] = { path, content, original, baseSha };
      return next;
    });
  }, [path, content, original, baseSha]);

  // Keeps the persisted tab list in sync with which paths are actually
  // open, without rewriting localStorage on every keystroke — only the
  // ordered list of paths matters here, not their content, so this is
  // keyed off a cheap joined string rather than the `tabs` array itself.
  const openTabPathsKey = tabs.map((tab) => tab.path).join("\u0000");
  useEffect(() => {
    setPersistedTabPaths(tabs.map((tab) => tab.path));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTabPathsKey]);

  /** Activates an already-open tab without re-fetching — preserves whatever unsaved edits it has. */
  function activateTab(target: OpenTab) {
    if (target.path === path) return;
    setPath(target.path);
    setContent(target.content);
    setOriginal(target.original);
    setBaseSha(target.baseSha);
    setShowDiff(false);
    const lastSlash = target.path.lastIndexOf("/");
    setActiveFolder(lastSlash === -1 ? null : target.path.slice(0, lastSlash));
    setMobileSidebarOpen(false);
    recordRecentFile(target.path);
  }

  /** Opens a file: switches to it if it's already a tab, otherwise fetches it fresh as a new one. */
  function openOrActivateFile(target: string) {
    const existing = tabs.find((tab) => tab.path === target);
    if (existing) {
      activateTab(existing);
      return;
    }
    openFile.mutate(target);
  }

  /** Removes a tab (no confirmation) — used both by closeTab and by delete handlers, where the file is already gone so there's nothing left to confirm. */
  function removeTab(targetPath: string) {
    const idx = tabs.findIndex((tab) => tab.path === targetPath);
    if (idx === -1) return;
    const next = tabs.filter((tab) => tab.path !== targetPath);
    setTabs(next);
    if (targetPath !== path) return;
    const fallback = next[idx] ?? next[idx - 1] ?? null;
    setShowDiff(false);
    if (fallback) {
      setPath(fallback.path);
      setContent(fallback.content);
      setOriginal(fallback.original);
      setBaseSha(fallback.baseSha);
      const lastSlash = fallback.path.lastIndexOf("/");
      setActiveFolder(lastSlash === -1 ? null : fallback.path.slice(0, lastSlash));
    } else {
      setPath("");
      setContent("");
      setOriginal("");
      setBaseSha(null);
      setLastFilePath("");
    }
  }

  /** Closes a tab, confirming first if it has unsaved changes. */
  function closeTab(targetPath: string) {
    const target = tabs.find((tab) => tab.path === targetPath);
    if (target && target.content !== target.original) {
      if (!window.confirm(`Discard unsaved changes to ${targetPath}?`)) return;
    }
    removeTab(targetPath);
  }

  const commit = useMutation({
    mutationFn: () =>
      pushFn({
        data: {
          accountId: accountId!,
          fullName: fullName!,
          branch,
          path,
          content,
          message,
          description: description || undefined,
        },
      }),
    onSuccess: (result) => {
      toast.success(`Pushed ${result.path} (${result.commitSha})`, {
        action: {
          label: "Undo",
          onClick: () => handleUndoPush(result.pushId),
        },
      });
      setOriginal(content);
      setBaseSha(result.sha);
      setMessage("");
      setDescription("");
      setMobileCommitOpen(false);
      recordRecentFile(path);
      void queryClient.invalidateQueries({ queryKey: ["tree"] });
      void queryClient.invalidateQueries({ queryKey: ["pushes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const generateCommitMessageMutation = useMutation({
    mutationFn: () => generateCommitMessageFn({ data: { path, before: original, after: content } }),
    onSuccess: (result) => {
      const [first, ...rest] = result.message.split("\n\n");
      setMessage((first ?? "").trim());
      if (rest.length) setDescription(rest.join("\n\n").trim());
      toast.success("Commit message drafted — review before pushing.");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  /** AI commit message drafting (Pro) — needs an actual diff to summarize. */
  function handleGenerateCommitMessage() {
    if (!isPro) {
      setAiUpgradeOpen(true);
      return;
    }
    if (!path || !dirty) {
      toast.error("Make some changes first — nothing to summarize yet.");
      return;
    }
    generateCommitMessageMutation.mutate();
  }

  const diff = useMemo(() => (showDiff ? diffLines(original, content) : []), [showDiff, original, content]);
  const dirty = content !== original;

  // The diff toggle only renders while dirty is true (it's a floating
  // button above the editor). If changes get reverted/saved while the
  // diff view is open, drop back to the normal editor instead of leaving
  // showDiff stuck true with no visible way to turn it off.
  useEffect(() => {
    if (!dirty) setShowDiff(false);
  }, [dirty]);

  // --- Repository actions menu handlers -------------------------------
  function handleDownloadZip() {
    if (!accountId || !fullName) return;
    if (!branch) {
      toast.error("Pick a branch before downloading.");
      return;
    }
    toast.promise(
      zipFn({ data: { accountId, fullName, branch } }).then((result) => {
        const byteChars = atob(result.base64);
        const bytes = new Uint8Array(byteChars.length);
        for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
        const blob = new Blob([bytes], { type: "application/zip" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = result.filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        return result.filename;
      }),
      {
        loading: "Preparing ZIP download…",
        success: (filename) => `Downloaded ${filename}`,
        error: (error: Error) =>
          error?.message || "Couldn't download the repository ZIP. Try again.",
      },
    );
  }

  function handleRenameRepository() {
    setRenameOpen(true);
  }

  async function handleRepositoryRenamed(newFullName: string) {
    // Update the stored active repo so every query keyed off `fullName`
    // (branches, tree, etc.) re-fetches against the new name immediately.
    try {
      await updatePrefsFn({ data: { activeRepo: newFullName } });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the new repository name.");
    }
    void queryClient.invalidateQueries({ queryKey: ["prefs"] });
    void queryClient.invalidateQueries({ queryKey: ["branches"] });
    void queryClient.invalidateQueries({ queryKey: ["tree"] });
  }

  function handleCreateFile(fullPath: string) {
    setPath(fullPath);
    setContent("");
    setOriginal("");
    setBaseSha(null);
    setShowDiff(false);
    const lastSlash = fullPath.lastIndexOf("/");
    setActiveFolder(lastSlash === -1 ? null : fullPath.slice(0, lastSlash));
  }

  // Batch file uploads are a GitPush Pro feature — free accounts see the
  // upgrade dialog instead of the picker.
  function openBulkUpload() {
    if (isPro) {
      setBulkUploadOpen(true);
    } else {
      setBulkUploadUpgradeOpen(true);
    }
  }

  // Folder uploads are also a GitPush Pro feature.
  function openUploadFolder() {
    if (isPro) {
      setUploadFolderOpen(true);
    } else {
      setUploadFolderUpgradeOpen(true);
    }
  }

  // ZIP uploads are also a GitPush Pro feature.
  function openUploadZip() {
    if (isPro) {
      setUploadZipOpen(true);
    } else {
      setUploadZipUpgradeOpen(true);
    }
  }

  /** AI code generation (Pro). Free plans get the upgrade dialog instead. */
  function openAiGenerate() {
    if (isPro) {
      setAiGenerateOpen(true);
    } else {
      setAiUpgradeOpen(true);
    }
  }

  /** AI file editing (Pro) — needs an open file with contents to work on. */
  function openAiEdit() {
    if (!isPro) {
      setAiUpgradeOpen(true);
      return;
    }
    if (!path || !content.trim()) {
      toast.error("Open a file with contents first.");
      return;
    }
    setAiEditOpen(true);
  }

  /** AI repo chat (Pro). Free plans get the upgrade dialog instead. */
  function openAiChat() {
    if (isPro) {
      setAiChatOpen(true);
    } else {
      setAiUpgradeOpen(true);
    }
  }

  /** Drops generated code (and its path) into the editor for review. */
  function applyGeneratedCode({ path: nextPath, code }: { path: string; code: string }) {
    if (nextPath && nextPath !== path) {
      setPath(nextPath);
      setBaseSha(null);
      setOriginal("");
    }
    setContent(code);
    if (!message.trim()) setMessage("Add generated file");
    toast.success("Inserted into the editor — review, then commit.");
  }

  async function handleBulkCommit(args: {
    message: string;
    description: string;
    files: { path: string; content: string }[];
  }) {
    if (!accountId || !fullName) throw new Error("Choose a repository first.");
    if (!branch) throw new Error("Pick a branch before pushing.");
    try {
      const result = await pushFilesFn({
        data: {
          accountId,
          fullName,
          branch,
          message: args.message,
          description: args.description || undefined,
          files: args.files,
        },
      });
      toast.success(
        `Pushed ${result.filesPushed} file${result.filesPushed === 1 ? "" : "s"} (${result.commitSha})`,
        {
          action: {
            label: "Undo",
            onClick: () => handleUndoPush(result.pushId),
          },
        },
      );
      for (const uploaded of args.files) recordRecentFile(uploaded.path);
      void queryClient.invalidateQueries({ queryKey: ["tree"] });
      void queryClient.invalidateQueries({ queryKey: ["commits"] });
      void queryClient.invalidateQueries({ queryKey: ["pushes"] });
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't push those files.");
      throw error;
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (args: { targetPath: string; message: string }) => {
      if (!accountId || !fullName) throw new Error("Choose a repository first.");
      if (!branch) throw new Error("Pick a branch before deleting.");
      return deleteFileFn({
        data: {
          accountId,
          fullName,
          branch,
          path: args.targetPath,
          message: args.message,
        },
      });
    },
    onSuccess: (_result, args) => {
      toast.success(`${args.targetPath.split("/").pop() ?? args.targetPath} deleted successfully.`);
      // If the file that was just deleted is open in a tab (active or not),
      // close it — nothing left to edit or fall back to on GitHub.
      removeTab(args.targetPath);
      setDeleteTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["tree"] });
      void queryClient.invalidateQueries({ queryKey: ["commits"] });
      void queryClient.invalidateQueries({ queryKey: ["pushes"] });
    },
    onError: (error: Error) => {
      // Leave the dialog open and the file in the tree so the user can retry.
      toast.error(error.message || "Couldn't delete that file. Try again.");
    },
  });

  function handleDeleteFile(target: string) {
    setDeleteTarget(target);
  }

  const folderFilePaths = useMemo(() => {
    if (!deleteFolderTarget) return [];
    const prefix = `${deleteFolderTarget}/`;
    return (tree.data?.nodes ?? [])
      .filter((node) => node.type === "blob" && node.path.startsWith(prefix))
      .map((node) => node.path);
  }, [deleteFolderTarget, tree.data]);

  const deleteFolderMutation = useMutation({
    mutationFn: (args: { targetPath: string; message: string }) => {
      if (!accountId || !fullName) throw new Error("Choose a repository first.");
      if (!branch) throw new Error("Pick a branch before deleting.");
      return deleteFolderFn({
        data: {
          accountId,
          fullName,
          branch,
          path: args.targetPath,
          message: args.message,
        },
      });
    },
    onSuccess: (result, args) => {
      toast.success(
        `Deleted ${result.filesDeleted} file${result.filesDeleted === 1 ? "" : "s"} from ${args.targetPath}.`,
      );
      // Close every open tab that lived inside the deleted folder, and if
      // the active tab was one of them, fall back to another remaining
      // tab (or an empty editor if none are left) rather than editing
      // content that no longer exists on GitHub.
      const prefix = `${args.targetPath}/`;
      const remainingTabs = tabs.filter((tab) => !tab.path.startsWith(prefix));
      if (remainingTabs.length !== tabs.length) setTabs(remainingTabs);
      if (path.startsWith(prefix)) {
        const fallback = remainingTabs[0] ?? null;
        setShowDiff(false);
        if (fallback) {
          setPath(fallback.path);
          setContent(fallback.content);
          setOriginal(fallback.original);
          setBaseSha(fallback.baseSha);
          const lastSlash = fallback.path.lastIndexOf("/");
          setActiveFolder(lastSlash === -1 ? null : fallback.path.slice(0, lastSlash));
        } else {
          setPath("");
          setContent("");
          setOriginal("");
          setBaseSha(null);
          setLastFilePath("");
        }
      }
      if (activeFolder === args.targetPath || activeFolder?.startsWith(prefix)) {
        setActiveFolder(null);
      }
      setDeleteFolderTarget(null);
      void queryClient.invalidateQueries({ queryKey: ["tree"] });
      void queryClient.invalidateQueries({ queryKey: ["commits"] });
      void queryClient.invalidateQueries({ queryKey: ["pushes"] });
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't delete that folder. Try again.");
    },
  });

  /**
   * Abandons the in-progress commit: clears the staged file, its contents,
   * the destination path and the commit message/description, so an unwanted
   * upload can be dropped without clearing fields by hand or reloading.
   */
  function handleDiscardCommit() {
    // Drops the tab outright rather than falling back to a neighboring one
    // like closeTab does — discarding is meant to return to a clean,
    // nothing-open state, not just switch focus elsewhere.
    if (path) setTabs((prev) => prev.filter((tab) => tab.path !== path));
    setPath("");
    setContent("");
    setOriginal("");
    setBaseSha(null);
    setShowDiff(false);
    setLastFilePath("");
    setMessage("");
    setDescription("");
    toast.success("Pending commit discarded.");
  }

  async function handleCopyPath(target: string) {
    try {
      await navigator.clipboard.writeText(target);
      toast.success("Path copied to clipboard");
    } catch {
      toast.error("Couldn't copy the file path.");
    }
  }

  /**
   * Selects the entire editor contents. Driven directly through the Monaco
   * API rather than a native "select all" shortcut, since touch browsers
   * frequently don't expose a working long-press menu inside Monaco's
   * hidden text area.
   */
  function handleEditorSelectAll() {
    try {
      const editorInstance = editorInstanceRef.current;
      if (!editorInstance) return;
      const model = editorInstance.getModel();
      if (!model) return;
      editorInstance.focus();
      editorInstance.setSelection(model.getFullModelRange());
    } catch {
      // Editor instance may have been disposed by a file/view switch;
      // nothing to select in that case.
    }
  }

  /** Copies the whole file's contents to the clipboard, regardless of selection. */
  async function handleEditorCopyAll() {
    try {
      await navigator.clipboard.writeText(content);
      toast.success("File contents copied");
    } catch {
      toast.error("Couldn't access the clipboard on this device.");
    }
  }

  /**
   * Pastes clipboard text into the editor at the current cursor position —
   * or over the current selection, so "Select all" followed by "Paste"
   * behaves like a normal overwrite.
   */
  async function handleEditorPaste() {
    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) return;
    try {
      const text = await navigator.clipboard.readText();
      const selection = editorInstance.getSelection();
      editorInstance.focus();
      editorInstance.executeEdits("mobile-paste-button", [
        { range: selection, text, forceMoveMarkers: true },
      ]);
    } catch {
      toast.error(
        "Couldn't paste from the clipboard. Your browser may need clipboard permission for this site.",
      );
    }
  }

  /** Steps the editor's own undo stack back one change. */
  function handleEditorUndo() {
    try {
      editorInstanceRef.current?.focus();
      editorInstanceRef.current?.trigger("mobile-menu", "undo", null);
    } catch {
      // No-op: nothing to undo, or the editor instance isn't ready.
    }
  }

  /** Steps the editor's own undo stack forward one change. */
  function handleEditorRedo() {
    try {
      editorInstanceRef.current?.focus();
      editorInstanceRef.current?.trigger("mobile-menu", "redo", null);
    } catch {
      // No-op: nothing to redo, or the editor instance isn't ready.
    }
  }

  /** Opens Monaco's built-in find/replace widget — there's no keyboard shortcut on touch. */
  function handleEditorFindReplace() {
    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) return;
    editorInstance.focus();
    editorInstance
      .getAction("editor.action.startFindReplaceAction")
      ?.run();
  }

  /** Opens Monaco's "Go to line" prompt. */
  function handleEditorGotoLine() {
    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) return;
    editorInstance.focus();
    editorInstance.getAction("editor.action.gotoLine")?.run();
  }

  /**
   * Runs Monaco's built-in document formatter for the current language, if
   * one is registered. Not every language has a formatting provider built
   * into Monaco (there's no bundled Prettier), so this silently no-ops for
   * languages without one rather than failing.
   */
  function handleEditorFormatDocument() {
    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) return;
    editorInstance.focus();
    const action = editorInstance.getAction("editor.action.formatDocument");
    if (!action) {
      toast.error("No formatter is available for this file type.");
      return;
    }
    void action.run();
  }

  /** Toggles a line comment for the current line or selection. */
  function handleEditorToggleComment() {
    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) return;
    editorInstance.focus();
    editorInstance.getAction("editor.action.commentLine")?.run();
  }

  /** Strips trailing whitespace from every line in the file. */
  function handleEditorTrimWhitespace() {
    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) return;
    editorInstance.focus();
    editorInstance.getAction("editor.action.trimTrailingWhitespace")?.run();
  }

  /**
   * Copies the whole file to the clipboard, then empties it. Implemented as
   * a single undoable edit (rather than model.setValue) so "Undo" restores
   * the file if this was tapped by mistake.
   */
  async function handleEditorCutAll() {
    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) return;
    try {
      await navigator.clipboard.writeText(content);
    } catch {
      toast.error("Couldn't access the clipboard on this device.");
      return;
    }
    const model = editorInstance.getModel();
    if (!model) return;
    editorInstance.focus();
    editorInstance.executeEdits("mobile-cut-all-button", [
      { range: model.getFullModelRange(), text: "", forceMoveMarkers: true },
    ]);
  }

  /** Empties the file as a single undoable edit, without touching the clipboard. */
  function handleEditorClearAll() {
    const editorInstance = editorInstanceRef.current;
    if (!editorInstance) return;
    const model = editorInstance.getModel();
    if (!model) return;
    editorInstance.focus();
    editorInstance.executeEdits("mobile-clear-all-button", [
      { range: model.getFullModelRange(), text: "", forceMoveMarkers: true },
    ]);
  }

  function handleRefreshRepository() {
    if (!accountId || !fullName) return;
    const promise = Promise.all([
      queryClient.invalidateQueries({ queryKey: ["prefs"] }),
      queryClient.invalidateQueries({ queryKey: ["branches", accountId, fullName] }),
      queryClient.invalidateQueries({ queryKey: ["tree", accountId, fullName, branch] }),
      queryClient.invalidateQueries({ queryKey: ["commits", accountId, fullName, branch] }),
    ]);
    toast.promise(promise, {
      loading: "Refreshing repository…",
      success: "Repository refreshed",
      error: (error: Error) => error?.message || "Couldn't refresh the repository. Try again.",
    });
  }

  async function handleCopyRepositoryUrl() {
    if (!fullName) return;
    const url = `https://github.com/${fullName}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Copied!");
    } catch {
      toast.error("Couldn't copy the repository URL.");
    }
  }
  // ----------------------------------------------------------------------

  function onUpload(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setContent(String(reader.result ?? ""));
      setOriginal("");
      setBaseSha(null);
      if (!path) setPath(file.name);
    };
    reader.readAsText(file);
  }

  const filePaths = (tree.data?.nodes ?? []).filter((n) => n.type === "blob").map((n) => n.path);

  // Command palette: data-driven groups, recomputed whenever the things
  // they depend on change. File list is capped so an enormous repo can't
  // make the palette sluggish to filter — cmdk itself is fast, but there's
  // no reason to hand it thousands of DOM nodes it'll never all show.
  const commandPaletteGroups: CommandPaletteGroup[] = useMemo(() => {
    const groups: CommandPaletteGroup[] = [];

    const fileItems = filePaths.slice(0, 500).map((filePath) => ({
      id: `file:${filePath}`,
      label: filePath,
      icon: FileCode2,
      keywords: filePath.split("/"),
      onSelect: () => openOrActivateFile(filePath),
    }));
    if (fileItems.length) groups.push({ heading: "Files", items: fileItems });

    const actionItems = [
      {
        id: "action:new-file",
        label: "New file",
        icon: FilePlus,
        shortcut: "N",
        onSelect: () => setNewFileOpen(true),
      },
      dirty
        ? {
            id: "action:toggle-diff",
            label: showDiff ? "Hide diff" : "View diff",
            icon: Eye,
            onSelect: () => setShowDiff((v) => !v),
          }
        : null,
      {
        id: "action:commit",
        label: "Commit & push",
        icon: GitCommitHorizontal,
        shortcut: "⏎",
        disabled: !path || !message.trim() || !branch || commit.isPending,
        onSelect: () => commit.mutate(),
      },
      {
        id: "action:generate-commit-message",
        label: "Generate commit message with AI",
        icon: Sparkles,
        disabled: !path || !dirty,
        onSelect: handleGenerateCommitMessage,
      },
      {
        id: "action:ai-generate",
        label: "Generate code with AI",
        icon: Sparkles,
        onSelect: openAiGenerate,
      },
      {
        id: "action:ai-edit",
        label: "Edit file with AI",
        icon: Wand2,
        onSelect: openAiEdit,
      },
      {
        id: "action:ai-chat",
        label: "Ask AI about this repo",
        icon: MessageSquare,
        onSelect: openAiChat,
      },
      {
        id: "action:download-zip",
        label: "Download repository ZIP",
        icon: Download,
        onSelect: handleDownloadZip,
      },
      {
        id: "action:refresh-repo",
        label: "Refresh repository",
        icon: RefreshCw,
        onSelect: handleRefreshRepository,
      },
      {
        id: "action:copy-repo-url",
        label: "Copy repository URL",
        icon: Copy,
        onSelect: () => void handleCopyRepositoryUrl(),
      },
      {
        id: "action:toggle-left-pane",
        label: leftPaneCollapsed ? "Show file tree panel" : "Hide file tree panel",
        icon: leftPaneCollapsed ? PanelLeftOpen : PanelLeftClose,
        onSelect: () => setLeftPaneCollapsed((v) => !v),
      },
      {
        id: "action:toggle-right-pane",
        label: rightPaneCollapsed ? "Show commit panel" : "Hide commit panel",
        icon: rightPaneCollapsed ? PanelRightOpen : PanelRightClose,
        onSelect: () => setRightPaneCollapsed((v) => !v),
      },
    ].filter((item): item is NonNullable<typeof item> => item !== null);
    groups.push({ heading: "Actions", items: actionItems });

    const branchItems = (branches.data ?? []).map((b) => ({
      id: `branch:${b.name}`,
      label: b.name === branch ? `${b.name} (current)` : b.name,
      icon: GitBranch,
      onSelect: () => setBranch(b.name),
    }));
    if (branchItems.length) groups.push({ heading: "Branches", items: branchItems });

    groups.push({
      heading: "Navigate",
      items: [
        {
          id: "nav:dashboard",
          label: "Dashboard",
          icon: LayoutDashboard,
          onSelect: () => void navigate({ to: "/app" }),
        },
        {
          id: "nav:activity",
          label: "Activity",
          icon: Activity,
          onSelect: () => void navigate({ to: "/activity" }),
        },
        {
          id: "nav:settings",
          label: "Settings",
          icon: Settings,
          onSelect: () => void navigate({ to: "/settings" }),
        },
        {
          id: "nav:pricing",
          label: "Pricing & plan",
          icon: CreditCard,
          onSelect: () => void navigate({ to: "/pricing" }),
        },
      ],
    });

    return groups;
  }, [
    filePaths,
    dirty,
    showDiff,
    path,
    message,
    branch,
    commit.isPending,
    commit,
    branches.data,
    leftPaneCollapsed,
    rightPaneCollapsed,
    navigate,
  ]);

  // These early returns must come after every hook call above (useState,
  // useQuery, useMutation, useMemo, useEffect) — never before. `prefs`
  // starts out loading on every fresh mount (a full page reload has an
  // empty query cache, unlike a client-side navigation into this route,
  // which usually already has it warm), so a guard placed earlier would
  // make the very first render call fewer hooks than the next one once
  // `prefs` resolves. React requires the exact same hooks, in the exact
  // same order, on every render of a component — a mismatched count
  // throws "Rendered more hooks than during the previous render", which
  // is exactly the crash this file used to hit on reload. Keeping every
  // hook above this line, unconditionally, is what fixes it.
  if (prefs.isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!accountId || !fullName) {
    return (
      <main className="flex h-[calc(100dvh-2.5rem)] items-center justify-center px-4">
        <EmptyState
          icon={FolderGit2}
          title="Choose a repository to begin."
          description="Pick a repo from your dashboard to open it here and start editing, committing, and pushing to GitHub."
          action={
            <Button asChild>
              <Link to="/app">Go to repositories</Link>
            </Button>
          }
        />
      </main>
    );
  }

  const fileTreePanel = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="relative z-10 border-b border-border p-1">
        <div className="mb-1 flex items-center gap-1">
          <FileBreadcrumbs path={activeFolder} onNavigate={setActiveFolder} className="min-w-0 flex-1" />
          {activeFolder && (
            <button
              type="button"
              onClick={() => toggleFolderFavorite(activeFolder, !isActiveFolderFavorite)}
              aria-label={isActiveFolderFavorite ? "Remove Favorite" : "Favorite"}
              title={isActiveFolderFavorite ? "Remove Favorite" : "Favorite this folder"}
              className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition-transform duration-150 hover:scale-110 hover:text-foreground active:scale-95"
            >
              <Star className={cn("size-3.5", isActiveFolderFavorite && "fill-primary text-primary")} />
            </button>
          )}
        </div>
        <WorkspaceTools
          filter={filter}
          onFilterChange={setFilter}
          recentFiles={recentFiles.data ?? []}
          recentFilesLoading={recentFiles.isLoading}
          activePath={path}
          onOpenFile={(target) => openOrActivateFile(target)}
          onClearRecentFiles={handleClearRecentFiles}
          favoritePaths={favoritePaths.data ?? []}
          favoritePathsLoading={favoritePaths.isLoading}
          activeFolder={activeFolder}
          onNavigateFavorite={navigateFavorite}
          onRemoveFavorite={removeFavorite}
        />
      </div>
      <p className="label-caps px-2 pb-1 pt-1.5">Workspace Files</p>
      <div className="min-h-0 flex-1 overflow-auto px-0.5 pb-1">
        <FileTree
          nodes={tree.data?.nodes ?? []}
          loading={tree.isLoading}
          filter={filter}
          activePath={path}
          activeFolder={activeFolder}
          favoritePaths={favoriteFilePaths}
          onOpenFile={(target) => openOrActivateFile(target)}
          onSelectFolder={(target) => setActiveFolder(target)}
          onCopyPath={handleCopyPath}
          onDeleteFile={canPush ? handleDeleteFile : undefined}
          onDeleteFolder={canPush ? (target) => setDeleteFolderTarget(target) : undefined}
          onToggleFavorite={toggleFileFavorite}
        />
      </div>
    </div>
  );

  const commitPanel = (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Scrolls independently so a long description — or a mobile keyboard
          eating half the viewport — can never push the submit button
          off-screen; the button below is pinned instead of relying on
          leftover flex space. */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2.5">
        {!canPush && (
          <p className="flex items-center gap-2 rounded-md border border-border bg-secondary/30 p-2.5 text-[11px] text-muted-foreground">
            <ShieldAlert className="size-3.5 shrink-0" />
            Your role in this workspace is read-only here — you can browse files but not push
            changes.
          </p>
        )}
        <div className="flex items-center justify-between gap-2">
          <p className="label-caps">Commit</p>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            disabled={!canUseAi || !path || !dirty || generateCommitMessageMutation.isPending}
            onClick={handleGenerateCommitMessage}
            title={
              !canUseAi
                ? "Your role in this workspace doesn't allow AI features"
                : "Draft a commit message from your changes"
            }
          >
            {generateCommitMessageMutation.isPending ? (
              <Loader2 className="size-3 animate-spin" />
            ) : (
              <Sparkles className="size-3" />
            )}
            Generate
            {!isPro && <Lock className="size-2.5" />}
          </Button>
        </div>
        <Input
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Add Button component"
          className="h-9 text-xs sm:h-8"
        />
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Extended description (optional)"
          className="min-h-24 text-xs"
        />
        <div className="rounded-md border border-border bg-card p-3 font-mono text-[11px] text-muted-foreground">
          <p className="truncate">{path || "no file selected"}</p>
          <p className="mt-1">
            {baseSha ? "updates existing file" : "creates new file"} · {branch || "no branch"}
          </p>
          <p className="mt-1">{dirty ? "unsaved changes" : "no changes"}</p>
        </div>
      </div>
      <div
        className="shrink-0 border-t border-border bg-background p-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <Button
          className="h-10 w-full sm:h-9"
          disabled={!canPush || !path || !message.trim() || !branch || commit.isPending}
          onClick={() => commit.mutate()}
          title={!canPush ? "Your role in this workspace doesn't allow pushing changes" : undefined}
        >
          {commit.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <GitCommitHorizontal className="size-4" />
          )}
          Commit &amp; push
        </Button>
        {(path || message.trim() || description.trim() || content) && (
          <Button
            variant="ghost"
            className="mt-2 h-9 w-full text-muted-foreground hover:text-destructive"
            disabled={commit.isPending}
            onClick={handleDiscardCommit}
          >
            <X className="size-4" />
            Discard pending commit
          </Button>
        )}
      </div>
    </div>
  );

  const editorPanel = (
    <section className="flex min-h-0 flex-1 flex-col">
      {/* Tab strip — only shows once there's actually more than one file
          open, since with a single file the path row below (plus its
          built-in clear button) already covers everything a lone tab
          would. Horizontal-scrolls on mobile instead of wrapping, so it
          never eats a second line of vertical space. */}
      {tabs.length > 1 && (
        <div className="flex shrink-0 items-center gap-1 overflow-x-auto border-b border-border bg-muted/30 px-1.5 py-1 [&::-webkit-scrollbar]:hidden">
          {tabs.map((tab) => {
            const isActive = tab.path === path;
            const isDirty = tab.content !== tab.original;
            const fileName = tab.path.split("/").pop() || tab.path;
            return (
              <div
                key={tab.path}
                className={cn(
                  "group flex shrink-0 items-center gap-1 rounded-md py-1 pl-2 pr-1 font-mono text-[11px]",
                  isActive
                    ? "bg-background text-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  onClick={() => activateTab(tab)}
                  className="flex max-w-[8rem] shrink-0 items-center gap-1.5"
                  title={tab.path}
                >
                  {isDirty && (
                    <span className="size-1.5 shrink-0 rounded-full bg-success" />
                  )}
                  <span className="truncate">{fileName}</span>
                </button>
                <button
                  type="button"
                  onClick={() => closeTab(tab.path)}
                  aria-label={`Close ${fileName}`}
                  title="Close tab"
                  className="flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground opacity-70 hover:bg-muted hover:text-foreground hover:opacity-100"
                >
                  <X className="size-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {/* Lives above the editor at every screen size now — one compact
          row instead of trying to also cram the path field into the main
          toolbar, which left it squeezed to nothing next to the branch
          selector and repo actions on narrow screens. */}
      <div className="flex items-center gap-1.5 border-b border-border p-1.5">
        <FileCode2 className="size-3.5 shrink-0 text-muted-foreground" />
        <div className="relative min-w-0 flex-1">
          <Input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="src/components/Button.tsx"
            className="h-8 min-w-0 pr-7 font-mono text-xs"
          />
          {path && (
            <button
              type="button"
              onClick={() => setPath("")}
              aria-label="Clear file path"
              title="Clear"
              className="absolute right-1 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {path && !showDiff && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="size-8 shrink-0 text-muted-foreground hover:text-foreground md:hidden"
                aria-label="Editor edit actions"
                title="Edit actions"
              >
                <Pencil className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={handleEditorUndo}>
                <Undo2 className="size-3.5" />
                Undo
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleEditorRedo}>
                <Redo2 className="size-3.5" />
                Redo
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleEditorSelectAll}>
                <TextSelect className="size-3.5" />
                Select all
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleEditorCopyAll()}>
                <Copy className="size-3.5" />
                Copy all
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void handleEditorPaste()}>
                <ClipboardPaste className="size-3.5" />
                Paste
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleEditorFindReplace}>
                <Search className="size-3.5" />
                Find &amp; replace
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleEditorGotoLine}>
                <Hash className="size-3.5" />
                Go to line
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={handleEditorFormatDocument}>
                <AlignLeft className="size-3.5" />
                Format document
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleEditorToggleComment}>
                <Slash className="size-3.5" />
                Toggle comment
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={handleEditorTrimWhitespace}>
                <Eraser className="size-3.5" />
                Trim trailing whitespace
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleEditorCutAll()}>
                <Scissors className="size-3.5" />
                Cut all
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={handleEditorClearAll}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Clear all
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {path && dirty && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => setShowDiff((v) => !v)}
          >
            <span className="hidden sm:inline">{showDiff ? "Hide diff" : "View diff"}</span>
            <span className="sm:hidden">{showDiff ? "Hide" : "Diff"}</span>
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {!path ? (
          <div className="flex h-full items-center justify-center">
            <EmptyState
              icon={FilePlus2}
              title="Select a file or create a new one."
              description="Browse the tree on the left, search for a file, or use “New file” to start writing."
              action={
                <Button variant="outline" size="sm" onClick={() => setNewFileOpen(true)}>
                  <FilePlus className="size-3.5" />
                  New file
                </Button>
              }
            />
          </div>
        ) : showDiff ? (
          <pre className="p-3 font-mono text-[11px] leading-5">
            {diff.map((part, index) => (
              <div
                key={index}
                className={cn(
                  part.added && "bg-success/15 text-success",
                  part.removed && "bg-destructive/15 text-destructive",
                  !part.added && !part.removed && "text-muted-foreground",
                )}
              >
                {part.value.replace(/\n$/, "")}
              </div>
            ))}
          </pre>
        ) : (
          <Editor
            theme={monacoThemeName(prefs.data?.editorTheme ?? "dark")}
            language={languageFor(path)}
            value={content}
            onChange={(value) => setContent(value ?? "")}
            beforeMount={(monaco) => {
              monacoRef.current = monaco;
              defineCustomEditorThemes(monaco);
            }}
            onMount={(editorInstance) => {
              editorInstanceRef.current = editorInstance;
            }}
            options={{
              fontFamily: editorFontStack(prefs.data?.editorFont ?? "jetbrains-mono"),
              fontSize: prefs.data?.editorFontSize ?? 13,
              lineHeight: (prefs.data?.editorFontSize ?? 13) * (prefs.data?.editorLineHeight ?? 1.5),
              tabSize: prefs.data?.tabWidth ?? 2,
              wordWrap: prefs.data?.wordWrap ? "on" : "off",
              minimap: { enabled: prefs.data?.editorMinimap ?? false },
              scrollBeyondLastLine: false,
              padding: { top: 12 },
            }}
            height="100%"
          />
        )}
      </div>
    </section>
  );

  return (
    <main className="flex h-[calc(100dvh-2.5rem-var(--dock-space,7rem))] flex-col">
      {/* justify-between + two shrink-0-free clusters instead of a single
          flex-wrap row with ml-auto: with ml-auto, the action-buttons
          cluster wrapping onto its own line on narrow screens still gets
          shoved flush right by its margin, leaving a wide dead strip of
          empty space to its left. Splitting into two clusters means that
          when the action cluster is alone on a line, justify-between has
          nothing to distribute it against and it falls back to flush-left,
          right under the repo/branch row above it. */}
      <div className="flex flex-wrap items-center justify-between gap-x-1.5 gap-y-1.5 border-b border-border px-2 py-1 sm:gap-x-2 sm:px-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5 sm:gap-2">
        <Button
          variant="outline"
          size="icon"
          className="size-9 shrink-0 md:hidden"
          aria-label={mobileSidebarOpen ? "Close file tree" : "Open file tree"}
          onClick={() => setMobileSidebarOpen((v) => !v)}
        >
          <Menu className="size-4" />
        </Button>
        <Avatar className="size-6 shrink-0" title={fullName ?? undefined}>
          <AvatarImage src={activeAccount?.avatarUrl ?? undefined} alt={repoOwner ?? ""} />
          <AvatarFallback className="text-[10px]">
            {(repoOwner ?? "?").slice(0, 1).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <span
          className="min-w-0 truncate font-mono text-sm"
          title={fullName ?? undefined}
        >
          {repoShortName ?? "No repository"}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Repository actions"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={() => setRepoInfoOpen(true)}>
              <Info className="size-3.5" />
              Repository info
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleDownloadZip}>
              <Download className="size-3.5" />
              Download ZIP
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleRenameRepository} disabled={!canManageRepo}>
              <Pencil className="size-3.5" />
              Rename Repository
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={handleRefreshRepository}>
              <RefreshCw className="size-3.5" />
              Refresh Repository
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={handleCopyRepositoryUrl}>
              <Copy className="size-3.5" />
              Copy Repository URL
            </DropdownMenuItem>
            {/* Future: Delete Repository, Archive Repository — not implemented yet */}
          </DropdownMenuContent>
        </DropdownMenu>
        <RenameRepositoryDialog
          open={renameOpen}
          onOpenChange={setRenameOpen}
          accountId={accountId}
          fullName={fullName}
          onRenamed={handleRepositoryRenamed}
        />
        <RepositoryInfoDialog
          open={repoInfoOpen}
          onOpenChange={setRepoInfoOpen}
          accountId={accountId}
          fullName={fullName}
          totalFiles={tree.data ? filePaths.length : null}
          latestCommit={latestCommit.data ?? null}
          details={repoDetails.data}
          loading={repoDetails.isLoading}
          canManage={canManageRepo}
        />
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="h-8 w-24 font-mono text-xs sm:w-36">
            <GitBranch className="size-3.5" />
            <SelectValue placeholder="branch" />
          </SelectTrigger>
          <SelectContent>
            {(branches.data ?? []).map((b) => (
              <SelectItem key={b.name} value={b.name} className="font-mono text-xs">
                {b.name}
                {b.protected ? " (protected)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {/* Keyboard shortcut works everywhere regardless of screen size;
            this is just a discoverability hint, so it's fine to hide it
            on mobile where toolbar space is already tight. Same md
            breakpoint as the rest of this toolbar's mobile/desktop
            splits, rather than sm, so it doesn't pop in on mid-width
            phones and crowd the row. */}
        <Button
          variant="outline"
          size="sm"
          className="hidden h-8 shrink-0 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground md:inline-flex"
          onClick={() => setCommandPaletteOpen(true)}
        >
          <Command className="size-3.5" />
          <span className="hidden lg:inline">Command menu</span>
          <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px]">
            ⌘K
          </kbd>
        </Button>
        {latestCommit.data && (
          <span className="hidden max-w-[200px] items-center gap-1.5 truncate text-xs text-muted-foreground xl:inline-flex">
            <History className="size-3 shrink-0" />
            <span className="shrink-0 font-mono">{latestCommit.data.sha}</span>
            <span className="truncate">{latestCommit.data.message}</span>
          </span>
        )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          {/* All file/AI actions collapse into one "Add" menu at every
              screen size — a row of eight separate buttons ate too much
              width on desktop/tablet, leaving little room for the editor.
              Menu items still get a full-width, comfortably-sized tap
              target on mobile. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0">
                <Plus className="size-4" />
                <span className="sr-only">Add files</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => uploadInputRef.current?.click()} disabled={!canPush}>
                <Upload className="size-3.5" />
                Upload
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openBulkUpload} disabled={!canPush}>
                {isPro ? (
                  <UploadCloud className="size-3.5" />
                ) : (
                  <Lock className="size-3.5" />
                )}
                Bulk upload
                {!isPro && (
                  <span className="ml-auto text-[10px] text-muted-foreground">Pro</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openUploadFolder} disabled={!canPush}>
                {isPro ? (
                  <FolderUp className="size-3.5" />
                ) : (
                  <Lock className="size-3.5" />
                )}
                Upload folder
                {!isPro && (
                  <span className="ml-auto text-[10px] text-muted-foreground">Pro</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openUploadZip} disabled={!canPush}>
                {isPro ? (
                  <FileArchive className="size-3.5" />
                ) : (
                  <Lock className="size-3.5" />
                )}
                Upload ZIP
                {!isPro && (
                  <span className="ml-auto text-[10px] text-muted-foreground">Pro</span>
                )}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setNewFileOpen(true)} disabled={!canPush}>
                <FilePlus className="size-3.5" />
                New file
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={openAiGenerate} disabled={!canUseAi}>
                {isPro ? <Sparkles className="size-3.5" /> : <Lock className="size-3.5" />}
                Generate code
                {!isPro && <span className="ml-auto text-[10px] text-muted-foreground">Pro</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openAiEdit} disabled={!canUseAi}>
                {isPro ? <Wand2 className="size-3.5" /> : <Lock className="size-3.5" />}
                Edit with AI
                {!isPro && <span className="ml-auto text-[10px] text-muted-foreground">Pro</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openAiChat} disabled={!canUseAi}>
                {isPro ? <MessageSquare className="size-3.5" /> : <Lock className="size-3.5" />}
                Ask about repo
                {!isPro && <span className="ml-auto text-[10px] text-muted-foreground">Pro</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={uploadInputRef}
            type="file"
            className="hidden"
            onChange={(e) => onUpload(e.target.files)}
          />

          <Button
            size="sm"
            className="relative h-9 md:hidden"
            onClick={() => setMobileCommitOpen((v) => !v)}
          >
            <GitCommitHorizontal className="size-3.5" />
            <span className="hidden sm:inline">Commit</span>
            {dirty && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-success" />
            )}
          </Button>
        </div>
      </div>

      <NewFileDialog
        open={newFileOpen}
        onOpenChange={setNewFileOpen}
        activeFolder={activeFolder}
        existingPaths={filePaths}
        onCreate={handleCreateFile}
      />

      <AiGenerateDialog
        open={aiGenerateOpen}
        onOpenChange={setAiGenerateOpen}
        path={path}
        onApply={applyGeneratedCode}
      />

      <AiEditDialog
        open={aiEditOpen}
        onOpenChange={setAiEditOpen}
        path={path}
        content={content}
        onApply={(code) => {
          setContent(code);
          toast.success("Applied — review the diff, then commit.");
        }}
      />

      <AiRepoChatDialog
        open={aiChatOpen}
        onOpenChange={setAiChatOpen}
        accountId={accountId!}
        fullName={fullName!}
        branch={branch}
      />

      <ProUpgradeDialog
        open={aiUpgradeOpen}
        onOpenChange={setAiUpgradeOpen}
        title="AI tools are a Pro feature"
        description="Upgrade to GitPush Pro to connect your own AI provider and generate or refactor files with natural language."
        features={[
          "Bring your own key: OpenAI, Claude, Gemini, xAI, OpenRouter, DeepSeek, Mistral, Together AI",
          "Generate whole files straight into the editor",
          "Edit existing files in plain English, with a diff preview before you apply",
        ]}
      />

      <BulkUploadDialog
        open={bulkUploadOpen}
        onOpenChange={setBulkUploadOpen}
        activeFolder={activeFolder}
        existingPaths={filePaths}
        onCommit={handleBulkCommit}
      />

      <ProUpgradeDialog
        open={bulkUploadUpgradeOpen}
        onOpenChange={setBulkUploadUpgradeOpen}
        title="Batch uploads are a Pro feature"
        description="Free accounts upload one file at a time. Upgrade to GitPush Pro to drag, drop, and push multiple files in a single commit."
        features={[
          "Upload any number of files in one go",
          "Drag & drop or browse, with previews before you push",
          "Everything lands in a single commit",
        ]}
      />

      <UploadFolderDialog
        open={uploadFolderOpen}
        onOpenChange={setUploadFolderOpen}
        activeFolder={activeFolder}
        existingPaths={filePaths}
        onCommit={handleBulkCommit}
      />

      <ProUpgradeDialog
        open={uploadFolderUpgradeOpen}
        onOpenChange={setUploadFolderUpgradeOpen}
        title="Folder uploads are a Pro feature"
        description="Free accounts upload files one at a time. Upgrade to GitPush Pro to drop in a whole folder and push it as a single commit."
        features={[
          "Drag & drop or pick an entire folder",
          "Full folder hierarchy recreated automatically",
          "Preview the tree before it's pushed, in one commit",
        ]}
      />

      <UploadZipDialog
        open={uploadZipOpen}
        onOpenChange={setUploadZipOpen}
        activeFolder={activeFolder}
        existingPaths={filePaths}
        onCommit={handleBulkCommit}
      />

      <ProUpgradeDialog
        open={uploadZipUpgradeOpen}
        onOpenChange={setUploadZipUpgradeOpen}
        title="ZIP uploads are a Pro feature"
        description="Free accounts upload files one at a time. Upgrade to GitPush Pro to drop in a ZIP archive and push its contents as a single commit."
        features={[
          "Extract and preview a ZIP archive's contents locally",
          "Full folder hierarchy recreated automatically",
          "Warned before overwriting any existing files",
          "Everything lands in a single commit",
        ]}
      />

      <DeleteFileDialog
        open={deleteTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteTarget(null);
        }}
        path={deleteTarget}
        branch={branch}
        isDeleting={deleteMutation.isPending}
        onConfirm={(commitMessage) => {
          if (!deleteTarget) return;
          deleteMutation.mutate({ targetPath: deleteTarget, message: commitMessage });
        }}
      />

      <DeleteFolderDialog
        open={deleteFolderTarget !== null}
        onOpenChange={(next) => {
          if (!next) setDeleteFolderTarget(null);
        }}
        path={deleteFolderTarget}
        branch={branch}
        filePaths={folderFilePaths}
        isDeleting={deleteFolderMutation.isPending}
        onConfirm={(commitMessage) => {
          if (!deleteFolderTarget) return;
          deleteFolderMutation.mutate({
            targetPath: deleteFolderTarget,
            message: commitMessage,
          });
        }}
      />

      {/* Desktop & tablet: persistent three-pane layout, like a WhatsApp-style
          side pane (files) + main content (editor) + right pane (commit).
          Either side pane can be closed independently to hand its space
          back to the editor — the collapsed pane shrinks to a slim rail
          with a single button to reopen it, rather than disappearing
          entirely, so the toggle is always reachable. */}
      <div
        className={cn(
          "hidden min-h-0 flex-1 md:grid",
          leftPaneCollapsed &&
            rightPaneCollapsed &&
            "md:grid-cols-[2.75rem_1fr_2.75rem]",
          leftPaneCollapsed &&
            !rightPaneCollapsed &&
            "md:grid-cols-[2.75rem_1fr_280px] lg:grid-cols-[2.75rem_1fr_320px] xl:grid-cols-[2.75rem_1fr_360px]",
          !leftPaneCollapsed &&
            rightPaneCollapsed &&
            "md:grid-cols-[220px_1fr_2.75rem] lg:grid-cols-[260px_1fr_2.75rem] xl:grid-cols-[280px_1fr_2.75rem]",
          !leftPaneCollapsed &&
            !rightPaneCollapsed &&
            "md:grid-cols-[220px_1fr_280px] lg:grid-cols-[260px_1fr_320px] xl:grid-cols-[280px_1fr_360px]",
        )}
      >
        <aside className="flex min-h-0 flex-col border-r border-border">
          {leftPaneCollapsed ? (
            <button
              type="button"
              onClick={() => setLeftPaneCollapsed(false)}
              aria-label="Open file tree pane"
              title="Open file tree pane"
              className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground"
            >
              <PanelLeftOpen className="size-4" />
            </button>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-end border-b border-border px-1 py-1">
                <button
                  type="button"
                  onClick={() => setLeftPaneCollapsed(true)}
                  aria-label="Close file tree pane"
                  title="Close file tree pane"
                  className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground"
                >
                  <PanelLeftClose className="size-3.5" />
                </button>
              </div>
              {fileTreePanel}
            </>
          )}
        </aside>
        {editorPanel}
        <aside className="flex min-h-0 flex-col border-l border-border">
          {rightPaneCollapsed ? (
            <button
              type="button"
              onClick={() => setRightPaneCollapsed(false)}
              aria-label="Open commit pane"
              title="Open commit pane"
              className="flex h-11 w-11 shrink-0 items-center justify-center text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground"
            >
              <PanelRightOpen className="size-4" />
            </button>
          ) : (
            <>
              <div className="flex shrink-0 items-center justify-start border-b border-border px-1 py-1">
                <button
                  type="button"
                  onClick={() => setRightPaneCollapsed(true)}
                  aria-label="Close commit pane"
                  title="Close commit pane"
                  className="flex size-6 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-white/5 hover:text-foreground"
                >
                  <PanelRightClose className="size-3.5" />
                </button>
              </div>
              {commitPanel}
            </>
          )}
        </aside>
      </div>

      {/* Mobile: editor takes the full screen; the file tree and commit
          panel are collapsible slide-in panes triggered from the Menu icon
          and the commit icon already in the toolbar above — no need to
          repeat those actions in a second bar down here. */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">{editorPanel}</div>

      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="flex w-[85vw] max-w-xs flex-col gap-0 p-0 sm:max-w-sm">
          <SheetHeader className="border-b border-border p-3 text-left">
            <SheetTitle className="font-mono text-sm">Files</SheetTitle>
            <SheetDescription className="sr-only">
              Browse and open files in {fullName}.
            </SheetDescription>
          </SheetHeader>
          {fileTreePanel}
        </SheetContent>
      </Sheet>

      <Sheet open={mobileCommitOpen} onOpenChange={setMobileCommitOpen}>
        <SheetContent side="right" className="flex w-[85vw] max-w-sm flex-col gap-0 p-0">
          <SheetHeader className="border-b border-border p-3 text-left">
            <SheetTitle className="font-mono text-sm">Commit</SheetTitle>
            <SheetDescription className="sr-only">
              Write a commit message and push your changes to {branch || "the branch"}.
            </SheetDescription>
          </SheetHeader>
          {commitPanel}
        </SheetContent>
      </Sheet>

      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        groups={commandPaletteGroups}
        placeholder="Jump to a file, run a command…"
      />
    </main>
  );
}