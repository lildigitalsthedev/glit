// Server-only. Repo-wide content search — the gap the existing command
// palette doesn't cover: the palette matches file *paths* against a query
// (see `fileItems` in workspace.tsx), but nothing in GitPush lets you find
// which files actually *contain* a string. This is the equivalent of an
// editor's "Find in Files" / VS Code's Ctrl+Shift+F, scoped to whichever
// branch is currently checked out.
//
// Deliberately not built on GitHub's `/search/code` endpoint: that index
// only covers a repo's default branch and lags private repos unpredictably,
// which would make results silently wrong on any other branch. Instead
// this walks the real git tree for the selected branch and greps file
// contents directly — slower, but always correct for what's actually
// there right now.
import { listTree, readFile } from "./api.server";

const MAX_CONTENT_FILE_BYTES = 200_000; // skip anything larger — unlikely to be hand-searched source, and keeps latency bounded
const MAX_FILES_SCANNED = 150; // caps total GitHub API calls per search
const MAX_CONTENT_MATCHES = 200;
const MATCHES_PER_FILE = 5;
const CONCURRENCY = 8;
const SNIPPET_RADIUS = 60; // characters of context on each side of a match

const EXCLUDED_PATH_SEGMENTS = ["node_modules/", ".git/", "dist/", "build/", ".next/", "vendor/", ".turbo/"];
const BINARY_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "bmp", "tiff",
  "woff", "woff2", "ttf", "eot", "otf",
  "zip", "gz", "tar", "rar", "7z",
  "pdf", "mp4", "mp3", "wav", "mov", "avi", "webm",
  "exe", "dll", "so", "dylib", "class", "jar", "wasm",
  "lock", "sqlite", "db",
]);

function extensionOf(path: string): string {
  const dot = path.lastIndexOf(".");
  return dot === -1 ? "" : path.slice(dot + 1).toLowerCase();
}

function isEligibleForContentScan(path: string): boolean {
  const lower = path.toLowerCase();
  if (EXCLUDED_PATH_SEGMENTS.some((seg) => lower.includes(seg))) return false;
  return !BINARY_EXTENSIONS.has(extensionOf(lower));
}

export interface RepoFileNameMatch {
  path: string;
  size: number;
}

export interface RepoContentMatch {
  path: string;
  lineNumber: number;
  line: string;
}

export interface RepoSearchResult {
  query: string;
  truncated: boolean;
  filesScanned: number;
  totalEligibleFiles: number;
  fileNameMatches: RepoFileNameMatch[];
  contentMatches: RepoContentMatch[];
}

function snippet(line: string, index: number, queryLength: number): string {
  const start = Math.max(0, index - SNIPPET_RADIUS);
  const end = Math.min(line.length, index + queryLength + SNIPPET_RADIUS);
  const prefix = start > 0 ? "…" : "";
  const suffix = end < line.length ? "…" : "";
  return `${prefix}${line.slice(start, end).trim()}${suffix}`;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = items[index++];
      results.push(await fn(current));
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function searchRepositoryContents(args: {
  token: string;
  fullName: string;
  branch: string;
  query: string;
}): Promise<RepoSearchResult> {
  const query = args.query.trim();
  if (query.length < 2) throw new Error("Search query must be at least 2 characters.");
  if (query.length > 200) throw new Error("Search query is too long.");
  const needle = query.toLowerCase();

  const tree = await listTree(args.token, args.fullName, args.branch);
  const blobs = tree.tree.filter((entry) => entry.type === "blob");

  const fileNameMatches: RepoFileNameMatch[] = blobs
    .filter((entry) => entry.path.toLowerCase().includes(needle))
    .slice(0, 100)
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }));

  const eligible = blobs
    .filter(
      (entry) =>
        isEligibleForContentScan(entry.path) &&
        (entry.size ?? 0) > 0 &&
        (entry.size ?? 0) <= MAX_CONTENT_FILE_BYTES,
    )
    .sort((a, b) => (a.size ?? 0) - (b.size ?? 0));

  const toScan = eligible.slice(0, MAX_FILES_SCANNED);
  const contentMatches: RepoContentMatch[] = [];
  let filesScanned = 0;

  await mapWithConcurrency(toScan, CONCURRENCY, async (entry) => {
    if (contentMatches.length >= MAX_CONTENT_MATCHES) return;
    try {
      const file = await readFile(args.token, args.fullName, args.branch, entry.path);
      filesScanned++;
      const lines = file.content.split("\n");
      let matchesInFile = 0;
      for (let i = 0; i < lines.length && matchesInFile < MATCHES_PER_FILE; i++) {
        const idx = lines[i].toLowerCase().indexOf(needle);
        if (idx === -1) continue;
        contentMatches.push({
          path: entry.path,
          lineNumber: i + 1,
          line: snippet(lines[i], idx, needle.length),
        });
        matchesInFile++;
      }
    } catch {
      // Renamed/deleted mid-scan, or a transient GitHub error — skip it
      // rather than failing the whole search over one file.
    }
  });

  return {
    query,
    truncated: tree.truncated || eligible.length > MAX_FILES_SCANNED,
    filesScanned,
    totalEligibleFiles: eligible.length,
    fileNameMatches,
    contentMatches: contentMatches.slice(0, MAX_CONTENT_MATCHES),
  };
}
