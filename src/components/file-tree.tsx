import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  Copy,
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
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

/** Returns `prev` unchanged (same reference) if every item is already present,
 * so callers can skip a re-render when nothing actually changed. */
function addAll(prev: Set<string>, items: string[]): Set<string> {
  let changed = false;
  const next = new Set(prev);
  for (const item of items) {
    if (!next.has(item)) {
      next.add(item);
      changed = true;
    }
  }
  return changed ? next : prev;
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

function fileExtension(name: string): string {
  const idx = name.lastIndexOf(".");
  // A leading dot (e.g. ".gitignore") means "no extension", not an
  // extension called "gitignore".
  if (idx <= 0) return "";
  return name.slice(idx + 1).toLowerCase();
}

function FileIcon({ name }: { name: string }) {
  const ext = fileExtension(name);
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

/**
 * Parsed search query. Typing a leading dot (e.g. ".ts" or ".tsx")
 * switches to exact-extension mode so users can filter down to a single
 * file type instead of getting substring matches from anywhere in the path.
 */
type ParsedQuery = { mode: "extension"; value: string } | { mode: "text"; value: string };

function parseQuery(raw: string): ParsedQuery | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) return null;
  if (trimmed.startsWith(".") && trimmed.length > 1) {
    return { mode: "extension", value: trimmed.slice(1) };
  }
  return { mode: "text", value: trimmed };
}

interface SearchMatch {
  path: string;
  name: string;
  /** Lower relevance number = better match, used for sorting. */
  score: number;
  /** Character offset of the highlighted span within the full path label. -1 = no highlight. */
  highlightStart: number;
  highlightLength: number;
}

/**
 * Scores a single file path against the parsed query. Returns null when the
 * path doesn't match at all. Matching (and highlighting) considers the full
 * path — so it covers file names, folder names, and extensions in one pass.
 */
function matchPath(path: string, name: string, query: ParsedQuery): SearchMatch | null {
  const lowerPath = path.toLowerCase();
  const lowerName = name.toLowerCase();

  if (query.mode === "extension") {
    const ext = fileExtension(name);
    if (ext !== query.value) return null;
    const dotIndex = lowerName.lastIndexOf(`.${query.value}`);
    return {
      path,
      name,
      score: 0,
      highlightStart: path.length - (name.length - dotIndex),
      highlightLength: name.length - dotIndex,
    };
  }

  const { value } = query;

  // Best: file name starts with the query.
  if (lowerName.startsWith(value)) {
    return {
      path,
      name,
      score: 0,
      highlightStart: path.length - name.length,
      highlightLength: value.length,
    };
  }

  // Next: file name contains the query anywhere.
  const nameIdx = lowerName.indexOf(value);
  if (nameIdx !== -1) {
    return {
      path,
      name,
      score: 1,
      highlightStart: path.length - name.length + nameIdx,
      highlightLength: value.length,
    };
  }

  // Next: a folder segment in the path matches (folder-name search).
  const segments = path.split("/");
  let cursor = 0;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i]!;
    const segIdx = segment.toLowerCase().indexOf(value);
    if (segIdx !== -1) {
      return {
        path,
        name,
        score: 2,
        highlightStart: cursor + segIdx,
        highlightLength: value.length,
      };
    }
    cursor += segment.length + 1;
  }

  // Fallback: match anywhere in the full path (e.g. spanning a "/").
  const pathIdx = lowerPath.indexOf(value);
  if (pathIdx !== -1) {
    return { path, name, score: 3, highlightStart: pathIdx, highlightLength: value.length };
  }

  return null;
}

function searchFiles(paths: string[], query: ParsedQuery): SearchMatch[] {
  const results: SearchMatch[] = [];
  for (const path of paths) {
    const name = path.split("/").pop() ?? path;
    const match = matchPath(path, name, query);
    if (match) results.push(match);
  }
  results.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    return a.path.localeCompare(b.path);
  });
  return results;
}

/** Renders text with the matched span wrapped in a highlight <mark>. */
function HighlightedLabel({
  text,
  start,
  length,
}: {
  text: string;
  start: number;
  length: number;
}) {
  if (start < 0 || length <= 0 || start >= text.length) return <>{text}</>;
  const before = text.slice(0, start);
  const match = text.slice(start, start + length);
  const after = text.slice(start + length);
  return (
    <>
      {before}
      <mark className="rounded-sm bg-primary/25 text-foreground">{match}</mark>
      {after}
    </>
  );
}

const LONG_PRESS_MS = 500;

/**
 * A single selectable file row used both in the nested tree and the flat
 * search-results list. Every file gets a ⋮ actions menu (Edit / Copy Path /
 * Delete) that can be opened by tapping the menu button, right-clicking, or
 * long-pressing the row on touch devices.
 */
function FileRow({
  path,
  name,
  label,
  isActive,
  paddingLeft,
  highlight,
  onOpenFile,
  onCopyPath,
  onDeleteFile,
}: {
  path: string;
  name: string;
  /** Text shown in the row — usually the file name, or the full path in search results. */
  label: string;
  isActive: boolean;
  paddingLeft: number;
  /** Optional matched-substring span (in `label` coordinates) to highlight. */
  highlight?: { start: number; length: number };
  onOpenFile: (path: string) => void;
  onCopyPath: (path: string) => void;
  onDeleteFile: (path: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  function startLongPress() {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setMenuOpen(true);
    }, LONG_PRESS_MS);
  }

  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  return (
    <div className="group relative flex items-center">
      <button
        onClick={() => {
          // A long-press already opened the actions menu — don't also open
          // the file on the touchend-triggered click that follows it.
          if (longPressFired.current) {
            longPressFired.current = false;
            return;
          }
          onOpenFile(path);
        }}
        onTouchStart={startLongPress}
        onTouchEnd={cancelLongPress}
        onTouchMove={cancelLongPress}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        style={{ paddingLeft }}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 truncate rounded py-1 pr-7 text-left font-mono text-[11px] transition-colors duration-150",
          isActive
            ? "bg-secondary text-foreground"
            : "text-muted-foreground hover:bg-secondary/40 hover:text-foreground",
        )}
        title={path}
      >
        <FileIcon name={name} />
        <span className="truncate">
          {highlight ? (
            <HighlightedLabel text={label} start={highlight.start} length={highlight.length} />
          ) : (
            label
          )}
        </span>
      </button>

      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={`Actions for ${name}`}
            className={cn(
              "absolute right-1 flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground opacity-100 transition-opacity duration-150 hover:bg-secondary hover:text-foreground sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100",
              menuOpen && "sm:opacity-100",
            )}
          >
            <MoreVertical className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onSelect={() => onOpenFile(path)}>
            <Pencil className="size-3.5" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCopyPath(path)}>
            <Copy className="size-3.5" />
            Copy Path
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onDeleteFile(path)}
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
          >
            <Trash2 className="size-3.5" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function FileTree({
  nodes,
  loading,
  filter,
  activePath,
  activeFolder,
  onOpenFile,
  onSelectFolder,
  onCopyPath,
  onDeleteFile,
}: {
  nodes: TreeNode[];
  loading?: boolean;
  filter: string;
  activePath: string;
  activeFolder: string | null;
  onOpenFile: (path: string) => void;
  onSelectFolder: (path: string | null) => void;
  onCopyPath: (path: string) => void;
  onDeleteFile: (path: string) => void;
}) {
  const blobPaths = useMemo(
    () => nodes.filter((n) => n.type === "blob").map((n) => n.path),
    [nodes],
  );

  const tree = useMemo(() => buildTree(blobPaths), [blobPaths]);

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(ancestorPaths(activePath)));
  // Folders whose contents have been rendered at least once. Collapsed
  // folders that were never opened stay out of the DOM entirely — the main
  // win for large repositories, where most of the tree is usually collapsed.
  // Once a folder is opened it stays mounted (even after collapsing again)
  // so the existing collapse/expand animation keeps working exactly as
  // before; only the very first render of a subtree is deferred.
  const [mounted, setMounted] = useState<Set<string>>(() => new Set(ancestorPaths(activePath)));

  // Whenever a different file becomes active (e.g. via search), make sure
  // its folder chain is expanded so the selection is actually visible.
  useEffect(() => {
    if (!activePath) return;
    const ancestors = ancestorPaths(activePath);
    setExpanded((prev) => addAll(prev, ancestors));
    setMounted((prev) => addAll(prev, ancestors));
  }, [activePath]);

  // Whenever the active folder changes (e.g. the user clicks a breadcrumb),
  // make sure that folder and all of its ancestors are expanded so the
  // destination is actually visible in the tree.
  useEffect(() => {
    if (!activeFolder) return;
    const parts = activeFolder.split("/").filter(Boolean);
    const ancestors = parts.map((_, i) => parts.slice(0, i + 1).join("/"));
    setExpanded((prev) => addAll(prev, ancestors));
    setMounted((prev) => addAll(prev, ancestors));
  }, [activeFolder]);

  function toggleFolder(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
    setMounted((prev) => (prev.has(path) ? prev : addAll(prev, [path])));
  }

  // Defer the expensive part (matching + rendering results) so the input
  // itself never feels laggy while typing, even against a very large file
  // list — React keeps the text box responsive and catches the tree up a
  // moment later.
  const deferredFilter = useDeferredValue(filter);
  const parsedQuery = useMemo(() => parseQuery(deferredFilter), [deferredFilter]);

  const matches = useMemo(() => {
    if (!parsedQuery) return null;
    return searchFiles(blobPaths, parsedQuery).slice(0, 500);
  }, [blobPaths, parsedQuery]);

  if (loading) {
    return (
      <div className="flex h-24 items-center justify-center">
        <Loader2 className="size-4 animate-spin text-primary" />
      </div>
    );
  }

  // While searching, show a flat, ranked list of matches instead of the
  // nested tree — it's faster to scan and doesn't require expanding folders.
  // Matches can come from a file name, a folder name anywhere in the path,
  // or (with a leading ".", e.g. ".tsx") an exact file extension.
  if (parsedQuery) {
    if (!matches || matches.length === 0) {
      return (
        <EmptyState
          size="compact"
          icon={FileSearch}
          title="No files found."
          description={"Nothing matches \u201c" + filter.trim() + "\u201d. Search matches file names, folder names, or an extension like \u201c.tsx\u201d."}
        />
      );
    }
    return (
      <div className="flex flex-col py-1">
        <p className="px-2 pb-1 pt-0.5 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
          {matches.length} {matches.length === 1 ? "result" : "results"}
        </p>
        {matches.map((match) => (
          <FileRow
            key={match.path}
            path={match.path}
            name={match.name}
            label={match.path}
            isActive={match.path === activePath}
            paddingLeft={8}
            highlight={{ start: match.highlightStart, length: match.highlightLength }}
            onOpenFile={onOpenFile}
            onCopyPath={onCopyPath}
            onDeleteFile={onDeleteFile}
          />
        ))}
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
      const indent = 6 + depth * 12;
      if (entry.type === "dir") {
        const isOpen = expanded.has(entry.path);
        const isMounted = mounted.has(entry.path);
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
                "flex w-full items-center gap-1.5 truncate rounded py-1 pr-2 text-left font-mono text-[11px] transition-colors duration-150",
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
              {/* Never-opened folders render nothing here at all — the big
                  win for large repos, where most subtrees stay collapsed. */}
              <div className="overflow-hidden">
                {isMounted ? renderDir(entry, depth + 1) : null}
              </div>
            </div>
          </div>
        );
      }

      const isActiveFile = entry.path === activePath;
      return (
        <FileRow
          key={entry.path}
          path={entry.path}
          name={entry.name}
          label={entry.name}
          isActive={isActiveFile}
          paddingLeft={indent + 14}
          onOpenFile={onOpenFile}
          onCopyPath={onCopyPath}
          onDeleteFile={onDeleteFile}
        />
      );
    });
  }

  return (
    <div className="flex flex-col py-1">
      <button
        onClick={() => onSelectFolder(null)}
        className={cn(
          "flex w-full items-center gap-1.5 truncate rounded py-1 pl-2 pr-2 text-left font-mono text-[11px] transition-colors duration-150",
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
