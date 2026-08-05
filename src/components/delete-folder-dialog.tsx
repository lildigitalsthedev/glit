import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Confirmation dialog for deleting an entire folder (and everything inside
 * it) from the connected GitHub repository. Git has no empty directories, so
 * every file under the folder is removed in one commit. The user must type
 * the folder name to confirm, since this can remove many files at once.
 */
export function DeleteFolderDialog({
  open,
  onOpenChange,
  path,
  branch,
  filePaths,
  isDeleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Repo-relative folder path, e.g. "src/components". */
  path: string | null;
  branch: string;
  /** Every known file path inside the folder, used for the preview + count. */
  filePaths: string[];
  isDeleting: boolean;
  onConfirm: (message: string) => void;
}) {
  const folderName = path ? (path.split("/").pop() ?? path) : "";
  const [message, setMessage] = useState("");
  const [confirmText, setConfirmText] = useState("");

  useEffect(() => {
    if (open && path) {
      setMessage(`Delete folder ${path}`);
      setConfirmText("");
    }
  }, [open, path]);

  const confirmed = confirmText.trim() === folderName;

  function handleConfirm() {
    if (!message.trim() || !confirmed || isDeleting) return;
    onConfirm(message.trim());
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!isDeleting) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete folder &ldquo;{folderName}&rdquo;?</DialogTitle>
          <DialogDescription>
            This removes {filePaths.length} file{filePaths.length === 1 ? "" : "s"} inside this
            folder in a single commit. It can&rsquo;t be undone from here.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-3 font-mono text-[11px] text-muted-foreground">
            <p className="truncate">{path}/</p>
            <p className="mt-1">on branch {branch || "—"}</p>
          </div>

          {filePaths.length > 0 && (
            <div className="max-h-32 overflow-y-auto overscroll-contain rounded-md border border-border">
              <ul className="divide-y divide-border">
                {filePaths.slice(0, 200).map((filePath) => (
                  <li key={filePath} className="truncate px-3 py-1.5 font-mono text-[11px]">
                    {filePath}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="delete-folder-confirm">
              Type <span className="font-mono text-foreground">{folderName}</span> to confirm
            </Label>
            <Input
              id="delete-folder-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={folderName}
              className="font-mono text-xs"
              autoComplete="off"
              autoFocus
              disabled={isDeleting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="delete-folder-message">Commit message</Label>
            <Input
              id="delete-folder-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
              className="font-mono text-xs"
              autoComplete="off"
              disabled={isDeleting}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isDeleting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!message.trim() || !confirmed || isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Trash2 className="size-4" />
            )}
            Delete folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}