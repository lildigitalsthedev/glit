import { useState, type ReactNode } from "react";
import { ChevronRight, File, Folder, FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { fileStatus, sortedChildren, type DirNode, type PreviewItem } from "@/lib/commit-preview";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, exponent);
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}

export function CommitFileTree<T extends PreviewItem>({
  root,
  existingPaths,
  onRemove,
  disabled,
  renderFileDetail,
}: {
  root: DirNode<T>;
  existingPaths: ReadonlySet<string>;
  onRemove?: (id: string) => void;
  disabled?: boolean;
  /** Custom content shown once a file row is expanded. Defaults to a
   * full-path line when omitted. */
  renderFileDetail?: (item: T, fullPath: string, status: "new" | "modified") => ReactNode;
}) {
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(() => new Set());
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(() => new Set());

  function toggleFolder(path: string) {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleFile(id: string) {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderDir(dir: DirNode<T>, depth: number): ReactNode {
    return sortedChildren(dir).map((entry) => {
      const indent = 8 + depth * 14;

      if (entry.type === "dir") {
        const isOpen = !collapsedFolders.has(entry.relativePath);
        return (
          <div key={entry.relativePath}>
            <button
              type="button"
              onClick={() => toggleFolder(entry.relativePath)}
              style={{ paddingLeft: indent }}
              className="flex w-full items-center gap-1.5 truncate rounded py-1.5 pr-2 text-left font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-secondary/40 hover:text-foreground"
              title={entry.relativePath}
            >
              <ChevronRight
                className={cn(
                  "size-3 shrink-0 transition-transform duration-200",
                  isOpen && "rotate-90",
                )}
              />
              {isOpen ? (
                <FolderOpen className="size-3.5 shrink-0 text-primary" />
              ) : (
                <Folder className="size-3.5 shrink-0 text-primary" />
              )}
              <span className="truncate">{entry.name}</span>
            </button>
            <div
              className={cn(
                "grid transition-[grid-template-rows] duration-200 ease-out",
                isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
              )}
            >
              <div className="overflow-hidden">{renderDir(entry, depth + 1)}</div>
            </div>
          </div>
        );
      }

      const status = fileStatus(entry.fullPath, existingPaths);
      const isExpanded = expandedFiles.has(entry.item.id);

      return (
        <div key={entry.item.id}>
          <div
            role="button"
            tabIndex={0}
            onClick={() => toggleFile(entry.item.id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                toggleFile(entry.item.id);
              }
            }}
            style={{ paddingLeft: indent }}
            className="group flex cursor-pointer items-center gap-2 truncate rounded py-1.5 pr-2 font-mono text-[11px] text-muted-foreground transition-colors duration-150 hover:bg-secondary/30"
            title={entry.fullPath}
          >
            <ChevronRight
              className={cn(
                "size-3 shrink-0 transition-transform duration-200",
                isExpanded && "rotate-90",
              )}
            />
            <File className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1 truncate">
              {entry.name}
              <span className={status === "new" ? "text-primary" : "text-amber-500"}>
                {" "}
                · {status}
              </span>
            </span>
            <span className="shrink-0 text-[10px] opacity-70">{formatBytes(entry.item.size)}</span>
            {onRemove && (
              <Button
                variant="ghost"
                size="icon"
                className="size-5 shrink-0 opacity-0 group-hover:opacity-100 hover:text-destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemove(entry.item.id);
                }}
                disabled={disabled}
                aria-label={`Remove ${entry.fullPath}`}
              >
                <X className="size-3" />
              </Button>
            )}
          </div>
          {isExpanded && (
            <div style={{ paddingLeft: indent + 20 }} className="pb-1.5 pr-2">
              {renderFileDetail ? (
                renderFileDetail(entry.item, entry.fullPath, status)
              ) : (
                <p className="truncate font-mono text-[10px] text-muted-foreground">
                  {entry.fullPath}
                </p>
              )}
            </div>
          )}
        </div>
      );
    });
  }

  return <div className="flex flex-col py-1">{renderDir(root, 0)}</div>;
}
