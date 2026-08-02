/**
 * Smart Path Prediction
 *
 * Builds a lightweight, reusable index of a repository's existing file
 * paths so upload flows can suggest where a newly-uploaded file most
 * likely belongs, without re-scanning the repo on every upload.
 *
 * The index should be built once per (repo, branch) — the caller already
 * has that data cached (the file tree query), so `buildPathIndex` is cheap
 * to call from a `useMemo` keyed on that same data. It naturally refreshes
 * whenever the repo changes, the branch changes, or the tree is manually
 * refreshed, since those are exactly the events that change the incoming
 * `paths` array.
 */

export interface PathIndex {
  /** Every known blob path in the repository, e.g. "src/hooks/useAuth.ts". */
  paths: string[];
  /** Lowercased basename (e.g. "navbar.tsx") -> matching full paths. */
  byBasename: Map<string, string[]>;
  /** Lowercased filename stem, extension stripped (e.g. "navbar") -> matching full paths. */
  byStem: Map<string, string[]>;
}

function basename(path: string): string {
  const cleaned = path.replace(/^\/+/, "");
  const slash = cleaned.lastIndexOf("/");
  return slash === -1 ? cleaned : cleaned.slice(slash + 1);
}

function stem(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

export function buildPathIndex(paths: string[]): PathIndex {
  const byBasename = new Map<string, string[]>();
  const byStem = new Map<string, string[]>();

  for (const path of paths) {
    const base = basename(path);
    if (!base) continue;

    const baseKey = base.toLowerCase();
    const baseBucket = byBasename.get(baseKey);
    if (baseBucket) baseBucket.push(path);
    else byBasename.set(baseKey, [path]);

    const stemKey = stem(base).toLowerCase();
    const stemBucket = byStem.get(stemKey);
    if (stemBucket) stemBucket.push(path);
    else byStem.set(stemKey, [path]);
  }

  return { paths, byBasename, byStem };
}

function dedupeSorted(paths: string[]): string[] {
  return Array.from(new Set(paths)).sort((a, b) => a.localeCompare(b));
}

/**
 * Suggests destination paths for an uploaded file, based purely on the
 * uploaded filename (not the destination the user may have already typed).
 *
 * Priority order:
 *  1. Exact filename matches anywhere in the repo (case-insensitive).
 *  2. If none, filenames that match once extensions are ignored (e.g.
 *     "navbar.jsx" upload matching an existing "Navbar.tsx").
 *  3. If still none, no suggestions are returned — callers must leave the
 *     destination as-is rather than inventing a fake path.
 */
export function suggestPathsForFilename(index: PathIndex, filename: string): string[] {
  const base = basename(filename);
  if (!base) return [];

  const exact = index.byBasename.get(base.toLowerCase());
  if (exact?.length) return dedupeSorted(exact);

  const similar = index.byStem.get(stem(base).toLowerCase());
  if (similar?.length) return dedupeSorted(similar);

  return [];
}
