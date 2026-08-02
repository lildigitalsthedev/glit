import { useEffect, useState } from "react";
import { FilePlus } from "lucide-react";
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

function joinPath(folder: string | null, name: string): string {
  const cleaned = name
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/{2,}/g, "/")
    .replace(/\/+$/, "");
  return folder ? `${folder}/${cleaned}` : cleaned;
}

export function NewFileDialog({
  open,
  onOpenChange,
  activeFolder,
  existingPaths,
  onCreate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeFolder: string | null;
  existingPaths: string[];
  onCreate: (path: string) => void;
}) {
  const [name, setName] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (open) {
      setName("");
      setTouched(false);
    }
  }, [open]);

  const trimmed = name.trim();
  const fullPath = trimmed ? joinPath(activeFolder, trimmed) : "";

  let error: string | null = null;
  if (!trimmed) {
    error = "File name cannot be empty.";
  } else if (trimmed.includes("..")) {
    error = 'File name can\'t contain "..".';
  } else if (/[<>:"|?*\x00-\x1f]/.test(trimmed)) {
    error = "That name contains characters GitHub won't accept.";
  }

  const willOverwrite = !error && existingPaths.includes(fullPath);
  const canSubmit = !error;

  function handleSubmit() {
    setTouched(true);
    if (!error && fullPath) {
      onCreate(fullPath);
      onOpenChange(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New file</DialogTitle>
          <DialogDescription>
            {activeFolder ? (
              <>
                Creating a file inside{" "}
                <span className="font-mono text-foreground">{activeFolder}/</span>
              </>
            ) : (
              "Creating a file at the repository root."
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="new-file-name">File name</Label>
          <Input
            id="new-file-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setTouched(true);
            }}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSubmit();
            }}
            placeholder="Button.tsx or ui/Button.tsx"
            className="font-mono text-xs"
            autoComplete="off"
            autoFocus
          />
          {touched && error && <p className="text-xs text-destructive">{error}</p>}
          {!error && fullPath && (
            <p className="truncate text-xs text-muted-foreground">
              Will create <span className="font-mono text-foreground">{fullPath}</span>
              {willOverwrite && (
                <span className="text-destructive"> — a file already exists here</span>
              )}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            <FilePlus className="size-4" />
            Create File
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
