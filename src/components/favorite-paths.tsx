import { ChevronRight, Folder, Star, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PathPref } from "@/lib/workspace.functions";

/**
 * A row of pinned-folder shortcuts (e.g. `src/components`, `src/hooks`,
 * `src/pages`). Tapping a chip jumps straight to that folder; the small ×
 * unstars it without leaving the workspace.
 *
 * Collapsed by default (just the "Favorite paths" icon + label) to keep the
 * sidebar compact — tapping the header smoothly expands the chip list, and
 * tapping it again collapses it. `expanded` / `onToggleExpanded` are
 * controlled by the parent so only one sidebar section stays open at a time.
 */
export function FavoritePaths({
  paths,
  loading,
  activeFolder,
  onNavigate,
  onRemove,
  expanded,
  onToggleExpanded,
  className,
}: {
  paths: PathPref[];
  loading?: boolean;
  activeFolder: string | null;
  onNavigate: (path: string) => void;
  onRemove: (path: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  className?: string;
}) {
  if (loading || paths.length === 0) return null;

  return (
    <div className={cn("border-b border-border", className)}>
      <button
        type="button"
        onClick={onToggleExpanded}
        aria-expanded={expanded}
        className="label-caps flex w-full items-center gap-1.5 px-2 py-1.5 text-left transition-colors duration-200 ease-in-out hover:text-foreground"
      >
        <Star className="size-3 fill-primary text-primary" />
        Favorite paths
        <span className="normal-case tracking-normal text-muted-foreground/70">
          ({paths.length})
        </span>
        <ChevronRight
          className={cn(
            "ml-auto size-3 shrink-0 text-muted-foreground transition-transform duration-200 ease-in-out",
            expanded && "rotate-90",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-in-out",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="flex flex-wrap gap-1.5 px-2 pb-2">
            {paths.map((favorite) => {
              const name = favorite.path.split("/").filter(Boolean).pop() ?? favorite.path;
              const isActive = favorite.path === activeFolder;
              return (
                <div
                  key={favorite.path}
                  className={cn(
                    "group flex items-center gap-1 rounded-full border pl-2 pr-1 py-1 font-mono text-[11px] transition-colors duration-150",
                    isActive
                      ? "border-primary/50 bg-primary/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onNavigate(favorite.path)}
                    title={favorite.path}
                    className="flex min-w-0 items-center gap-1"
                  >
                    <Folder className="size-3 shrink-0 text-primary" />
                    <span className="max-w-[9rem] truncate">{name}</span>
                  </button>
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
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
