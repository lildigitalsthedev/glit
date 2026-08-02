import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { renameRepository } from "@/lib/github.functions";
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

// GitHub repository names: letters, digits, hyphens, underscores and periods,
// 1–100 characters, and not "." or "..".
const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function validateRepoName(rawName: string, currentName: string): string | null {
  const name = rawName.trim();
  if (!name) return "Repository name cannot be empty.";
  if (name.length > 100) return "Repository names can't be longer than 100 characters.";
  if (name === "." || name === "..") return "That name isn't allowed by GitHub.";
  if (!REPO_NAME_PATTERN.test(name)) {
    return "Only letters, numbers, hyphens, underscores and periods are allowed.";
  }
  if (name === currentName) return "That's already the current name.";
  return null;
}

export function RenameRepositoryDialog({
  open,
  onOpenChange,
  accountId,
  fullName,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string;
  fullName: string;
  onRenamed: (newFullName: string) => void;
}) {
  const currentName = fullName.split("/").pop() ?? fullName;
  const [newName, setNewName] = useState(currentName);
  const [touched, setTouched] = useState(false);
  const renameFn = useServerFn(renameRepository);

  useEffect(() => {
    if (open) {
      setNewName(currentName);
      setTouched(false);
    }
  }, [open, currentName]);

  const rename = useMutation({
    mutationFn: () => renameFn({ data: { accountId, fullName, newName: newName.trim() } }),
    onSuccess: (repo) => {
      toast.success(`Renamed to ${repo.fullName}`);
      onRenamed(repo.fullName);
      onOpenChange(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "GitHub rejected the rename.");
    },
  });

  const validationError = validateRepoName(newName, currentName);
  const showError = touched ? validationError : null;
  const canSubmit = !validationError && !rename.isPending;

  function handleSubmit() {
    setTouched(true);
    if (!validateRepoName(newName, currentName)) {
      rename.mutate();
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!rename.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rename repository</DialogTitle>
          <DialogDescription>
            This renames the repository on GitHub. GitHub keeps redirects for the old name, but
            it's a good idea to update any links or local remotes afterwards.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="current-repo-name">Current repository name</Label>
            <Input
              id="current-repo-name"
              value={currentName}
              readOnly
              disabled
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-repo-name">New repository name</Label>
            <Input
              id="new-repo-name"
              value={newName}
              onChange={(e) => {
                setNewName(e.target.value);
                setTouched(true);
              }}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="my-repo"
              className="font-mono text-xs"
              autoComplete="off"
              autoFocus
            />
            {showError && <p className="text-xs text-destructive">{showError}</p>}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={rename.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {rename.isPending && <Loader2 className="size-4 animate-spin" />}
            Rename Repository
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
