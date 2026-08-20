import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  Lock,
  File as FileIcon,
  Download,
  Trash2,
  Save,
  Plus,
  GitBranch,
  History,
  ShieldAlert,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/share/$token")({
  component: SharePage,
});

type Role = "viewer" | "editor" | "developer" | "admin";

interface SessionInfo {
  role: Role;
  fullName: string;
  allowDownload: boolean;
  expiresAt: string;
}

interface TreeNode {
  path: string;
  type: "blob" | "tree";
  size: number;
}

const ROLE_LABEL: Record<Role, string> = { viewer: "Viewer", editor: "Editor", developer: "Developer", admin: "Admin" };

function canWrite(role: Role) {
  return role === "editor" || role === "developer" || role === "admin";
}
function canBranch(role: Role) {
  return role === "developer" || role === "admin";
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "same-origin" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error((body as { error?: string }).error ?? "Request failed.");
  return body;
}

function SharePage() {
  const { token } = Route.useParams();
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [branches, setBranches] = useState<{ name: string; protected: boolean }[]>([]);
  const [branch, setBranch] = useState<string>("");
  const [tree, setTree] = useState<TreeNode[] | null>(null);
  const [treeLoading, setTreeLoading] = useState(false);

  const [activePath, setActivePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [fileSha, setFileSha] = useState<string | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [commitMessage, setCommitMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const [newBranchName, setNewBranchName] = useState("");
  const [showCommits, setShowCommits] = useState(false);
  const [commits, setCommits] = useState<{ sha: string; message: string; author: string; date: string }[]>([]);

  const redeemedOnce = useRef(false);

  // Redeem once on mount, then fall back to the session-check endpoint on
  // any later re-mount (e.g. navigating back) so refreshing the page never
  // re-consumes the link's usage count a second time.
  useEffect(() => {
    if (redeemedOnce.current) return;
    redeemedOnce.current = true;
    (async () => {
      try {
        const existing = await api<{ active: boolean } & Partial<SessionInfo>>("/api/public/share/session");
        if (existing.active) {
          setSession({
            role: existing.role!,
            fullName: existing.fullName!,
            allowDownload: existing.allowDownload!,
            expiresAt: existing.expiresAt!,
          });
          return;
        }
        const redeemed = await api<SessionInfo>("/api/public/share/redeem", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        setSession(redeemed);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't open this link.");
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const info = await api<{ defaultBranch: string; description: string | null; sizeKb: number }>(
          "/api/public/share/repo?action=info",
        );
        setBranch(info.defaultBranch);
        const b = await api<{ branches: { name: string; protected: boolean }[] }>("/api/public/share/repo?action=branches");
        setBranches(b.branches);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Couldn't load repository info.");
      }
    })();
  }, [session]);

  useEffect(() => {
    if (!session || !branch) return;
    setTreeLoading(true);
    setActivePath(null);
    api<{ nodes: TreeNode[] }>(`/api/public/share/repo?action=tree&branch=${encodeURIComponent(branch)}`)
      .then((r) => setTree(r.nodes.filter((n) => n.type === "blob").sort((a, b) => a.path.localeCompare(b.path))))
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't load files."))
      .finally(() => setTreeLoading(false));
  }, [session, branch]);

  const openFile = async (path: string) => {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setActivePath(path);
    setFileLoading(true);
    setDirty(false);
    try {
      const file = await api<{ content: string; sha: string }>(
        `/api/public/share/repo?action=file&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(path)}`,
      );
      setFileContent(file.content);
      setFileSha(file.sha);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't open that file.");
    } finally {
      setFileLoading(false);
    }
  };

  const save = async () => {
    if (!activePath || !session) return;
    if (!commitMessage.trim()) {
      toast.error("A commit message is required.");
      return;
    }
    setSaving(true);
    try {
      await api("/api/public/share/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "putFile",
          branch,
          path: activePath,
          content: fileContent,
          message: commitMessage,
          sha: fileSha,
        }),
      });
      toast.success("Change committed.");
      setDirty(false);
      setCommitMessage("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!activePath) return;
    if (!confirm(`Delete ${activePath}?`)) return;
    try {
      await api("/api/public/share/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "deleteFile", branch, path: activePath, message: `Delete ${activePath}` }),
      });
      toast.success("File deleted.");
      setTree((t) => t?.filter((n) => n.path !== activePath) ?? null);
      setActivePath(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete.");
    }
  };

  const createBranch = async () => {
    if (!newBranchName.trim()) return;
    try {
      await api("/api/public/share/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "createBranch", newBranch: newBranchName.trim(), fromBranch: branch }),
      });
      toast.success(`Branch ${newBranchName} created.`);
      setBranches((b) => [...b, { name: newBranchName.trim(), protected: false }]);
      setNewBranchName("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't create branch.");
    }
  };

  const download = () => {
    window.location.href = `/api/public/share/repo?action=download&branch=${encodeURIComponent(branch)}`;
  };

  const loadCommits = async () => {
    setShowCommits(true);
    try {
      const r = await api<{ commits: typeof commits }>(
        `/api/public/share/repo?action=commits&branch=${encodeURIComponent(branch)}${activePath ? `&path=${encodeURIComponent(activePath)}` : ""}`,
      );
      setCommits(r.commits);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load commit history.");
    }
  };

  const expiresLabel = useMemo(() => {
    if (!session) return "";
    const ms = new Date(session.expiresAt).getTime() - Date.now();
    if (ms <= 0) return "expired";
    const mins = Math.round(ms / 60000);
    return mins < 60 ? `${mins}m` : `${Math.round(mins / 60)}h`;
  }, [session]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="size-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-sm text-center">
          <Lock className="mx-auto size-8 text-muted-foreground" />
          <h1 className="mt-4 text-lg font-semibold text-foreground">This access link has expired.</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error ?? "This access link has expired or has already reached its maximum number of uses."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
        <span className="font-mono text-sm font-medium">{session.fullName}</span>
        <Badge variant="secondary" className="text-[10px]">
          {ROLE_LABEL[session.role]} access
        </Badge>
        <span className="text-[11px] text-muted-foreground">Session expires in {expiresLabel}</span>
        <div className="ml-auto flex items-center gap-2">
          {branches.length > 0 && (
            <Select value={branch} onValueChange={setBranch}>
              <SelectTrigger className="h-8 w-36 text-xs">
                <GitBranch className="size-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.name} value={b.name}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Button variant="outline" size="sm" onClick={loadCommits}>
            <History className="size-3.5" /> History
          </Button>
          {session.allowDownload && (
            <Button variant="outline" size="sm" onClick={download}>
              <Download className="size-3.5" /> Download
            </Button>
          )}
        </div>
      </header>

      {!session.allowDownload && session.role === "viewer" && (
        <div className="flex items-center gap-2 border-b border-amber-500/30 bg-amber-500/5 px-4 py-2 text-[11px] text-amber-600 dark:text-amber-400">
          <Eye className="size-3.5" /> You can browse and read files, but downloads are disabled for this link.
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-border p-2">
          {canBranch(session.role) && (
            <div className="mb-2 flex items-center gap-1.5 border-b border-border pb-2">
              <Input
                value={newBranchName}
                onChange={(e) => setNewBranchName(e.target.value)}
                placeholder="new-branch"
                className="h-7 text-[11px]"
              />
              <Button size="icon" variant="outline" className="size-7 shrink-0" onClick={createBranch}>
                <Plus className="size-3.5" />
              </Button>
            </div>
          )}
          {treeLoading ? (
            <div className="flex h-24 items-center justify-center">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ul className="space-y-0.5">
              {(tree ?? []).map((node) => (
                <li key={node.path}>
                  <button
                    type="button"
                    onClick={() => void openFile(node.path)}
                    className={cn(
                      "flex w-full items-center gap-1.5 truncate rounded px-1.5 py-1 text-left text-[11px] hover:bg-muted",
                      activePath === node.path && "bg-muted font-medium",
                    )}
                    title={node.path}
                  >
                    <FileIcon className="size-3 shrink-0 text-muted-foreground" />
                    <span className="truncate">{node.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <main className="flex flex-1 flex-col overflow-hidden">
          {showCommits ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Commit history
                </h2>
                <Button size="sm" variant="ghost" onClick={() => setShowCommits(false)}>
                  Close
                </Button>
              </div>
              <ul className="space-y-2">
                {commits.map((c) => (
                  <li key={c.sha} className="rounded-md border border-border p-2 text-xs">
                    <div className="font-mono text-[11px] text-muted-foreground">{c.sha}</div>
                    <div>{c.message}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {c.author} · {new Date(c.date).toLocaleString()}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : activePath ? (
            <>
              <div className="flex items-center justify-between border-b border-border px-4 py-2">
                <span className="truncate font-mono text-xs">{activePath}</span>
                {canWrite(session.role) && (
                  <div className="flex items-center gap-1.5">
                    <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={remove}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                )}
              </div>
              {fileLoading ? (
                <div className="flex flex-1 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-primary" />
                </div>
              ) : (
                <>
                  <Textarea
                    value={fileContent}
                    onChange={(e) => {
                      setFileContent(e.target.value);
                      setDirty(true);
                    }}
                    readOnly={!canWrite(session.role)}
                    spellCheck={false}
                    className="flex-1 resize-none rounded-none border-0 font-mono text-xs focus-visible:ring-0"
                  />
                  {canWrite(session.role) && dirty && (
                    <div className="flex items-center gap-2 border-t border-border p-2">
                      <Input
                        value={commitMessage}
                        onChange={(e) => setCommitMessage(e.target.value)}
                        placeholder="Commit message"
                        className="h-8 text-xs"
                      />
                      <Button size="sm" disabled={saving} onClick={save}>
                        {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                        Commit
                      </Button>
                    </div>
                  )}
                </>
              )}
            </>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
              <ShieldAlert className="size-6" />
              <p className="text-sm">Select a file to view it.</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
