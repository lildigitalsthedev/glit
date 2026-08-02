import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  File,
  FileCode2,
  FileJson2,
  FileText,
  FileImage,
  FileCog,
  FileSearch,
  FolderOpen,
  FolderX,
  Folder,
  Home,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";
import type { TreeNode } from "@/lib/github.functions";

interface FileEntry {
  type: "file";
  name: string;
  path: string;
}

interface DirEntry {
  type: "dir";
  name: string;
  path: string;
  children: Map<string, DirEntry | FileEntry>;
}

function buildTree(paths: string[]): DirEntry {
  const root: DirEntry = { type: "dir", name: "", path: "", children: new Map() };
  for (const filePath of paths) {
    const parts = filePath.split("/").filter(Boolean);
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i]!;
      const isFile = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");
      if (isFile) {
        cursor.children.set(`f:${segment}`, { type: "file", name: segment, path });
      } else {
        const key = `d:${segment}`;
        let next = cursor.children.get(key);
        if (!next || next.type !== "dir") {
          next = { type: "dir", name: segment, path, children: new Map() };
          cursor.children.set(key, next);
        }
        cursor = next;
      }
    }
  }
  return root;
}

function sortedEntries(dir: DirEntry): (DirEntry | FileEntry)[] {
  return [...dir.children.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function ancestorPaths(path: string): string[] {
  const parts = path.split("/").filter(Boolean);
  const out: string[] = [];
  for (let i = 1; i < parts.length; i++) out.push(parts.slice(0, i).join("/"));
  return out;
}

const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "mjs",
  "cjs",
  "py",
  "go",
  "rs",
  "rb",
  "java",
  "c",
  "cpp",
  "h",
  "sh",
  "sql",
  "php",
]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);
const CONFIG_NAMES = new Set([
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  ".gitignore",
  ".env",
  ".eslintrc",
  "eslint.config.js",
]);

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (CONFIG_NAMES.has(name) || name.startsWith(".")) {
    return <FileCog className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (ext === "json") return <FileJson2 className="size-3.5 shrink-0 text-code-string" />;
  if (ext === "md" || ext === "mdx" || ext === "txt") {
    return <FileText className="size-3.5 shrink-0 text-muted-foreground" />;
  }
  if (IMAGE_EXTENSIONS.has(ext)) return <FileImage className="size-3.5 shrink-0 text-accent" />;
  if (CODE_EXTENSIONS.has(ext)) return <FileCode2 className="size-3.5 shrink-0 text-primary" />;
  return <File className="size-3.5 shrink-0 text-muted-foreground" />;
}

export function FileTree({
  nodes,
  loading,
  filter,
  activePath,
  activeFolder,
  onOpenFile,
  onSelectFolder,
}: {
  nodes: TreeNode[];
  loading?: boolean;
  filter: string;
  activePath: string;
  activeFolder: string | null;
  onOpenFile: (path: string) => void;
  onSelectFolder: (path: string | null) => void;
}) {
  const blobPaths = useMemo(
    () => nodes.filter((n) => n.type === "blob").map((n) => n.path),
    [nodes],
  );

  const tree = useMemo(() => buildTree(blobPaths), [blobPaths]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestorPaths(activePath)));

  // Whenever a different file becomes active (e.g. via search), make sure
  // its folder chain is expanded so the selection is actually visible.
  useEffect(() => {
    if (!activePath) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const ancestor of ancestorPaths(activePath)) {
        if (!next.has(ancestor)) {
          next.add(ancestor);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activePath]);

  // Whenever the active folder changes (e.g. the user clicks a breadcrumb),
  // make sure that folder and all of its ancestors are expanded so the
  // destination is actually visible in the tree.
  useEffect(() => {
    if (!activeFolder) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      const parts = activeFolder.split("/").filter(Boolean);
      for (let i = 1; i <= parts.length; i++) {
        const ancestor = parts.slice(0, i).join("/");
        if (!next.has(ancestor)) {
          next.add(ancestor);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [activeFolder]);

  function toggleFolder(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  const trimmedFilter = filter.trim().toLowerCase();

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-primary" />
      </div>
    );
  }

  // While searching, show a flat, ranked list of matches instead of the
  // nested tree — it's faster to scan and doesn't require expanding folders.
  if (trimmedFilter) {
    const matches = blobPaths.filter((p) => p.toLowerCase().includes(trimmedFilter)).slice(0, 500);
    if (matches.length === 0) {
      return (
        <EmptyState
          size="compact"
          icon={FileSearch}
          title="No files found."
          description={`Nothing matches “${filter.trim()}”.`}
        />
      );
    }
    return (
      <div className="flex flex-col py-1">
        {matches.map((path) => {
          const name = path.split("/").pop() ?? path;
          return (
            <button
              key={path}
              onClick={() => onOpenFile(path)}
              className={cn(
                "flex w-full items-center gap-2 truncate rounded px-2 py-1.5 text-left font-mono text-[11px] transition-colors duration-150",
                path === activePath
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground",
              )}
              title={path}
            >
              <FileIcon name={name} />
              <span className="truncate">{path}</span>
            </button>
          );
        })}
      </div>
    );
  }

  if (blobPaths.length === 0) {
    return (
      <EmptyState
        size="compact"
        icon={FolderX}
        title="No files found."
        description="This branch doesn't have any files yet."
      />
    );
  }

  function renderDir(dir: DirEntry, depth: number) {
    const entries = sortedEntries(dir);
    return entries.map((entry) => {
      const indent = 8 + depth * 14;
      if (entry.type === "dir") {
        const isOpen = expanded.has(entry.path);
        const isActiveFolder = entry.path === activeFolder;
        return (
          <div key={entry.path}>
            <button
              onClick={() => {
                toggleFolder(entry.path);
                onSelectFolder(entry.path);
              }}
              style={{ paddingLeft: indent }}
              className={cn(
                "flex w-full items-center gap-1.5 truncate rounded py-1.5 pr-2 text-left font-mono text-[11px] transition-colors duration-150",
                isActiveFolder
                  ? "bg-secondary/70 text-foreground"
                  : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
              )}
              title={entry.path}
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

      const isActiveFile = entry.path === activePath;
      return (
        <button
          key={entry.path}
          onClick={() => onOpenFile(entry.path)}
          style={{ paddingLeft: indent + 16 }}
          className={cn(
            "flex w-full items-center gap-2 truncate rounded py-1.5 pr-2 text-left font-mono text-[11px] transition-colors duration-150",
            isActiveFile
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
          )}
          title={entry.path}
        >
          <FileIcon name={entry.name} />
          <span className="truncate">{entry.name}</span>
        </button>
      );
    });
  }

  return (
    <div className="flex flex-col py-1">
      <button
        onClick={() => onSelectFolder(null)}
        className={cn(
          "flex w-full items-center gap-1.5 truncate rounded py-1.5 pl-2 pr-2 text-left font-mono text-[11px] transition-colors duration-150",
          activeFolder === null
            ? "bg-secondary/70 text-foreground"
            : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
        )}
        title="Repository root"
      >
        <Home className="size-3.5 shrink-0 text-primary" />
        <span className="truncate">Repository root</span>
      </button>
      {renderDir(tree, 0)}
    </div>
  );
}
