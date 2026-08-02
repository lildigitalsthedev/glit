import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  FolderUp,
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
import { cn } from "@/lib/utils";

export interface PendingFolderFile {
  id: string;
  /** Path relative to the dropped/selected folder, e.g. "src/App.tsx". */
  relativePath: string;
  size: number;
  file: File;
}

interface FileTreeEntry {
  type: "file";
  name: string;
  relativePath: string;
  item: PendingFolderFile;
}

interface DirTreeEntry {
  type: "dir";
  name: string;
  relativePath: string;
  children: Map<string, DirTreeEntry | FileTreeEntry>;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const commaIndex = result.indexOf(",");
      resolve(commaIndex === -1 ? result : result.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error(`Couldn't read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function joinFolder(folder: string | null, relativePath: string): string {
  const cleaned = relativePath.replace(/^\/+/, "");
  return folder ? `${folder}/${cleaned}` : cleaned;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `pending-folder-${idCounter}-${Date.now()}`;
}

/** Recursively walks a dropped `FileSystemEntry`, collecting every file with
 * a path relative to the folder that was dropped. */
async function walkEntry(
  entry: FileSystemEntry,
  prefix: string,
  out: { file: File; relativePath: string }[],
): Promise<void> {
  if (entry.isFile) {
    const fileEntry = entry as FileSystemFileEntry;
    const file = await new Promise<File>((resolve, reject) => fileEntry.file(resolve, reject));
    out.push({ file, relativePath: prefix ? `${prefix}/${entry.name}` : entry.name });
    return;
  }
  if (entry.isDirectory) {
    const dirEntry = entry as FileSystemDirectoryEntry;
    const reader = dirEntry.createReader();
    const children: FileSystemEntry[] = await new Promise((resolve, reject) => {
      const all: FileSystemEntry[] = [];
      const readBatch = () => {
        reader.readEntries((batch) => {
          if (!batch.length) {
            resolve(all);
            return;
          }
          all.push(...batch);
          readBatch();
        }, reject);
      };
      readBatch();
    });
    const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
    for (const child of children) {
      await walkEntry(child, nextPrefix, out);
    }
  }
}

function buildTree(items: PendingFolderFile[]): DirTreeEntry {
  const root: DirTreeEntry = { type: "dir", name: "", relativePath: "", children: new Map() };
  for (const item of items) {
    const parts = item.relativePath.split("/").filter(Boolean);
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i]!;
      const isFile = i === parts.length - 1;
      const relativePath = parts.slice(0, i + 1).join("/");
      if (isFile) {
        cursor.children.set(`f:${segment}`, { type: "file", name: segment, relativePath, item });
      } else {
        const key = `d:${segment}`;
        let next = cursor.children.get(key);
        if (!next || next.type !== "dir") {
          next = { type: "dir", name: segment, relativePath, children: new Map() };
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

function FolderTreePreview({
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
        const isOpen = !collapsed.has(entry.relativePath);
        return (
          <div key={entry.relativePath}>
            <button
              type="button"
              onClick={() => toggle(entry.relativePath)}
              style={{ paddingLeft: indent }}
              className="flex w-full items-center gap-1.5 truncate rounded py-1.5 pr-2 text-left font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-secondary/40 hover:text-foreground"
              title={entry.relativePath}
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

      const fullPath = joinFolder(activeFolder, entry.item.relativePath);
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
            aria-label={`Remove ${entry.item.relativePath}`}
          >
            <X className="size-3" />
          </Button>
        </div>
      );
    });
  }

  return <div className="flex flex-col py-1">{renderDir(root, 0)}</div>;
}

export function UploadFolderDialog({
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
  const [pending, setPending] = useState<PendingFolderFile[]>([]);
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [isReadingDrop, setIsReadingDrop] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const progressTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (open) {
      setPending([]);
      setMessage("");
      setDescription("");
      setIsDragging(false);
      setIsReadingDrop(false);
      setSubmitting(false);
      setProgress(0);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  // The `webkitdirectory` attribute isn't in React's typings, so it's
  // applied imperatively once the input mounts.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.setAttribute("webkitdirectory", "");
    el.setAttribute("directory", "");
  }, []);

  function addEntries(entries: { file: File; relativePath: string }[]) {
    if (!entries.length) return;
    setPending((prev) => {
      const next = [...prev];
      for (const { file, relativePath } of entries) {
        const dupeIndex = next.findIndex((item) => item.relativePath === relativePath);
        const entry: PendingFolderFile = { id: nextId(), relativePath, size: file.size, file };
        if (dupeIndex === -1) next.push(entry);
        else next[dupeIndex] = entry;
      }
      return next;
    });
  }

  function handleBrowseChange(fileList: FileList | null) {
    if (!fileList || !fileList.length) return;
    const entries = Array.from(fileList).map((file) => ({
      file,
      // webkitRelativePath already includes the chosen folder as its root,
      // e.g. "my-folder/src/App.tsx" — exactly what we want to recreate.
      relativePath: file.webkitRelativePath || file.name,
    }));
    addEntries(entries);
  }

  async function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const items = e.dataTransfer.items;
    if (!items || !items.length) return;

    setIsReadingDrop(true);
    try {
      const results: { file: File; relativePath: string }[] = [];
      const topLevelEntries: FileSystemEntry[] = [];
      for (let i = 0; i < items.length; i++) {
        const entry = items[i]?.webkitGetAsEntry?.();
        if (entry) topLevelEntries.push(entry);
      }
      await Promise.all(topLevelEntries.map((entry) => walkEntry(entry, "", results)));
      addEntries(results);
    } finally {
      setIsReadingDrop(false);
    }
  }

  function removeFile(id: string) {
    setPending((prev) => prev.filter((item) => item.id !== id));
  }

  const tree = useMemo(() => buildTree(pending), [pending]);
  const folderCount = useMemo(() => countFolders(tree), [tree]);
  const totalSize = pending.reduce((sum, item) => sum + item.size, 0);
  const overwriteCount = pending.filter((item) =>
    existingPaths.includes(joinFolder(activeFolder, item.relativePath)),
  ).length;
  const canSubmit = pending.length > 0 && message.trim().length > 0 && !submitting && !isReadingDrop;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setProgress(8);
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < 88 ? p + Math.max(1, (88 - p) * 0.08) : p));
    }, 180);

    try {
      const files = await Promise.all(
        pending.map(async (item) => ({
          path: joinFolder(activeFolder, item.relativePath),
          content: await readAsBase64(item.file),
        })),
      );
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

  return (
    <Dialog open={open} onOpenChange={(next) => !submitting && onOpenChange(next)}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Upload folder</DialogTitle>
          <DialogDescription>
            {activeFolder ? (
              <>
                The folder will be recreated under{" "}
                <span className="font-mono text-foreground">{activeFolder}/</span> and pushed as
                a single commit.
              </>
            ) : (
              "The folder structure will be recreated at the repository root and pushed as a single commit."
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
            {isReadingDrop ? (
              <Loader2 className="size-6 animate-spin text-primary" />
            ) : (
              <FolderUp className="size-6 text-muted-foreground" />
            )}
            <p className="text-sm">
              <span className="font-medium text-foreground">Click to choose a folder</span> or
              drag and drop one here
            </p>
            <p className="text-xs text-muted-foreground">The full folder hierarchy is preserved</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                handleBrowseChange(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

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
                  {overwriteCount > 0 && (
                    <span className="text-destructive"> · {overwriteCount} will overwrite</span>
                  )}
                </span>
                <span>{formatBytes(totalSize)} total</span>
              </div>

              <ScrollArea className="max-h-56 rounded-md border border-border">
                <FolderTreePreview
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
                onClick={() => setPending([])}
                disabled={submitting}
              >
                <Trash2 className="size-3.5" />
                Clear all
              </Button>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="folder-commit-message">Commit message</Label>
            <Input
              id="folder-commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Add ${pending.length || ""} file${pending.length === 1 ? "" : "s"}`}
              className="h-8 text-xs"
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="folder-commit-description">Extended description (optional)</Label>
            <Textarea
              id="folder-commit-description"
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
              <p className="text-xs text-muted-foreground">Pushing folder to GitHub…</p>
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
              : "Push folder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
