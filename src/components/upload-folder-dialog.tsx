import { useEffect, useMemo, useRef, useState } from "react";
import { FolderUp, Loader2, Trash2, UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  buildCommitTree,
  computeCommitTotals,
  type PreviewSource,
} from "@/lib/commit-preview";
import { CommitFileTree } from "@/components/commit-file-tree";
import { CommitTotalsBar } from "@/components/commit-totals-bar";

export interface PendingFolderFile {
  id: string;
  /** Path relative to the dropped/selected folder, e.g. "src/App.tsx". */
  relativePath: string;
  size: number;
  file: File;
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

  const existingPathsSet = useMemo(() => new Set(existingPaths), [existingPaths]);
  const tree = useMemo(() => {
    const sources: PreviewSource<PendingFolderFile>[] = pending.map((item) => ({
      item,
      relativePath: item.relativePath,
      fullPath: joinFolder(activeFolder, item.relativePath),
    }));
    return buildCommitTree(sources);
  }, [pending, activeFolder]);
  const totals = useMemo(
    () => computeCommitTotals(tree, existingPathsSet),
    [tree, existingPathsSet],
  );
  const totalSize = pending.reduce((sum, item) => sum + item.size, 0);
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
                  {totals.folders > 0 && (
                    <>
                      {" "}
                      in {totals.folders} folder{totals.folders === 1 ? "" : "s"}
                    </>
                  )}{" "}
                  ready to push
                </span>
                <span>{formatBytes(totalSize)} total</span>
              </div>

              <CommitTotalsBar
                added={totals.added}
                modified={totals.modified}
                folders={totals.folders}
              />

              <div className="max-h-56 overflow-y-auto overscroll-contain rounded-md border border-border">
                <CommitFileTree
                  root={tree}
                  existingPaths={existingPathsSet}
                  onRemove={removeFile}
                  disabled={submitting}
                />
              </div>

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
