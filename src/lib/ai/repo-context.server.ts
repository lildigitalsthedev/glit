/**
 * Fast, cheap keyword-based context retrieval for repository files.
 * This is an heuristic file-selection step (not vector/semantic search)
 * aimed at retrieving relevant source files based on query keywords.
 */

import { listTree, readFile } from "../github/api.server";

export interface BuildRepoContextOptions {
  token: string;
  fullName: string;
  branch: string;
  question: string;
}

export interface BuildRepoContextResult {
  context: string;
  filesUsed: string[];
}

const MAX_FILE_SIZE_BYTES = 60 * 1024; // ~60KB
const MAX_FILE_CHARS = 4000;
const MAX_TOTAL_CONTEXT_CHARS = 24000;
const MAX_STRUCTURE_PATHS = 300;

// Extension and path filters for noise / binary files
const NOISE_DIR_REGEX =
  /(^|\/)(node_modules|\.git|\.next|\.output|dist|build|vendor|\.turbo|\.cache|coverage)(\/|$)/i;

const LOCKFILE_REGEX =
  /(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb|Cargo\.lock|Gemfile\.lock|composer\.lock|poetry\.lock|mix\.lock)$/i;

const BINARY_EXT_REGEX =
  /\.(png|jpe?g|gif|svg|ico|webp|avif|pdf|woff2?|ttf|eot|mp4|webm|mkv|mov|avi|mp3|wav|zip|gz|tar|tgz|7z|rar|exe|dll|so|dylib|wasm|pyc|class)$/i;

/**
 * Filter out noise, lockfiles, images, and large binary files.
 */
function isUsefulSourceBlob(item: { path: string; type: string; size?: number }): boolean {
  if (item.type !== "blob") return false;
  if (item.size !== undefined && item.size > MAX_FILE_SIZE_BYTES) return false;
  if (NOISE_DIR_REGEX.test(item.path)) return false;
  if (LOCKFILE_REGEX.test(item.path)) return false;
  if (BINARY_EXT_REGEX.test(item.path)) return false;
  return true;
}

/**
 * Extracts distinct lowercased keywords longer than 2 characters from the question.
 */
function extractKeywords(question: string): string[] {
  return Array.from(
    new Set(
      question
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 2)
    )
  );
}

export async function buildRepoContext(
  opts: BuildRepoContextOptions
): Promise<BuildRepoContextResult> {
  const { token, fullName, branch, question } = opts;

  const { tree } = await listTree(token, fullName, branch);

  // Filter valid candidate files
  const candidates = tree.filter(isUsefulSourceBlob);

  const keywords = extractKeywords(question);

  // Score candidate paths based on keyword occurrences
  const scored = candidates.map((item) => {
    const pathLower = item.path.toLowerCase();
    let score = 0;
    for (const kw of keywords) {
      if (pathLower.includes(kw)) {
        score += 1;
      }
    }
    return { ...item, score };
  });

  // Sort by score descending, then by path length ascending
  scored.sort((a, b) => b.score - a.score || a.path.length - b.path.length);

  let selected: (typeof candidates)[number][] = scored
    .filter((item) => item.score > 0)
    .slice(0, 8);

  // Fallback if no paths matched any keywords
  if (selected.length === 0) {
    const readmes = candidates.filter((item) => /(^|\/)readme(\.|$)/i.test(item.path));
    const rootFiles = candidates
      .filter((item) => !item.path.includes("/"))
      .sort((a, b) => a.path.length - b.path.length);

    const fallbackMap = new Map<string, (typeof candidates)[number]>();
    for (const item of [...readmes, ...rootFiles]) {
      fallbackMap.set(item.path, item);
    }
    selected = Array.from(fallbackMap.values()).slice(0, 8);
  }

  // Fetch selected file contents concurrently with error tolerance
  const fetchedFiles = await Promise.all(
    selected.map(async (item) => {
      try {
        const result = await readFile(token, fullName, branch, item.path);
        const content = typeof result === "string" ? result : result.content;
        return { path: item.path, content };
      } catch {
        return null;
      }
    })
  );

  // Overall file tree structure overview prefix
  const allRepoPaths = tree.slice(0, MAX_STRUCTURE_PATHS).map((t) => t.path);
  const structurePrefix = `Repository Structure (${allRepoPaths.length} paths shown):\n${allRepoPaths.join(
    "\n"
  )}\n\n`;

  let context = structurePrefix;
  const filesUsed: string[] = [];

  for (const file of fetchedFiles) {
    if (!file || typeof file.content !== "string") continue;

    const truncatedContent =
      file.content.length > MAX_FILE_CHARS
        ? file.content.slice(0, MAX_FILE_CHARS) + "\n... [truncated]"
        : file.content;

    const formattedEntry = `### ${file.path}\n\`\`\`\n${truncatedContent}\n\`\`\`\n\n`;

    if ((context + formattedEntry).length > MAX_TOTAL_CONTEXT_CHARS && filesUsed.length > 0) {
      break;
    }

    context += formattedEntry;
    filesUsed.push(file.path);
  }

  return { context, filesUsed };
}