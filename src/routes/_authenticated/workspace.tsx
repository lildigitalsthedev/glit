import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import Editor from "@monaco-editor/react";
import { diffLines } from "diff";
import {
  File,
  FilePlus,
  GitBranch,
  Loader2,
  Upload,
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
import { RenameRepositoryDialog } from "@/components/rename-repository-dialog";
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

  const files = useMemo(
    () =>
      (tree.data?.nodes ?? [])
        .filter((node) => node.type === "blob")
        .filter((node) => node.path.toLowerCase().includes(filter.toLowerCase()))
        .slice(0, 500),
    [tree.data, filter],
  );

  const openFile = useMutation({
    mutationFn: (target: string) =>
      readFn({ data: { accountId: accountId!, fullName: fullName!, branch, path: target } }),
    onSuccess: (file, target) => {
      setPath(target);
      setContent(file.content);
      setOriginal(file.content);
      setBaseSha(file.sha);
      setShowDiff(false);
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
      <main className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-xl font-semibold tracking-tight">Pick a repository first</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Choose a repo from your dashboard to open it in the workspace.
        </p>
        <Button asChild className="mt-6">
          <Link to="/app">Go to repositories</Link>
        </Button>
      </main>
    );
  }

  return (
    <main className="flex h-[calc(100vh-3rem)] flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2">
        <span className="font-mono text-sm">{fullName}</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
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
          <SelectTrigger className="h-8 w-48 font-mono text-xs">
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
          <span className="hidden max-w-[280px] items-center gap-1.5 truncate text-xs text-muted-foreground md:inline-flex">
            <History className="size-3 shrink-0" />
            <span className="shrink-0 font-mono">{latestCommit.data.sha}</span>
            <span className="truncate">{latestCommit.data.message}</span>
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowDiff((v) => !v)} disabled={!dirty}>
            {showDiff ? "Hide diff" : "View diff"}
          </Button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs">
            <Upload className="size-3.5" />
            Upload
            <input type="file" className="hidden" onChange={(e) => onUpload(e.target.files)} />
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setPath("");
              setContent("");
              setOriginal("");
              setBaseSha(null);
            }}
          >
            <FilePlus className="size-3.5" />
            New file
          </Button>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[260px_1fr_320px]">
        <aside className="flex min-h-0 flex-col border-r border-border">
          <div className="border-b border-border p-2">
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Find file…"
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-1">
            {tree.isLoading && (
              <div className="flex h-24 items-center justify-center">
                <Loader2 className="size-4 animate-spin text-primary" />
              </div>
            )}
            {files.map((node) => (
              <button
                key={node.path}
                onClick={() => openFile.mutate(node.path)}
                className={cn(
                  "flex w-full items-center gap-2 truncate rounded px-2 py-1 text-left font-mono text-[11px] transition-colors",
                  node.path === path
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <File className="size-3 shrink-0" />
                <span className="truncate">{node.path}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          <div className="border-b border-border p-2">
            <Input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="src/components/Button.tsx"
              className="h-8 font-mono text-xs"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {showDiff ? (
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

        <aside className="flex min-h-0 flex-col gap-3 border-l border-border p-3">
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
        </aside>
      </div>
    </main>
  );
}