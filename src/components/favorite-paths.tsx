import { File, Folder, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PathPref } from "@/lib/workspace.functions";

/**
 * Floating popup (rendered inside a `ToolPopup` shell — see
 * `workspace-tools.tsx`) showing pinned files and folders as a horizontally
 * scrollable row of compact cards. Tapping a card jumps straight to that
 * file or folder and closes the popup; the small ✕ unstars it without
 * leaving the workspace or closing the popup, so removing several in a row
 * is quick.
 *
 * Folders are starred from the breadcrumb bar; files are starred from the
 * ⋮ menu (or the inline star) on a file row in the file tree.
 */
export function FavoritePathsPopup({
  paths,
  loading,
  activeFolder,
  activeFile,
  onNavigate,
  onRemove,
  onClose,
  className,
}: {
  paths: PathPref[];
  loading?: boolean;
  activeFolder: string | null;
  /** Currently open file path, used to highlight a matching pinned file. */
  activeFile?: string;
  onNavigate: (favorite: PathPref) => void;
  onRemove: (favorite: PathPref) => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {loading ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground">Loading…</p>
      ) : paths.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground">
          Star a file or folder to pin it here.
        </p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          {paths.map((favorite) => {
            const name = favorite.path.split("/").filter(Boolean).pop() ?? favorite.path;
            const isActive =
              favorite.kind === "folder"
                ? favorite.path === activeFolder
                : favorite.path === activeFile;
            const Icon = favorite.kind === "folder" ? Folder : File;
            return (
              <div
                key={`${favorite.kind}:${favorite.path}`}
                className={cn(
                  "group flex shrink-0 flex-col items-start gap-1 rounded-md border px-2.5 py-2 font-mono text-[11px] transition-colors duration-150",
                  isActive
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <Icon className="size-3.5 shrink-0 text-primary" />
                  <button
                    type="button"
                    onClick={() => onRemove(favorite)}
                    aria-label={`Remove Favorite: ${favorite.path}`}
                    title="Remove Favorite"
                    className="flex size-4 shrink-0 items-center justify-center rounded-full text-muted-foreground/60 opacity-100 transition-opacity duration-150 hover:bg-secondary hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100"
                  >
                    <X className="size-2.5" />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onNavigate(favorite);
                    onClose();
                  }}
                  title={favorite.path}
                  className="max-w-[7rem] truncate text-left"
                >
                  {name}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
