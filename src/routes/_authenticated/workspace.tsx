import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
  Menu,
  Upload,
  UploadCloud,
  FolderUp,
  GitCommitHorizontal,
  MoreVertical,
  Download,
  Pencil,
  RefreshCw,
  Copy,
  History,
} from "lucide-react";
import {
  listRepoBranches,
  listRepoTree,
  readRepoFile,
  pushFile,
  pushFiles,
  downloadRepoZip,
  listRepoCommits,
} from "@/lib/github.functions";
import { getPreferences, updatePreferences } from "@/lib/workspace.functions";
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
import { NewFileDialog } from "@/components/new-file-dialog";
import { BulkUploadDialog } from "@/components/bulk-upload-dialog";
import { UploadFolderDialog } from "@/components/upload-folder-dialog";
import { FileTree } from "@/components/file-tree";
import { EmptyState } from "@/components/empty-state";
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
  const zipFn = useServerFn(downloadRepoZip);
  const commitsFn = useServerFn(listRepoCommits);

  const prefs = useQuery({ queryKey: ["prefs"], queryFn: () => prefsFn() });
  const accountId = prefs.data?.activeAccountId ?? null;
  const fullName = prefs.data?.activeRepo ?? null;

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
  const [activeFolder, setActiveFolder] = useState<string | null>(null);
  const [newFileOpen, setNewFileOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [uploadFolderOpen, setUploadFolderOpen] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileCommitOpen, setMobileCommitOpen] = useState(false);

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
  });

  const latestCommit = useQuery({
    queryKey: ["commits", accountId, fullName, branch],
    queryFn: () => commitsFn({ data: { accountId: accountId!, fullName: fullName!, branch } }),
    enabled: Boolean(accountId && fullName && branch),
    select: (commits) => commits[0] ?? null,
  });

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
      void queryClient.invalidateQueries({ queryKey: ["tree"] });
      void queryClient.invalidateQueries({ queryKey: ["commits"] });
      void queryClient.invalidateQueries({ queryKey: ["pushes"] });
      return result;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't push those files.");
      throw error;
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
      <main className="flex h-[calc(100vh-3rem)] items-center justify-center px-4">
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
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Find file…"
          className="h-8 font-mono text-xs"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-1">
        <FileTree
          nodes={tree.data?.nodes ?? []}
          loading={tree.isLoading}
          filter={filter}
          activePath={path}
          activeFolder={activeFolder}
          onOpenFile={(target) => openFile.mutate(target)}
          onSelectFolder={(target) => setActiveFolder(target)}
        />
      </div>
    </div>
  );

  const commitPanel = (
    <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
      <p className="label-caps">Commit</p>
      <Input
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Add Button component"
        className="h-8 text-xs"
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
      <Button
        className="mt-auto"
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
    <main className="flex h-[calc(100vh-3rem-var(--dock-space,7rem))] flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2 sm:gap-3 sm:px-4">
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 shrink-0 md:hidden"
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
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
              aria-label="Repository actions"
            >
              <MoreVertical className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
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
          <Button variant="outline" size="sm" onClick={() => setShowDiff((v) => !v)} disabled={!dirty}>
            <span className="hidden sm:inline">{showDiff ? "Hide diff" : "View diff"}</span>
            <span className="sm:hidden">{showDiff ? "Hide" : "Diff"}</span>
          </Button>
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-md border border-border px-2 text-xs sm:px-3">
            <Upload className="size-3.5" />
            <span className="hidden sm:inline">Upload</span>
            <input type="file" className="hidden" onChange={(e) => onUpload(e.target.files)} />
          </label>
          <Button variant="outline" size="sm" onClick={() => setBulkUploadOpen(true)}>
            <UploadCloud className="size-3.5" />
            <span className="hidden sm:inline">Bulk upload</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setUploadFolderOpen(true)}>
            <FolderUp className="size-3.5" />
            <span className="hidden sm:inline">Upload folder</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setNewFileOpen(true)}>
            <FilePlus className="size-3.5" />
            <span className="hidden sm:inline">New file</span>
          </Button>
          <Button
            size="sm"
            className="relative md:hidden"
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

      <UploadFolderDialog
        open={uploadFolderOpen}
        onOpenChange={setUploadFolderOpen}
        activeFolder={activeFolder}
        existingPaths={filePaths}
        onCommit={handleBulkCommit}
      />

      {/* Desktop & tablet: persistent three-pane layout, like a WhatsApp-style
          side pane (files) + main content (editor) + right pane (commit). */}
      <div className="hidden min-h-0 flex-1 md:grid md:grid-cols-[220px_1fr_280px] lg:grid-cols-[260px_1fr_320px] xl:grid-cols-[280px_1fr_360px]">
        <aside className="flex min-h-0 flex-col border-r border-border">{fileTreePanel}</aside>
        {editorPanel}
        <aside className="flex min-h-0 flex-col border-l border-border">{commitPanel}</aside>
      </div>

      {/* Mobile: editor takes the full screen; the file tree and commit
          panel become collapsible slide-in panes triggered from the toolbar
          and the sticky bar below. */}
      <div className="flex min-h-0 flex-1 flex-col md:hidden">{editorPanel}</div>

      <div className="flex items-center justify-between gap-2 border-t border-border bg-background px-3 py-2 md:hidden">
        <Button variant="outline" size="sm" className="flex-1" onClick={() => setMobileSidebarOpen(true)}>
          <Menu className="size-3.5" />
          Files
        </Button>
        <Button size="sm" className="relative flex-1" onClick={() => setMobileCommitOpen(true)}>
          <GitCommitHorizontal className="size-3.5" />
          Commit
          {dirty && <span className="absolute right-3 top-1.5 size-2 rounded-full bg-success" />}
        </Button>
      </div>

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