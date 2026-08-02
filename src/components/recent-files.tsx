import { Clock, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RecentFile } from "@/lib/workspace.functions";

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

/**
 * Quick-access strip of the files the user most recently opened or pushed
 * in the current repository/branch. Clicking a row reopens that file in the
 * editor instantly. Persisted server-side, so it survives across sessions
 * and devices — not just tab reloads.
 */
export function RecentFiles({
  files,
  loading,
  activePath,
  onOpenFile,
  onClear,
  className,
}: {
  files: RecentFile[];
  loading?: boolean;
  activePath: string;
  onOpenFile: (path: string) => void;
  onClear?: () => void;
  className?: string;
}) {
  if (loading || files.length === 0) return null;

  return (
    <div className={cn("border-b border-border p-2", className)}>
      <div className="mb-1.5 flex items-center justify-between px-1">
        <span className="label-caps flex items-center gap-1.5 text-muted-foreground">
          <Clock className="size-3" />
          Recent
        </span>
        {onClear && (
          <button
            type="button"
            onClick={onClear}
            className="flex items-center gap-0.5 text-[10px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            <X className="size-2.5" />
            Clear
          </button>
        )}
      </div>
      <div className="flex flex-col gap-0.5">
        {files.map((file) => {
          const name = file.path.split("/").pop() ?? file.path;
          const isActive = file.path === activePath;
          return (
            <button
              key={file.id}
              type="button"
              onClick={() => onOpenFile(file.path)}
              title={file.path}
              className={cn(
                "flex w-full min-w-0 items-center justify-between gap-2 truncate rounded py-1.5 pl-2 pr-2 text-left font-mono text-[11px] transition-colors duration-150",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
              )}
            >
              <span className="truncate">{name}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground/70">
                {relativeTime(file.lastOpenedAt)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
