import { useEffect, useMemo, useRef, useState } from "react";
import { unzipSync } from "fflate";
import {
  AlertTriangle,
  ChevronRight,
  File,
  FileArchive,
  Folder,
  FolderOpen,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";

export interface PendingZipFile {
  id: string;
  /** Path inside the archive, e.g. "my-project/src/App.tsx". */
  path: string;
  size: number;
  bytes: Uint8Array;
}

interface FileTreeEntry {
  type: "file";
  name: string;
  path: string;
  item: PendingZipFile;
}

interface DirTreeEntry {
  type: "dir";
  name: string;
  path: string;
  children: Map<string, DirTreeEntry | FileTreeEntry>;
}

// Noise that ships inside a lot of real-world archives and should never be
// pushed to a repository.
const IGNORED_NAMES = new Set([".DS_Store", "Thumbs.db"]);
function isIgnored(path: string): boolean {
  const segments = path.split("/");
  if (segments[0] === "__MACOSX") return true;
  const name = segments[segments.length - 1] ?? "";
  return IGNORED_NAMES.has(name);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function joinFolder(folder: string | null, relativePath: string): string {
  const cleaned = relativePath.replace(/^\/+/, "");
  return folder ? `${folder}/${cleaned}` : cleaned;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `pending-zip-${idCounter}-${Date.now()}`;
}

function buildTree(items: PendingZipFile[]): DirTreeEntry {
  const root: DirTreeEntry = { type: "dir", name: "", path: "", children: new Map() };
  for (const item of items) {
    const parts = item.path.split("/").filter(Boolean);
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i]!;
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      if (isFile) {
        cursor.children.set(`f:${segment}`, { type: "file", name: segment, path, item });
      } else {
        const key = `d:${segment}`;
        let next = cursor.children.get(key);
        if (!next || next.type !== "dir") {
          next = { type: "dir", name: segment, path, children: new Map() };
          cursor.children.set(key, next);
        }
        cursor = next;
      }
    }
  }
  return root;
}

function sortedEntries(dir: DirTreeEntry): (DirTreeEntry | FileTreeEntry)[] {
  return [...dir.children.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function countFolders(dir: DirTreeEntry): number {
  let count = 0;
  for (const entry of dir.children.values()) {
    if (entry.type === "dir") count += 1 + countFolders(entry);
  }
  return count;
}

function ZipTreePreview({
  root,
  activeFolder,
  existingPaths,
  onRemove,
  disabled,
}: {
  root: DirTreeEntry;
  activeFolder: string | null;
  existingPaths: string[];
  onRemove: (id: string) => void;
  disabled: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());

  function toggle(path: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderDir(dir: DirTreeEntry, depth: number) {
    return sortedEntries(dir).map((entry) => {
      const indent = 8 + depth * 14;
      if (entry.type === "dir") {
        const isOpen = !collapsed.has(entry.path);
        return (
          <div key={entry.path}>
            <button
              type="button"
              onClick={() => toggle(entry.path)}
              style={{ paddingLeft: indent }}
              className="flex w-full items-center gap-1.5 truncate rounded py-1.5 pr-2 text-left font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-secondary/40 hover:text-foreground"
              title={entry.path}
            >
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 transition-transform duration-200",
                  isOpen && "rotate-90",
                )}
              />
              {isOpen ? (
                <FolderOpen className="size-3.5 shrink-0 text-primary" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-primary" />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">{renderDir(entry, depth + 1)}</div>
            </div>
          </div>
        );
      }

      const fullPath = joinFolder(activeFolder, entry.item.path);
      const overwrites = existingPaths.includes(fullPath);
      return (
        <div
          key={entry.item.id}
          style={{ paddingLeft: indent + 16 }}
          className="group flex items-center gap-2 truncate rounded py-1.5 pr-2 font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-secondary/30"
          title={fullPath}
        >
          <File className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {entry.name}
            {overwrites && <span className="text-destructive"> · overwrites</span>}
          </span>
          <span className="shrink-0 text-[10px] opacity-70">{formatBytes(entry.item.size)}</span>
          <Button
            variant="ghost"
            size="icon"
            className="size-5 shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
            onClick={() => onRemove(entry.item.id)}
            disabled={disabled}
            aria-label={`Remove ${entry.item.path}`}
          >
            <X className="size-3" />
          </Button>
        </div>
      );
    });
  }

  return <div className="flex flex-col py-1">{renderDir(root, 0)}</div>;
}

export function UploadZipDialog({
  open,
  onOpenChange,
  activeFolder,
  existingPaths,
  onCommit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeFolder: string | null;
  existingPaths: string[];
  onCommit: (args: {
    message: string;
    description: string;
    files: { path: string; content: string }[];
  }) => Promise<unknown>;
}) {
  const [pending, setPending] = useState<PendingZipFile[]>([]);
  const [archiveName, setArchiveName] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setPending([]);
      setArchiveName(null);
      setMessage("");
      setDescription("");
      setIsDragging(false);
      setIsExtracting(false);
      setExtractError(null);
      setSubmitting(false);
      setProgress(0);
      setConfirmOverwriteOpen(false);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  async function extractZip(file: File) {
    setIsExtracting(true);
    setExtractError(null);
    try {
      const buffer = await file.arrayBuffer();
      const entries = unzipSync(new Uint8Array(buffer));
      const files: PendingZipFile[] = [];
      for (const [path, bytes] of Object.entries(entries)) {
        if (path.endsWith("/")) continue; // directory entry
        if (isIgnored(path)) continue;
        files.push({ id: nextId(), path, size: bytes.byteLength, bytes });
      }
      if (files.length === 0) {
        setExtractError("That archive doesn't contain any files.");
        return;
      }
      setArchiveName(file.name);
      setPending(files);
      if (!message.trim()) {
        setMessage(`Add contents of ${file.name.replace(/\.zip$/i, "")}`);
      }
    } catch {
      setExtractError("Couldn't read that file. Make sure it's a valid .zip archive.");
    } finally {
      setIsExtracting(false);
    }
  }

  function handleBrowseChange(fileList: FileList | null) {
    const file = fileList?.[0];
    if (file) void extractZip(file);
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void extractZip(file);
  }

  function removeFile(id: string) {
    setPending((prev) => prev.filter((item) => item.id !== id));
  }

  const tree = useMemo(() => buildTree(pending), [pending]);
  const folderCount = useMemo(() => countFolders(tree), [tree]);
  const totalSize = pending.reduce((sum, item) => sum + item.size, 0);
  const overwritePaths = useMemo(
    () =>
      pending
        .map((item) => joinFolder(activeFolder, item.path))
        .filter((path) => existingPaths.includes(path)),
    [pending, activeFolder, existingPaths],
  );
  const canSubmit =
    pending.length > 0 && message.trim().length > 0 && !submitting && !isExtracting;

  async function push() {
    setSubmitting(true);
    setProgress(8);
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < 88 ? p + Math.max(1, (88 - p) * 0.08) : p));
    }, 180);

    try {
      const files = pending.map((item) => ({
        path: joinFolder(activeFolder, item.path),
        content: bytesToBase64(item.bytes),
      }));
      await onCommit({ message: message.trim(), description: description.trim(), files });
      setProgress(100);
      onOpenChange(false);
    } finally {
      if (progressTimer.current) {
        clearInterval(progressTimer.current);
        progressTimer.current = null;
      }
      setSubmitting(false);
      setProgress(0);
    }
  }

  function handleSubmit() {
    if (!canSubmit) return;
    if (overwritePaths.length > 0) {
      setConfirmOverwriteOpen(true);
      return;
    }
    void push();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload ZIP</DialogTitle>
          <DialogDescription>
            {activeFolder ? (
              <>
                The archive is extracted locally and recreated under{" "}
                <span className="font-mono text-foreground">{activeFolder}/</span>, then pushed
                as a single commit.
              </>
            ) : (
              "The archive is extracted locally and recreated at the repository root, then pushed as a single commit."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors",
              isDragging ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40",
            )}
          >
            {isExtracting ? (
              <Loader2 className="size-6 animate-spin text-primary" />
            ) : (
              <FileArchive className="size-6 text-muted-foreground" />
            )}
            <p className="text-sm">
              <span className="font-medium text-foreground">Click to choose a .zip</span> or drag
              and drop one here
            </p>
            <p className="text-xs text-muted-foreground">
              {isExtracting
                ? "Extracting…"
                : archiveName
                  ? `Loaded ${archiveName} — drop another to replace it`
                  : "Extracted locally in your browser, folder structure preserved"}
            </p>
            <input
              ref={inputRef}
              type="file"
              accept=".zip,application/zip,application/x-zip-compressed"
              className="hidden"
              onChange={(e) => {
                handleBrowseChange(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {extractError && (
            <p className="flex items-center gap-1.5 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <AlertTriangle className="size-3.5 shrink-0" />
              {extractError}
            </p>
          )}

          {pending.length > 0 && (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {pending.length} file{pending.length === 1 ? "" : "s"}
                  {folderCount > 0 && (
                    <>
                      {" "}
                      in {folderCount} folder{folderCount === 1 ? "" : "s"}
                    </>
                  )}{" "}
                  ready to push
                  {overwritePaths.length > 0 && (
                    <span className="text-destructive">
                      {" "}
                      · {overwritePaths.length} will overwrite
                    </span>
                  )}
                </span>
                <span>{formatBytes(totalSize)} total</span>
              </div>

              <ScrollArea className="max-h-56 rounded-md border border-border">
                <ZipTreePreview
                  root={tree}
                  activeFolder={activeFolder}
                  existingPaths={existingPaths}
                  onRemove={removeFile}
                  disabled={submitting}
                />
              </ScrollArea>

              <Button
                variant="ghost"
                size="sm"
                className="w-fit text-xs text-muted-foreground hover:text-destructive"
                onClick={() => {
                  setPending([]);
                  setArchiveName(null);
                }}
                disabled={submitting}
              >
                <Trash2 className="size-3.5" />
                Clear all
              </Button>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="zip-commit-message">Commit message</Label>
            <Input
              id="zip-commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Add ${pending.length || ""} file${pending.length === 1 ? "" : "s"}`}
              className="h-8 text-xs"
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="zip-commit-description">Extended description (optional)</Label>
            <Textarea
              id="zip-commit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Extended description (optional)"
              className="min-h-16 text-xs"
              disabled={submitting}
            />
          </div>

          {submitting && (
            <div className="space-y-1.5">
              <Progress value={progress} />
              <p className="text-xs text-muted-foreground">Pushing archive to GitHub…</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UploadCloud className="size-4" />
            )}
            {pending.length > 0
              ? `Push ${pending.length} file${pending.length === 1 ? "" : "s"}`
              : "Push files"}
          </Button>
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmOverwriteOpen} onOpenChange={setConfirmOverwriteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Overwrite existing files?</AlertDialogTitle>
            <AlertDialogDescription>
              {overwritePaths.length} file{overwritePaths.length === 1 ? "" : "s"} from this
              archive already exist{overwritePaths.length === 1 ? "s" : ""} in the repository and
              will be replaced with the extracted version. This can't be undone from here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ScrollArea className="max-h-32 rounded-md border border-border">
            <ul className="divide-y divide-border">
              {overwritePaths.map((path) => (
                <li key={path} className="truncate px-3 py-1.5 font-mono text-[11px]">
                  {path}
                </li>
              ))}
            </ul>
          </ScrollArea>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOverwriteOpen(false);
                void push();
              }}
            >
              Overwrite {overwritePaths.length} file{overwritePaths.length === 1 ? "" : "s"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
