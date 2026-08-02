import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";
import { diffLines } from "diff";
import {
  FilePlus,
  FilePlus2,
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
} from "lucide-react";
import {
  listRepoBranches,
  listRepoTree,
  readRepoFile,
  pushFile,
  pushFiles,
  deleteFile,
  downloadRepoZip,
  listRepoCommits,
  getRepoDetails,
} from "@/lib/github.functions";
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
import { NewFileDialog } from "@/components/new-file-dialog";
import { BulkUploadDialog } from "@/components/bulk-upload-dialog";
import { UploadFolderDialog } from "@/components/upload-folder-dialog";
import { UploadZipDialog } from "@/components/upload-zip-dialog";
import { ProUpgradeDialog } from "@/components/pro-upgrade-dialog";
import { FileTree } from "@/components/file-tree";
import { FileBreadcrumbs } from "@/components/breadcrumb-nav";
import { RecentFiles } from "@/components/recent-files";
import { FavoritePaths } from "@/components/favorite-paths";
import { EmptyState } from "@/components/empty-state";
import { usePlan } from "@/hooks/usePlan";
import { cn } from "@/lib/utils";

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

function Workspace() {
  const queryClient = useQueryClient();
  const prefsFn = useServerFn(getPreferences);
  const updatePrefsFn = useServerFn(updatePreferences);
  const branchesFn = useServerFn(listRepoBranches);
  const treeFn = useServerFn(listRepoTree);
  const readFn = useServerFn(readRepoFile);
  const pushFn = useServerFn(pushFile);
  const pushFilesFn = useServerFn(pushFiles);
  const deleteFileFn = useServerFn(deleteFile);
  const zipFn = useServerFn(downloadRepoZip);
  const commitsFn = useServerFn(listRepoCommits);
  const repoDetailsFn = useServerFn(getRepoDetails);
  const recentFilesFn = useServerFn(listRecentFiles);
  const touchRecentFileFn = useServerFn(touchRecentFile);
  const clearRecentFilesFn = useServerFn(clearRecentFiles);
  const favoritePathsFn = useServerFn(listFavoritePaths);
  const setPathFavoriteFn = useServerFn(setPathFavorite);

  const prefs = useQuery({ queryKey: ["prefs"], queryFn: () => prefsFn() });
  const accountId = prefs.data?.activeAccountId ?? null;
  const fullName = prefs.data?.activeRepo ?? null;

  // Reads off the same ["prefs"] cache already populated above, so this
  // doesn't trigger an extra fetch — see usePlan for the shared plan logic.
  const { isPro } = usePlan();

  const [branch, setBranch] = useState<string>("");
  const [path, setPath] = useState("");
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [baseSha, setBaseSha] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [showDiff, setShowDiff] = useState(false);
  const [filter, setFilter] = useState("");
  const [renameOpen, setRenameOpen] = useState(false);
  const [repoInfoOpen, setRepoInfoOpen] = useState(false);
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [bulkUploadUpgradeOpen, setBulkUploadUpgradeOpen] = useState(false);
  const [uploadFolderOpen, setUploadFolderOpen] = useState(false);
  const [uploadZipOpen, setUploadZipOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileCommitOpen, setMobileCommitOpen] = useState(false);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!branch && prefs.data?.defaultBranch) setBranch(prefs.data.defaultBranch);
  }, [branch, prefs.data?.defaultBranch]);

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
    activeFolder && favoritePaths.data?.some((favorite) => favorite.path === activeFolder),
  );

  function toggleFolderFavorite(target: string, next: boolean) {
    if (!fullName) return;
    setPathFavoriteFn({ data: { fullName, path: target, isFavorite: next } })
      .then(() => void queryClient.invalidateQueries({ queryKey: ["favorite-paths", fullName] }))
      .catch((error: Error) => toast.error(error.message || "Couldn't update favorite paths."));
  }

  // Fire-and-forget: records that a file was just opened or edited so it
  // shows up (and stays sorted) in the Recent Files panel. Failures here
  // shouldn't interrupt the user's actual work, so they're swallowed.
  function recordRecentFile(target: string) {
    if (!fullName || !branch) return;
    touchRecentFileFn({
      data: { accountId: accountId ?? undefined, fullName, branch, path: target },
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
      toast.success(`Pushed ${result.path} (${result.commitSha})`);
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

  const diff = useMemo(() => (showDiff ? diffLines(original, content) : []), [showDiff, original, content]);
  const dirty = content !== original;

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
      // If the file that was just deleted is open in the editor, clear it out
      // so the user isn't left editing content that no longer exists on GitHub.
      if (args.targetPath === path) {
        setPath("");
        setContent("");
        setOriginal("");
        setBaseSha(null);
        setShowDiff(false);
      }
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

  async function handleCopyPath(target: string) {
    try {
      await navigator.clipboard.writeText(target);
      toast.success("Path copied to clipboard");
    } catch {
      toast.error("Couldn't copy the file path.");
    }
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

  if (prefs.isLoading) {
    return (
      <div className="flex h-[60vh] items-center justify-center">
        <Loader2 className="size-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!accountId || !fullName) {
    return (
      <main className="flex h-[calc(100dvh-3rem)] items-center justify-center px-4">
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

  const filePaths = (tree.data?.nodes ?? []).filter((n) => n.type === "blob").map((n) => n.path);

  const fileTreePanel = (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-2">
        <div className="mb-2 flex items-center gap-1">
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
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find file, folder, or .ext…"
          className="h-8 font-mono text-xs"
        />
      </div>
      <FavoritePaths
        paths={favoritePaths.data ?? []}
        loading={favoritePaths.isLoading}
        activeFolder={activeFolder}
        onNavigate={setActiveFolder}
        onRemove={(target) => toggleFolderFavorite(target, false)}
      />
      <RecentFiles
        files={recentFiles.data ?? []}
        loading={recentFiles.isLoading}
        activePath={path}
        onOpenFile={(target) => openFile.mutate(target)}
        onClear={handleClearRecentFiles}
      />
      <div className="min-h-0 flex-1 overflow-auto p-1">
        <FileTree
          nodes={tree.data?.nodes ?? []}
          loading={tree.isLoading}
          filter={filter}
          activePath={path}
          activeFolder={activeFolder}
          onOpenFile={(target) => openFile.mutate(target)}
          onSelectFolder={(target) => setActiveFolder(target)}
          onCopyPath={handleCopyPath}
          onDeleteFile={handleDeleteFile}
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
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <p className="label-caps">Commit</p>
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
          disabled={!path || !message.trim() || !branch || commit.isPending}
          onClick={() => commit.mutate()}
        >
          {commit.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <GitCommitHorizontal className="size-4" />
          )}
          Commit &amp; push
        </Button>
      </div>
    </div>
  );

  const editorPanel = (
    <section className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border p-2">
        <Input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          placeholder="src/components/Button.tsx"
          className="h-8 font-mono text-xs"
        />
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
            theme="vs-dark"
            language={languageFor(path)}
            value={content}
            onChange={(value) => setContent(value ?? "")}
            options={{
              fontFamily: "JetBrains Mono, ui-monospace, monospace",
              fontSize: prefs.data?.editorFontSize ?? 13,
              tabSize: prefs.data?.tabWidth ?? 2,
              wordWrap: prefs.data?.wordWrap ? "on" : "off",
              minimap: { enabled: false },
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
    <main className="flex h-[calc(100dvh-3rem-var(--dock-space,7rem))] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:gap-3 sm:px-4">
        <Button
          variant="outline"
          size="icon"
          className="h-10 w-10 shrink-0 md:hidden"
          aria-label={mobileSidebarOpen ? "Close file tree" : "Open file tree"}
          onClick={() => setMobileSidebarOpen((v) => !v)}
        >
          <Menu className="size-4" />
        </Button>
        <span className="min-w-0 truncate font-mono text-sm">{fullName}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 shrink-0 text-muted-foreground hover:text-foreground sm:h-8 sm:w-8"
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
            <DropdownMenuItem onSelect={handleRenameRepository}>
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
          fullName={fullName}
          totalFiles={tree.data ? filePaths.length : null}
          latestCommit={latestCommit.data ?? null}
          details={repoDetails.data}
          loading={repoDetails.isLoading}
        />
        <Select value={branch} onValueChange={setBranch}>
          <SelectTrigger className="h-8 w-28 font-mono text-xs sm:w-48">
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
        {latestCommit.data && (
          <span className="hidden max-w-[280px] items-center gap-1.5 truncate text-xs text-muted-foreground lg:inline-flex">
            <History className="size-3 shrink-0" />
            <span className="shrink-0 font-mono">{latestCommit.data.sha}</span>
            <span className="truncate">{latestCommit.data.message}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9 sm:h-8"
            onClick={() => setShowDiff((v) => !v)}
            disabled={!dirty}
          >
            <span className="hidden sm:inline">{showDiff ? "Hide diff" : "View diff"}</span>
            <span className="sm:hidden">{showDiff ? "Hide" : "Diff"}</span>
          </Button>

          {/* On narrow screens, five separate icon-only buttons here would
              wrap into a cramped, hard-to-tap row. Instead, collapse Upload /
              Bulk upload / Upload folder / Upload ZIP / New file into one
              "Add" menu whose items get a full-width, comfortably-sized tap
              target. The full row of individual buttons stays for sm+. */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="h-9 w-9 shrink-0 sm:hidden">
                <Plus className="size-4" />
                <span className="sr-only">Add files</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onSelect={() => uploadInputRef.current?.click()}>
                <Upload className="size-3.5" />
                Upload
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={openBulkUpload}>
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
              <DropdownMenuItem onSelect={() => setUploadFolderOpen(true)}>
                <FolderUp className="size-3.5" />
                Upload folder
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setUploadZipOpen(true)}>
                <FileArchive className="size-3.5" />
                Upload ZIP
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setNewFileOpen(true)}>
                <FilePlus className="size-3.5" />
                New file
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
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => uploadInputRef.current?.click()}
          >
            <Upload className="size-3.5" />
            <span className="hidden sm:inline">Upload</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={openBulkUpload}
          >
            {isPro ? (
              <UploadCloud className="size-3.5" />
            ) : (
              <Lock className="size-3.5" />
            )}
            <span className="hidden sm:inline">Bulk upload</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setUploadFolderOpen(true)}
          >
            <FolderUp className="size-3.5" />
            <span className="hidden sm:inline">Upload folder</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setUploadZipOpen(true)}
          >
            <FileArchive className="size-3.5" />
            <span className="hidden sm:inline">Upload ZIP</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => setNewFileOpen(true)}
          >
            <FilePlus className="size-3.5" />
            <span className="hidden sm:inline">New file</span>
          </Button>
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

      <UploadZipDialog
        open={uploadZipOpen}
        onOpenChange={setUploadZipOpen}
        activeFolder={activeFolder}
        existingPaths={filePaths}
        onCommit={handleBulkCommit}
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

      {/* Desktop & tablet: persistent three-pane layout, like a WhatsApp-style
          side pane (files) + main content (editor) + right pane (commit). */}
      <div className="hidden min-h-0 flex-1 md:grid md:grid-cols-[220px_1fr_280px] lg:grid-cols-[260px_1fr_320px] xl:grid-cols-[280px_1fr_360px]">
        <aside className="flex min-h-0 flex-col border-r border-border">{fileTreePanel}</aside>
        {editorPanel}
        <aside className="flex min-h-0 flex-col border-l border-border">{commitPanel}</aside>
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
    </main>
  );
}