import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FolderPlus, Loader2, Lock, Unlock } from "lucide-react";
import { createRepository, type RepoCard } from "@/lib/github.functions";
import { GITIGNORE_TEMPLATES, LICENSE_TEMPLATES } from "@/lib/github-templates";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// GitHub repository names: letters, digits, hyphens, underscores and periods,
// 1–100 characters, and not "." or "..".
const REPO_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;

function validateRepoName(rawName: string): string | null {
  const name = rawName.trim();
  if (!name) return "Repository name cannot be empty.";
  if (name.length > 100) return "Repository names can't be longer than 100 characters.";
  if (name === "." || name === "..") return "That name isn't allowed by GitHub.";
  if (!REPO_NAME_PATTERN.test(name)) {
    return "Only letters, numbers, hyphens, underscores and periods are allowed.";
  }
  return null;
}

const NONE = "__none__";

export function CreateRepositoryDialog({
  accountId,
  onCreated,
  trigger,
  disabled,
}: {
  accountId: string | undefined;
  onCreated: (repo: RepoCard) => void;
  trigger?: React.ReactNode;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(true);
  const [autoInit, setAutoInit] = useState(true);
  const [gitignoreTemplate, setGitignoreTemplate] = useState(NONE);
  const [licenseTemplate, setLicenseTemplate] = useState(NONE);
  const [touched, setTouched] = useState(false);

  const createFn = useServerFn(createRepository);
  const { activeWorkspace } = useWorkspaces();

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      // Feature 10: Workspace Settings → Repository defaults. Prefills
      // from the active workspace's configured defaults, not hardcoded
      // ones — still just a starting point, freely overridable below.
      setIsPrivate((activeWorkspace?.defaultRepoVisibility ?? "private") === "private");
      setAutoInit(activeWorkspace?.defaultRepoAutoInit ?? true);
      setGitignoreTemplate(activeWorkspace?.defaultGitignoreTemplate || NONE);
      setLicenseTemplate(activeWorkspace?.defaultLicenseTemplate || NONE);
      setTouched(false);
    }
  }, [open, activeWorkspace]);

  const create = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          accountId: accountId!,
          name: name.trim(),
          description: description.trim() || undefined,
          isPrivate,
          autoInit,
          gitignoreTemplate: gitignoreTemplate === NONE ? undefined : gitignoreTemplate,
          licenseTemplate: licenseTemplate === NONE ? undefined : licenseTemplate,
        },
      }),
    onSuccess: (repo) => {
      toast.success(`Created ${repo.fullName}`);
      onCreated(repo);
      setOpen(false);
    },
    onError: (error: Error) => {
      toast.error(error.message || "GitHub rejected the repository creation.");
    },
  });

  const validationError = validateRepoName(name);
  const showError = touched ? validationError : null;
  const willInitialize = autoInit || gitignoreTemplate !== NONE || licenseTemplate !== NONE;
  const canSubmit = !validationError && Boolean(accountId) && !create.isPending;

  function handleSubmit() {
    setTouched(true);
    if (!validateRepoName(name) && accountId) {
      create.mutate();
    }
  }

  return (
    <Dialog open={!disabled && open} onOpenChange={(next) => !create.isPending && !disabled && setOpen(next)}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" disabled={disabled} title={disabled ? "Your role can't create repositories" : undefined}>
            <FolderPlus className="size-3.5" />
            New repository
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create a new repository</DialogTitle>
          <DialogDescription>
            This creates a brand new repository on GitHub under your connected account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-repo-name">Repository name</Label>
            <Input
              id="new-repo-name"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setTouched(true);
              }}
              onBlur={() => setTouched(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="my-new-project"
              className="font-mono text-xs"
              autoComplete="off"
              autoFocus
            />
            {showError && (
              <p className="animate-in fade-in slide-in-from-top-1 text-xs text-destructive duration-150">
                {showError}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-repo-description">Description (optional)</Label>
            <Textarea
              id="new-repo-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What is this repository for?"
              className="min-h-16 text-xs"
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div className="flex items-center gap-2">
              {isPrivate ? (
                <Lock className="size-3.5 text-muted-foreground" />
              ) : (
                <Unlock className="size-3.5 text-muted-foreground" />
              )}
              <div>
                <p className="text-xs font-medium">{isPrivate ? "Private" : "Public"}</p>
                <p className="text-[11px] text-muted-foreground">
                  {isPrivate ? "Only you can see this repository." : "Anyone can see this repository."}
                </p>
              </div>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} aria-label="Private repository" />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border p-3">
            <div>
              <p className="text-xs font-medium">Initialize with README</p>
              <p className="text-[11px] text-muted-foreground">
                Adds a starter README.md and creates the first commit.
              </p>
            </div>
            <Switch checked={autoInit} onCheckedChange={setAutoInit} aria-label="Initialize with README" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-repo-gitignore">.gitignore (optional)</Label>
              <Select value={gitignoreTemplate} onValueChange={setGitignoreTemplate}>
                <SelectTrigger id="new-repo-gitignore" className="h-8 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {GITIGNORE_TEMPLATES.map((template) => (
                    <SelectItem key={template} value={template}>
                      {template}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-repo-license">License (optional)</Label>
              <Select value={licenseTemplate} onValueChange={setLicenseTemplate}>
                <SelectTrigger id="new-repo-license" className="h-8 text-xs">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {LICENSE_TEMPLATES.map((license) => (
                    <SelectItem key={license.id} value={license.id}>
                      {license.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {willInitialize && !autoInit && (
            <p className="text-[11px] text-muted-foreground">
              A .gitignore or license requires an initial commit, so GitHub will initialize this
              repository automatically.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <FolderPlus className="size-4" />
            )}
            Create Repository
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
