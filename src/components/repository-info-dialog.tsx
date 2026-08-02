import type { LucideIcon } from "lucide-react";
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
import type { RepoDetails } from "@/lib/github.functions";

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
 * at a glance before diving into the file tree.
 */
export function RepositoryInfoDialog({
  open,
  onOpenChange,
  fullName,
  totalFiles,
  latestCommit,
  details,
  loading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  fullName: string;
  totalFiles: number | null;
  latestCommit: { sha: string; message: string; date: string } | null;
  details: RepoDetails | null | undefined;
  loading: boolean;
}) {
  return (
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
            <Stat icon={details?.isPrivate ? Lock : Unlock} label="Visibility">
              {details?.visibility ?? "—"}
            </Stat>
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
  );
}
