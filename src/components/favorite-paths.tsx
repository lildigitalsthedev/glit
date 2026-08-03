import { Folder, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PathPref } from "@/lib/workspace.functions";

/**
 * Floating popup (rendered inside a `ToolPopup` shell — see
 * `workspace-tools.tsx`) showing pinned folder shortcuts as a horizontally
 * scrollable row of compact cards. Tapping a card jumps straight to that
 * folder and closes the popup; the small ✕ unstars it without leaving the
 * workspace or closing the popup, so removing several in a row is quick.
 *
 * GitPush currently only supports favoriting folders (via the star button
 * next to the breadcrumb trail), so every card here is a folder.
 */
export function FavoritePathsPopup({
  paths,
  loading,
  activeFolder,
  onNavigate,
  onRemove,
  onClose,
  className,
}: {
  paths: PathPref[];
  loading?: boolean;
  activeFolder: string | null;
  onNavigate: (path: string) => void;
  onRemove: (path: string) => void;
  onClose: () => void;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      {loading ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground">Loading…</p>
      ) : paths.length === 0 ? (
        <p className="px-1 py-2 text-[11px] text-muted-foreground">
          Star a folder from the breadcrumb bar to pin it here.
        </p>
      ) : (
        <div className="flex gap-1.5 overflow-x-auto pb-1 [&::-webkit-scrollbar]:hidden">
          {paths.map((favorite) => {
            const name = favorite.path.split("/").filter(Boolean).pop() ?? favorite.path;
            const isActive = favorite.path === activeFolder;
            return (
              <div
                key={favorite.path}
                className={cn(
                  "group flex shrink-0 flex-col items-start gap-1 rounded-md border px-2.5 py-2 font-mono text-[11px] transition-colors duration-150",
                  isActive
                    ? "border-primary/50 bg-primary/10 text-foreground"
                    : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <Folder className="size-3.5 shrink-0 text-primary" />
                  <button
                    type="button"
                    onClick={() => onRemove(favorite.path)}
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
                    onNavigate(favorite.path);
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
