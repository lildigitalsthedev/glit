import { useEffect, useMemo, useRef, useState } from "react";
import { unzipSync } from "fflate";
import { AlertTriangle, FileArchive, Loader2, Trash2, UploadCloud } from "lucide-react";
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
import {
  buildCommitTree,
  computeCommitTotals,
  type PreviewSource,
} from "@/lib/commit-preview";
import { CommitFileTree } from "@/components/commit-file-tree";
import { CommitTotalsBar } from "@/components/commit-totals-bar";

export interface PendingZipFile {
  id: string;
  /** Path inside the archive, e.g. "my-project/src/App.tsx". */
  path: string;
  /**
   * Destination path relative to the chosen destination folder. Starts out as
   * the archive path (minus any stripped common root) and can be edited
   * per-file before pushing.
   */
  targetPath: string;
  size: number;
  bytes: Uint8Array;
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

/** Normalizes a user-typed path: trims segments, drops empties and "." parts. */
function normalizeRelPath(input: string): string {
  return input
    .split("/")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".")
    .join("/");
}

/**
 * Returns the single top-level folder shared by every archive entry, or null
 * when the archive has more than one top-level entry. GitHub-style archives
 * ("repo-main/...") nest everything one level deep, which would otherwise be
 * recreated inside the repository.
 */
function commonRootFolder(paths: string[]): string | null {
  if (paths.length === 0) return null;
  const first = paths[0]?.split("/") ?? [];
  if (first.length < 2) return null;
  const root = first[0]!;
  return paths.every((path) => path.startsWith(`${root}/`)) ? root : null;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `pending-zip-${idCounter}-${Date.now()}`;
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

  const existingPathsSet = useMemo(() => new Set(existingPaths), [existingPaths]);
  const tree = useMemo(() => {
    const sources: PreviewSource<PendingZipFile>[] = pending.map((item) => ({
      item,
      relativePath: item.path,
      fullPath: joinFolder(activeFolder, item.path),
    }));
    return buildCommitTree(sources);
  }, [pending, activeFolder]);
  const totals = useMemo(
    () => computeCommitTotals(tree, existingPathsSet),
    [tree, existingPathsSet],
  );
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
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-xl">
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

        <div className="flex min-h-0 flex-1 flex-col gap-3">
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

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-md border border-border">
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
          <div className="max-h-32 overflow-y-auto overscroll-contain rounded-md border border-border">
            <ul className="divide-y divide-border">
              {overwritePaths.map((path) => (
                <li key={path} className="truncate px-3 py-1.5 font-mono text-[11px]">
                  {path}
                </li>
              ))}
            </ul>
          </div>
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
