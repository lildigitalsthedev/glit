import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Files,
  GitBranch,
  History,
  Clock,
  HardDrive,
  Lock,
  Unlock,
  User,
  Loader2,
  ExternalLink,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { setRepositoryVisibility, type RepoDetails } from "@/lib/github.functions";

function formatSize(sizeKb: number): string {
  if (sizeKb >= 1024 * 1024) return `${(sizeKb / (1024 * 1024)).toFixed(1)} GB`;
  if (sizeKb >= 1024) return `${(sizeKb / 1024).toFixed(1)} MB`;
  return `${sizeKb} KB`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function Stat({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3">
      <Icon className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <div className="mt-0.5 truncate font-mono text-xs text-foreground">{children}</div>
      </div>
    </div>
  );
}

/**
 * The repository overview: total files, default branch, latest commit,
 * last updated, size, visibility and owner — everything a developer wants
 * at a glance before diving into the file tree. Visibility is the one
 * interactive stat: repo managers can flip it between private and public
 * right here, since it's exactly the kind of thing someone checks this
 * dialog to look up in the first place.
 */
export function RepositoryInfoDialog({
  open,
  onOpenChange,
  accountId,
  fullName,
  totalFiles,
  latestCommit,
  details,
  loading,
  canManage,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  accountId: string | null;
  fullName: string;
  totalFiles: number | null;
  latestCommit: { sha: string; message: string; date: string } | null;
  details: RepoDetails | null | undefined;
  loading: boolean;
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const visibilityFn = useServerFn(setRepositoryVisibility);
  const [confirmTarget, setConfirmTarget] = useState<"public" | "private" | null>(null);

  const setVisibility = useMutation({
    mutationFn: (isPrivate: boolean) => {
      if (!accountId) throw new Error("No GitHub connection for this repository.");
      return visibilityFn({ data: { accountId, fullName, isPrivate } });
    },
    onSuccess: (repo) => {
      toast.success(`${fullName} is now ${repo.isPrivate ? "private" : "public"}.`);
      void queryClient.invalidateQueries({ queryKey: ["repo-details", accountId, fullName] });
      void queryClient.invalidateQueries({ queryKey: ["repos"] });
      void queryClient.invalidateQueries({ queryKey: ["workspace-repo-cards"] });
      setConfirmTarget(null);
    },
    onError: (error: Error) => {
      toast.error(error.message || "Couldn't change repository visibility.");
      setConfirmTarget(null);
    },
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-mono text-base">{fullName}</DialogTitle>
            <DialogDescription>Repository overview, pulled live from GitHub.</DialogDescription>
          </DialogHeader>

          {loading ? (
            <div className="flex h-32 items-center justify-center">
              <Loader2 className="size-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Stat icon={Files} label="Total Files">
                {totalFiles ?? "—"}
              </Stat>
              <Stat icon={GitBranch} label="Default Branch">
                {details?.defaultBranch ?? "—"}
              </Stat>
              <Stat icon={History} label="Latest Commit">
                {latestCommit ? (
                  <span title={latestCommit.message}>
                    {latestCommit.sha} · {latestCommit.message}
                  </span>
                ) : (
                  "—"
                )}
              </Stat>
              <Stat icon={Clock} label="Last Updated">
                {details ? formatDate(details.updatedAt) : "—"}
              </Stat>
              <Stat icon={HardDrive} label="Repository Size">
                {details && details.sizeKb > 0 ? formatSize(details.sizeKb) : "Not available"}
              </Stat>
              {canManage && accountId && details ? (
                <button
                  type="button"
                  disabled={setVisibility.isPending}
                  onClick={() => setConfirmTarget(details.isPrivate ? "public" : "private")}
                  className="flex items-start gap-2.5 rounded-md border border-border bg-card p-3 text-left transition-colors duration-150 hover:border-primary/50 hover:text-primary disabled:opacity-60"
                >
                  {details.isPrivate ? (
                    <Lock className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  ) : (
                    <Unlock className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Visibility</p>
                    <div className="mt-0.5 flex items-center gap-1 truncate font-mono text-xs text-foreground">
                      {setVisibility.isPending ? (
                        <>
                          <Loader2 className="size-3 animate-spin" /> Updating…
                        </>
                      ) : (
                        <>
                          {details.visibility}
                          <span className="text-muted-foreground">
                            · tap to make {details.isPrivate ? "public" : "private"}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </button>
              ) : (
                <Stat icon={details?.isPrivate ? Lock : Unlock} label="Visibility">
                  {details?.visibility ?? "—"}
                </Stat>
              )}
              <Stat icon={User} label="Owner">
                {details?.owner ?? "—"}
              </Stat>
              {details?.htmlUrl && (
                <a
                  href={details.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2.5 rounded-md border border-border bg-card p-3 transition-colors duration-150 hover:border-primary/50 hover:text-primary"
                >
                  <ExternalLink className="size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Open on</p>
                    <div className="mt-0.5 truncate font-mono text-xs">GitHub ↗</div>
                  </div>
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmTarget !== null} onOpenChange={(next) => !next && setConfirmTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Make this repository {confirmTarget}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmTarget === "public"
                ? `${fullName} and its full history will become visible to anyone on GitHub, not just people with access.`
                : `${fullName} will only be visible to people with explicit access on GitHub. Anything that relied on public access (public URLs, unauthenticated CI, etc.) will stop working.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={setVisibility.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={setVisibility.isPending}
              onClick={() => setVisibility.mutate(confirmTarget === "private")}
            >
              {setVisibility.isPending && <Loader2 className="size-4 animate-spin" />}
              Make {confirmTarget}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
