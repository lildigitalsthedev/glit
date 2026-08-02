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
 * Confirmation dialog for deleting a single file from the connected GitHub
 * repository. Requires a commit message before the delete is allowed to
 * proceed, and keeps itself open (with the error surfaced) if the GitHub
 * request fails, so the user can fix the message/branch and retry.
 */
export function DeleteFileDialog({
  open,
  onOpenChange,
  path,
  branch,
  isDeleting,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Repo-relative path of the file being deleted, e.g. "src/Button.tsx". */
  path: string | null;
  branch: string;
  isDeleting: boolean;
  onConfirm: (message: string) => void;
}) {
  const fileName = path ? (path.split("/").pop() ?? path) : "";
  const [message, setMessage] = useState("");

  // Re-seed the commit message whenever a new file is targeted for deletion.
  useEffect(() => {
    if (open && path) setMessage(`Delete ${fileName}`);
  }, [open, path, fileName]);

  function handleConfirm() {
    if (!message.trim() || isDeleting) return;
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
          <DialogTitle>Delete &ldquo;{fileName}&rdquo;?</DialogTitle>
          <DialogDescription>
            This action will permanently remove this file from the selected GitHub repository.
            The file will not be deleted until you confirm the commit below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border border-border bg-card p-3 font-mono text-[11px] text-muted-foreground">
            <p className="truncate">{path}</p>
            <p className="mt-1">on branch {branch || "—"}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="delete-commit-message">Commit message</Label>
            <Input
              id="delete-commit-message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleConfirm();
              }}
              placeholder={`Delete ${fileName}`}
              className="font-mono text-xs"
              autoComplete="off"
              autoFocus
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
            disabled={!message.trim() || isDeleting}
          >
            {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
