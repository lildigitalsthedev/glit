import { useEffect, useRef, useState } from "react";
import { FileUp, Loader2, Trash2, UploadCloud, X } from "lucide-react";
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

export interface PendingFile {
  id: string;
  path: string;
  size: number;
  file: File;
}

export interface BulkUploadFileData {
  path: string;
  /** Base64-encoded file content, no "data:...;base64," prefix. */
  content: string;
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
  return `pending-${idCounter}-${Date.now()}`;
}

export function BulkUploadDialog({
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
    files: BulkUploadFileData[];
  }) => Promise<unknown>;
}) {
  const [pending, setPending] = useState<PendingFile[]>([]);
  const [message, setMessage] = useState("");
  const [description, setDescription] = useState("");
  const [isDragging, setIsDragging] = useState(false);
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
      setSubmitting(false);
      setProgress(0);
    }
  }, [open]);

  useEffect(() => {
    return () => {
      if (progressTimer.current) clearInterval(progressTimer.current);
    };
  }, []);

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList);
    if (!incoming.length) return;
    setPending((prev) => {
      const next = [...prev];
      for (const file of incoming) {
        const path = joinFolder(activeFolder, file.name);
        const dupeIndex = next.findIndex((item) => item.path === path);
        const entry: PendingFile = { id: nextId(), path, size: file.size, file };
        if (dupeIndex === -1) {
          next.push(entry);
        } else {
          next[dupeIndex] = entry;
        }
      }
      return next;
    });
  }

  function removeFile(id: string) {
    setPending((prev) => prev.filter((item) => item.id !== id));
  }

  function updatePath(id: string, path: string) {
    setPending((prev) => prev.map((item) => (item.id === id ? { ...item, path } : item)));
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  const totalSize = pending.reduce((sum, item) => sum + item.size, 0);
  const overwriteCount = pending.filter((item) => existingPaths.includes(item.path)).length;
  const hasEmptyPath = pending.some((item) => !item.path.trim());
  const canSubmit = pending.length > 0 && message.trim().length > 0 && !hasEmptyPath && !submitting;

  async function handleSubmit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setProgress(8);
    progressTimer.current = setInterval(() => {
      setProgress((p) => (p < 88 ? p + Math.max(1, (88 - p) * 0.08) : p));
    }, 180);

    try {
      const files: BulkUploadFileData[] = await Promise.all(
        pending.map(async (item) => ({
          path: item.path.trim(),
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
          <DialogTitle>Bulk file upload</DialogTitle>
          <DialogDescription>
            {activeFolder ? (
              <>
                Files will be added under{" "}
                <span className="font-mono text-foreground">{activeFolder}/</span> and pushed as
                a single commit.
              </>
            ) : (
              "Files will be added at the repository root and pushed as a single commit."
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
            <UploadCloud className="size-6 text-muted-foreground" />
            <p className="text-sm">
              <span className="font-medium text-foreground">Click to browse</span> or drag and
              drop files here
            </p>
            <p className="text-xs text-muted-foreground">Multiple files are supported</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

          {pending.length > 0 && (
            <>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {pending.length} file{pending.length === 1 ? "" : "s"} ready to push
                  {overwriteCount > 0 && (
                    <span className="text-destructive"> · {overwriteCount} will overwrite</span>
                  )}
                </span>
                <span>{formatBytes(totalSize)} total</span>
              </div>

              <ScrollArea className="max-h-56 rounded-md border border-border">
                <div className="divide-y divide-border">
                  {pending.map((item) => {
                    const overwrites = existingPaths.includes(item.path);
                    return (
                      <div key={item.id} className="flex items-center gap-2 p-2">
                        <FileUp className="size-3.5 shrink-0 text-muted-foreground" />
                        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                          <Input
                            value={item.path}
                            onChange={(e) => updatePath(item.id, e.target.value)}
                            className="h-7 font-mono text-xs"
                            disabled={submitting}
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {formatBytes(item.size)}
                            {overwrites && (
                              <span className="text-destructive"> · overwrites existing file</span>
                            )}
                            {!item.path.trim() && (
                              <span className="text-destructive"> · path required</span>
                            )}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeFile(item.id)}
                          disabled={submitting}
                          aria-label={`Remove ${item.path}`}
                        >
                          <X className="size-3.5" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
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
            <Label htmlFor="bulk-commit-message">Commit message</Label>
            <Input
              id="bulk-commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder={`Add ${pending.length || ""} file${pending.length === 1 ? "" : "s"}`}
              className="h-8 text-xs"
              disabled={submitting}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="bulk-commit-description">Extended description (optional)</Label>
            <Textarea
              id="bulk-commit-description"
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
              <p className="text-xs text-muted-foreground">Pushing files to GitHub…</p>
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
    </Dialog>
  );
}
