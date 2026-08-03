import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, Clock, Search, Star, Wrench } from "lucide-react";
import { cn } from "@/lib/utils";
import { SearchPopup } from "@/components/collapsible-search";
import { RecentFilesPopup } from "@/components/recent-files";
import { FavoritePathsPopup } from "@/components/favorite-paths";
import type { RecentFile, PathPref } from "@/lib/workspace.functions";

type ToolName = "search" | "recent" | "favorite";

/**
 * Compact, collapsible "Tools" row that replaces what used to be a
 * permanently-expanded Search box + Recent Files list + Favorite Paths
 * list stacked in the sidebar. Collapsed, it's a single "Tools" button
 * costing almost no vertical space. Expanded, it shows three small
 * trigger buttons (Search / Recent / Favorites) laid out horizontally.
 *
 * Tapping a trigger opens a floating popup anchored just below the row —
 * it overlays the sidebar instead of pushing the file tree or the editor
 * down. Only one popup (and, by construction, only one trigger) is ever
 * active at a time: opening one closes whichever was already open.
 */
export function WorkspaceTools({
  filter,
  onFilterChange,
  recentFiles,
  recentFilesLoading,
  activePath,
  onOpenFile,
  onClearRecentFiles,
  favoritePaths,
  favoritePathsLoading,
  activeFolder,
  onNavigateFolder,
  onRemoveFavorite,
  className,
}: {
  filter: string;
  onFilterChange: (next: string) => void;
  recentFiles: RecentFile[];
  recentFilesLoading?: boolean;
  activePath: string;
  onOpenFile: (path: string) => void;
  onClearRecentFiles?: () => void;
  favoritePaths: PathPref[];
  favoritePathsLoading?: boolean;
  activeFolder: string | null;
  onNavigateFolder: (path: string) => void;
  onRemoveFavorite: (path: string) => void;
  className?: string;
}) {
  const [toolsExpanded, setToolsExpanded] = useState(false);
  const [activePopup, setActivePopup] = useState<ToolName | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Tapping anywhere outside the Tools row / popup closes whichever popup
  // is open. The row itself stays expanded — collapsing it back down to
  // the single "Tools" button is a deliberate tap, not an accident of
  // clicking elsewhere.
  useEffect(() => {
    if (!activePopup) return;
    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setActivePopup(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setActivePopup(null);
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [activePopup]);

  function toggleTool(name: ToolName) {
    setActivePopup((prev) => (prev === name ? null : name));
  }

  function collapseTools() {
    setToolsExpanded(false);
    setActivePopup(null);
  }

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {!toolsExpanded ? (
        <button
          type="button"
          onClick={() => setToolsExpanded(true)}
          className="flex items-center gap-1.5 rounded px-1.5 py-1 font-mono text-[11px] text-muted-foreground transition-colors duration-200 ease-in-out hover:bg-secondary/40 hover:text-foreground"
        >
          <Wrench className="size-3.5" />
          Tools
          <ChevronDown className="size-3" />
        </button>
      ) : (
        <div className="flex animate-in items-center gap-1 duration-200 ease-in-out fade-in zoom-in-95">
          <ToolTrigger
            icon={Search}
            label="Search"
            active={activePopup === "search"}
            onClick={() => toggleTool("search")}
          />
          <ToolTrigger
            icon={Clock}
            label="Recent"
            active={activePopup === "recent"}
            onClick={() => toggleTool("recent")}
          />
          <ToolTrigger
            icon={Star}
            label="Favorites"
            active={activePopup === "favorite"}
            onClick={() => toggleTool("favorite")}
          />
          <button
            type="button"
            onClick={collapseTools}
            aria-label="Collapse tools"
            title="Collapse tools"
            className="ml-auto flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground transition-colors duration-150 hover:bg-secondary/40 hover:text-foreground"
          >
            <ChevronUp className="size-3.5" />
          </button>
        </div>
      )}

      {activePopup === "search" && (
        <ToolPopupShell label="Search">
          <SearchPopup
            value={filter}
            onValueChange={onFilterChange}
            onClose={() => setActivePopup(null)}
            placeholder="Find file, folder, or .ext…"
          />
        </ToolPopupShell>
      )}

      {activePopup === "recent" && (
        <ToolPopupShell label="Recent">
          <RecentFilesPopup
            files={recentFiles}
            loading={recentFilesLoading}
            activePath={activePath}
            onOpenFile={onOpenFile}
            onClose={() => setActivePopup(null)}
            onClear={onClearRecentFiles}
          />
        </ToolPopupShell>
      )}

      {activePopup === "favorite" && (
        <ToolPopupShell label="Favorites">
          <FavoritePathsPopup
            paths={favoritePaths}
            loading={favoritePathsLoading}
            activeFolder={activeFolder}
            onNavigate={onNavigateFolder}
            onRemove={onRemoveFavorite}
            onClose={() => setActivePopup(null)}
          />
        </ToolPopupShell>
      )}
    </div>
  );
}

function ToolTrigger({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof Search;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1.5 rounded px-2 py-1.5 font-mono text-[11px] transition-colors duration-150",
        active
          ? "bg-secondary text-foreground"
          : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
      )}
    >
      <Icon className="size-3.5 shrink-0" />
      <span>{label}</span>
    </button>
  );
}

/**
 * Shared floating shell every popup renders inside — rounded, shadowed,
 * anchored just below the Tools row, and layered above the sidebar without
 * shifting it (or the editor) out of the way. Closing is handled by the
 * parent's outside-click/Escape listener; this shell is purely visual.
 */
function ToolPopupShell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1.5 animate-in rounded-lg border border-border bg-popover shadow-lg duration-200 ease-in-out fade-in zoom-in-95 slide-in-from-top-1">
      <div className="border-b border-border px-2.5 py-1.5">
        <p className="label-caps">{label}</p>
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}
