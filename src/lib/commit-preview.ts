/**
 * Shared preview-tree utilities for every "push multiple files in one
 * commit" flow (bulk upload, upload folder, upload ZIP).
 *
 * Each flow has its own `pending` item shape (File vs. extracted bytes,
 * etc.), so this module stays generic over `T` and only needs an `id` and a
 * `size` to compute folder counts and new-vs-modified totals.
 */

export interface PreviewItem {
  id: string;
  size: number;
}

export interface FileNode<T extends PreviewItem> {
  type: "file";
  name: string;
  /** Path relative to the tree root (not necessarily the repo root). */
  relativePath: string;
  /** Full destination path in the repository — used to detect new vs. modified. */
  fullPath: string;
  item: T;
}

export interface DirNode<T extends PreviewItem> {
  type: "dir";
  name: string;
  relativePath: string;
  children: Map<string, DirNode<T> | FileNode<T>>;
}

export type TreeNode<T extends PreviewItem> = DirNode<T> | FileNode<T>;

export interface PreviewSource<T extends PreviewItem> {
  item: T;
  /** Path relative to the tree root, e.g. "src/App.tsx". */
  relativePath: string;
  /** Full destination path in the repository. */
  fullPath: string;
}

export function buildCommitTree<T extends PreviewItem>(sources: PreviewSource<T>[]): DirNode<T> {
  const root: DirNode<T> = { type: "dir", name: "", relativePath: "", children: new Map() };
  for (const source of sources) {
    const parts = source.relativePath.split("/").filter(Boolean);
    let cursor = root;
    for (let i = 0; i < parts.length; i++) {
      const segment = parts[i]!;
      const isFile = i === parts.length - 1;
      const relativePath = parts.slice(0, i + 1).join("/");
      if (isFile) {
        cursor.children.set(`f:${segment}`, {
          type: "file",
          name: segment,
          relativePath,
          fullPath: source.fullPath,
          item: source.item,
        });
      } else {
        const key = `d:${segment}`;
        let next = cursor.children.get(key);
        if (!next || next.type !== "dir") {
          next = { type: "dir", name: segment, relativePath, children: new Map() };
          cursor.children.set(key, next);
        }
        cursor = next;
      }
    }
  }
  return root;
}

export function sortedChildren<T extends PreviewItem>(dir: DirNode<T>): TreeNode<T>[] {
  return [...dir.children.values()].sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function countFolders<T extends PreviewItem>(dir: DirNode<T>): number {
  let count = 0;
  for (const entry of dir.children.values()) {
    if (entry.type === "dir") count += 1 + countFolders(entry);
  }
  return count;
}

export interface CommitTotals {
  added: number;
  modified: number;
  folders: number;
}

/** Walks the whole tree once, tallying new files, modified (overwritten)
 * files, and folders that will be created. */
export function computeCommitTotals<T extends PreviewItem>(
  dir: DirNode<T>,
  existingPaths: ReadonlySet<string>,
): CommitTotals {
  let added = 0;
  let modified = 0;
  let folders = 0;
  for (const entry of dir.children.values()) {
    if (entry.type === "dir") {
      folders += 1;
      const nested = computeCommitTotals(entry, existingPaths);
      added += nested.added;
      modified += nested.modified;
      folders += nested.folders;
    } else if (existingPaths.has(entry.fullPath)) {
      modified += 1;
    } else {
      added += 1;
    }
  }
  return { added, modified, folders };
}

export function fileStatus(fullPath: string, existingPaths: ReadonlySet<string>): "new" | "modified" {
  return existingPaths.has(fullPath) ? "modified" : "new";
}
