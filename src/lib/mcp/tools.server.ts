import { z } from "zod";
import type { GhNewTreeEntry } from "../github/api.server";

/**
 * Tools exposed to external AI tools over MCP. Every call is scoped to the
 * key's owner: GitHub accounts are looked up with an explicit user_id filter
 * before any token is decrypted.
 */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Escapes `\`, `%` and `_` so a login is matched literally by ILIKE (case-insensitive) instead of as a pattern. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, "\\$&");
}

async function accountFor(userId: string, login?: string) {
  const db = await admin();
  let q = db.from("github_accounts").select("id, login").eq("user_id", userId);
  if (login) q = q.ilike("login", escapeLike(login));
  const { data, error } = await q.order("created_at", { ascending: true }).limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) {
    throw new Error(
      login
        ? `No connected GitHub account named "${login}".`
        : "No GitHub account connected. Connect one in Glit first.",
    );
  }
  const { loadAccountTokenAdmin } = await import("../github/tokens.server");
  const { token } = await loadAccountTokenAdmin(row.id as string);
  return { accountId: row.id as string, login: row.login as string, token };
}

const account = z.string().optional().describe("GitHub login to use (defaults to the first connected account)");
// Validated here (not just in a helper) so every tool rejects odd values like
// "owner/repo/../../user" before they are spliced into a GitHub API URL.
const repo = z
  .string()
  .regex(/^[\w.-]+\/[\w.-]+$/, 'Repository must use the "owner/repository" format.')
  .describe('Repository full name, e.g. "octocat/hello-world"');

/**
 * How a file's `content` string is encoded on the wire. Text files use "utf8"
 * (the default). Images and other binary files (png, jpg, ico, woff2, zip…)
 * must use "base64" so their bytes survive JSON transport unchanged.
 */
const encoding = z
  .enum(["utf8", "base64"])
  .describe(
    'How `content` is encoded. Use "utf8" for text (default) or "base64" for images and other binary files.',
  )
  .default("utf8");

type Encoding = "utf8" | "base64";

/**
 * Accepts plain base64 or a data URL ("data:image/png;base64,...."), strips
 * whitespace/newlines, restores missing padding and rejects anything that
 * isn't valid base64, so a bad upload fails loudly instead of committing a
 * corrupted file.
 */
function normalizeBase64(input: string, path: string): string {
  let s = input.trim();
  const dataUrl = /^data:[^,]*;base64,/i.exec(s);
  if (dataUrl) s = s.slice(dataUrl[0].length);
  s = s.replace(/\s+/g, "");
  // Tolerate URL-safe base64.
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(s)) {
    throw new Error(`Invalid base64 content for "${path}".`);
  }
  const rem = s.length % 4;
  if (rem === 1) throw new Error(`Invalid base64 content for "${path}" (bad length).`);
  if (rem > 0 && !s.endsWith("=")) s += "=".repeat(4 - rem);
  return s;
}

/**
 * Reads a file's raw bytes as base64. Falls back to the Git blobs API for
 * files the contents API won't inline (over 1 MB), which covers larger
 * images and other binaries.
 */
async function readFileBase64(token: string, repoName: string, branch: string, path: string) {
  const { ghFetch } = await import("../github/api.server");
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const meta = await ghFetch<{ content?: string; encoding?: string; sha: string; size: number }>(
    token,
    `/repos/${repoName}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`,
  );
  let b64 = meta.encoding === "base64" ? meta.content : undefined;
  if (!b64 && meta.size > 0) {
    const blob = await ghFetch<{ content?: string; encoding?: string }>(
      token,
      `/repos/${repoName}/git/blobs/${meta.sha}`,
    );
    if (blob.encoding !== "base64" || !blob.content) {
      throw new Error(`Could not read "${path}" as base64.`);
    }
    b64 = blob.content;
  }
  return { content: (b64 ?? "").replace(/\s+/g, ""), size: meta.size };
}

function checkedRepoName(value: string) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(value)) {
    throw new Error('Repository must use the "owner/repository" format.');
  }
  return value;
}

function checkedPath(value: string) {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("File paths must be repository-relative and cannot contain '.' or '..' segments.");
  }
  return normalized;
}

/** Writes one commit that creates/overwrites `updates` (base64 content) and removes `deletions`. */
async function commitFileChanges(
  token: string,
  fullName: string,
  branch: string,
  message: string,
  updates: { path: string; content: string }[],
  deletions: string[],
) {
  checkedRepoName(fullName);
  const paths = [...updates.map((file) => checkedPath(file.path)), ...deletions.map(checkedPath)];
  if (new Set(paths).size !== paths.length) throw new Error("A path can only be changed once per commit.");
  if (updates.length + deletions.length > 100) throw new Error("A single change can contain at most 100 files.");

  const { getRef, listTree, createBlob, createTree, createCommit, updateRef } =
    await import("../github/api.server");
  const ref = await getRef(token, fullName, branch);
  const current = await listTree(token, fullName, branch);
  const existingFiles = new Set(current.tree.filter((entry) => entry.type === "blob").map((entry) => entry.path));
  for (const path of deletions) {
    if (!existingFiles.has(path)) throw new Error(`Cannot delete "${path}": it does not exist on ${branch}.`);
  }
  for (const file of updates) {
    if (!existingFiles.has(file.path) && current.tree.some((entry) => entry.path === file.path && entry.type === "tree")) {
      throw new Error(`Cannot write "${file.path}": that path is a directory.`);
    }
  }

  const blobs: { path: string; sha: string }[] = [];
  for (let i = 0; i < updates.length; i += 6) {
    const created = await Promise.all(
      updates.slice(i, i + 6).map((file) =>
        createBlob(token, fullName, { content: file.content, encoding: "base64" }),
      ),
    );
    created.forEach((blob, offset) => blobs.push({ path: updates[i + offset]?.path ?? "", sha: blob.sha }));
  }
  const tree = await createTree(token, fullName, {
    base_tree: ref.object.sha,
    tree: [
      ...blobs.map((blob) => ({ path: blob.path, mode: "100644" as const, type: "blob" as const, sha: blob.sha })),
      ...deletions.map((path) => ({ path, mode: "100644" as const, type: "blob" as const, sha: null })),
    ],
  });
  const commit = await createCommit(token, fullName, {
    message,
    tree: tree.sha,
    parents: [ref.object.sha],
  });
  await updateRef(token, fullName, branch, { sha: commit.sha });
  return { sha: commit.sha, url: commit.html_url, branch, updated: updates.map((file) => file.path), deleted: deletions };
}

/**
 * Renames/moves files in one commit by pointing the new path at the existing
 * blob (no download/re-upload, so binaries and file modes survive intact)
 * and removing the old path. Refuses to overwrite an existing destination.
 */
async function moveFiles(
  token: string,
  fullName: string,
  branch: string,
  message: string,
  moves: { from: string; to: string }[],
) {
  checkedRepoName(fullName);
  const pairs = moves.map((m) => ({ from: checkedPath(m.from), to: checkedPath(m.to) }));
  const allPaths = pairs.flatMap((p) => [p.from, p.to]);
  if (new Set(allPaths).size !== allPaths.length) {
    throw new Error("Each path can appear only once across all moves.");
  }

  const { getRef, listTree, createTree, createCommit, updateRef } = await import("../github/api.server");
  const ref = await getRef(token, fullName, branch);
  const current = await listTree(token, fullName, branch);
  if (current.truncated) {
    throw new Error("This repository is too large to move files safely with this tool.");
  }
  const byPath = new Map(current.tree.map((entry) => [entry.path, entry]));

  const entries: GhNewTreeEntry[] = [];
  for (const { from, to } of pairs) {
    const source = byPath.get(from);
    if (!source || source.type !== "blob") throw new Error(`Cannot move "${from}": no such file on ${branch}.`);
    if (byPath.has(to)) throw new Error(`Cannot move to "${to}": that path already exists on ${branch}.`);
    entries.push({
      path: to,
      mode: (source.mode ?? "100644") as GhNewTreeEntry["mode"],
      type: "blob",
      sha: source.sha,
    });
    entries.push({ path: from, mode: "100644", type: "blob", sha: null });
  }

  const tree = await createTree(token, fullName, { base_tree: ref.object.sha, tree: entries });
  const commit = await createCommit(token, fullName, { message, tree: tree.sha, parents: [ref.object.sha] });
  await updateRef(token, fullName, branch, { sha: commit.sha });
  return { sha: commit.sha, url: commit.html_url, branch, moved: pairs };
}

const FAILING_CONCLUSIONS = ["failure", "timed_out", "cancelled", "action_required", "startup_failure"];

export const TOOLS = {
  list_accounts: {
    description: "List the GitHub accounts connected to Glit.",
    schema: z.object({}),
    async run(userId: string) {
      const db = await admin();
      const { data } = await db.from("github_accounts").select("login").eq("user_id", userId);
      return (data ?? []).map((r) => r.login);
    },
  },
  list_repos: {
    description: "List repositories the connected GitHub account can access.",
    schema: z.object({ account }),
    async run(userId: string, a: { account?: string }) {
      const { token } = await accountFor(userId, a.account);
      const { listAllRepos } = await import("../github/api.server");
      const repos = await listAllRepos(token);
      return repos.map((r) => ({
        full_name: r.full_name,
        private: r.private,
        default_branch: r.default_branch,
        description: r.description,
      }));
    },
  },
  list_branches: {
    description: "List branches of a repository.",
    schema: z.object({ account, repo }),
    async run(userId: string, a: { account?: string; repo: string }) {
      const { token } = await accountFor(userId, a.account);
      const { listBranches } = await import("../github/api.server");
      return (await listBranches(token, a.repo)).map((b) => b.name);
    },
  },
  list_files: {
    description: "List every file path in a repository branch.",
    schema: z.object({ account, repo, branch: z.string() }),
    async run(userId: string, a: { account?: string; repo: string; branch: string }) {
      const { token } = await accountFor(userId, a.account);
      const { listTree } = await import("../github/api.server");
      const tree = await listTree(token, a.repo, a.branch);
      return {
        truncated: tree.truncated,
        files: tree.tree.filter((e) => e.type === "blob").map((e) => e.path),
      };
    },
  },
  read_file: {
    description:
      'Read a file from a repository branch. Returns text by default; pass encoding "base64" to read images and other binary files without corrupting them.',
    schema: z.object({ account, repo, branch: z.string(), path: z.string(), encoding }),
    async run(
      userId: string,
      a: { account?: string; repo: string; branch: string; path: string; encoding: Encoding },
    ) {
      const { token } = await accountFor(userId, a.account);
      if (a.encoding === "base64") {
        const file = await readFileBase64(token, a.repo, a.branch, a.path);
        return file.content;
      }
      const { readFile } = await import("../github/api.server");
      const file = await readFile(token, a.repo, a.branch, a.path);
      return file.content;
    },
  },
  read_files: {
    description:
      'Read multiple files from a repository branch. Use this to pull a set of files into the AI tool in one request. Pass encoding "base64" to read binary files (images etc.) safely.',
    schema: z.object({
      account,
      repo,
      branch: z.string(),
      paths: z.array(z.string()).min(1).max(100),
      encoding,
    }),
    async run(
      userId: string,
      a: { account?: string; repo: string; branch: string; paths: string[]; encoding: Encoding },
    ) {
      const { token } = await accountFor(userId, a.account);
      const { readFile } = await import("../github/api.server");
      const files = await Promise.all(
        a.paths.map(async (path) => {
          if (a.encoding === "base64") {
            const file = await readFileBase64(token, a.repo, a.branch, path);
            return { path, encoding: "base64" as const, content: file.content };
          }
          const file = await readFile(token, a.repo, a.branch, path);
          return { path, content: file.content };
        }),
      );
      return { repo: a.repo, branch: a.branch, files };
    },
  },
  push_files: {
    description:
      'Create or update one or more files on a branch in a single commit. Each file\'s `content` is plain text by default. To push images or any other binary file (png, jpg, gif, webp, ico, woff2, pdf, zip…), base64-encode the bytes and set that file\'s `encoding` to "base64" (a data: URL prefix is accepted and stripped). For a small change to an existing file, prefer edit_file so the rest of the file is never resent.',
    schema: z.object({
      account,
      repo,
      branch: z.string(),
      message: z.string().describe("Commit message"),
      files: z
        .array(z.object({ path: z.string(), content: z.string(), encoding }))
        .min(1)
        .max(100),
    }),
    async run(
      userId: string,
      a: {
        account?: string;
        repo: string;
        branch: string;
        message: string;
        files: { path: string; content: string; encoding: Encoding }[];
      },
    ) {
      const { accountId } = await accountFor(userId, a.account);
      const { pushMultipleFiles } = await import("../github/push.server");
      const db = await admin();
      // pushMultipleFiles takes base64 for every file: text is encoded here,
      // binary arrives already base64 and is validated/normalized.
      const files = a.files.map((f) => ({
        path: f.path,
        content:
          f.encoding === "base64"
            ? normalizeBase64(f.content, f.path)
            : Buffer.from(f.content, "utf8").toString("base64"),
      }));
      const res = await pushMultipleFiles(db as never, userId, {
        accountId,
        fullName: a.repo,
        branch: a.branch,
        message: a.message,
        files,
      });
      return { commit: res.commitSha, url: res.commitUrl, files: res.paths };
    },
  },
  edit_file: {
    description:
      "Make small text edits to one existing file without resending it. Each edit replaces an exact `old_text` with `new_text`; `old_text` must match exactly once in the file (include surrounding lines to make it unique). Edits apply in order and land as one commit. Fails if the file changed on GitHub in the meantime.",
    schema: z.object({
      account,
      repo,
      branch: z.string(),
      path: z.string(),
      message: z.string().describe("Commit message"),
      edits: z
        .array(z.object({ old_text: z.string().min(1), new_text: z.string() }))
        .min(1)
        .max(50),
    }),
    async run(
      userId: string,
      a: {
        account?: string;
        repo: string;
        branch: string;
        path: string;
        message: string;
        edits: { old_text: string; new_text: string }[];
      },
    ) {
      const { token } = await accountFor(userId, a.account);
      const path = checkedPath(a.path);
      const { readFile, putFile } = await import("../github/api.server");
      const file = await readFile(token, a.repo, a.branch, path);
      if (file.size > 0 && file.content === "") {
        throw new Error(`"${path}" is too large to edit this way. Use push_files instead.`);
      }
      if (file.content.includes("\uFFFD")) {
        throw new Error(`"${path}" looks like a binary file. Use push_files with base64 instead.`);
      }

      let content = file.content;
      a.edits.forEach((edit, index) => {
        const parts = content.split(edit.old_text);
        if (parts.length === 1) throw new Error(`Edit ${index + 1}: old_text was not found in "${path}".`);
        if (parts.length > 2) {
          throw new Error(
            `Edit ${index + 1}: old_text matches ${parts.length - 1} times in "${path}". Add more surrounding text so it matches once.`,
          );
        }
        content = parts.join(edit.new_text);
      });
      if (content === file.content) throw new Error("These edits would not change the file.");

      // The blob sha makes GitHub reject the write if the file moved since it was read.
      const res = await putFile(token, a.repo, { path, branch: a.branch, message: a.message, content, sha: file.sha });
      return { commit: res.commit.sha, url: res.commit.html_url, path, edits: a.edits.length };
    },
  },
  delete_files: {
    description:
      "Delete one or more files from a branch in a single commit. Every path must exist. To delete a folder, list its files with list_files and pass every path.",
    schema: z.object({
      account,
      repo,
      branch: z.string(),
      message: z.string().describe("Commit message"),
      paths: z.array(z.string()).min(1).max(100),
    }),
    async run(
      userId: string,
      a: { account?: string; repo: string; branch: string; message: string; paths: string[] },
    ) {
      const { token } = await accountFor(userId, a.account);
      const res = await commitFileChanges(token, a.repo, a.branch, a.message, [], a.paths);
      return { commit: res.sha, url: res.url, deleted: res.deleted };
    },
  },
  move_files: {
    description:
      "Rename or move files in a single commit. Content is preserved exactly (including binaries). Fails if a source is missing or a destination already exists.",
    schema: z.object({
      account,
      repo,
      branch: z.string(),
      message: z.string().describe("Commit message"),
      moves: z.array(z.object({ from: z.string(), to: z.string() })).min(1).max(50),
    }),
    async run(
      userId: string,
      a: {
        account?: string;
        repo: string;
        branch: string;
        message: string;
        moves: { from: string; to: string }[];
      },
    ) {
      const { token } = await accountFor(userId, a.account);
      const res = await moveFiles(token, a.repo, a.branch, a.message, a.moves);
      return { commit: res.sha, url: res.url, moved: res.moved };
    },
  },
  list_commits: {
    description: "List recent commits on a branch, newest first, optionally only those touching one path. Each includes its commit URL.",
    schema: z.object({
      account,
      repo,
      branch: z.string(),
      path: z.string().optional().describe("Only commits that changed this file or folder"),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    async run(
      userId: string,
      a: { account?: string; repo: string; branch: string; path?: string; limit: number },
    ) {
      const { token } = await accountFor(userId, a.account);
      const { listCommits } = await import("../github/api.server");
      const commits = await listCommits(token, a.repo, a.branch, a.path, a.limit);
      return commits.map((c) => ({
        sha: c.sha,
        message: c.commit.message.split("\n")[0] ?? "",
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url,
      }));
    },
  },
  get_commit: {
    description:
      "Show one commit: message, author, URL and the files it changed (with per-file diffs unless include_patch is false). Large diffs are truncated.",
    schema: z.object({
      account,
      repo,
      sha: z.string().describe("Commit SHA (full or abbreviated) or branch name"),
      include_patch: z.boolean().default(true),
    }),
    async run(userId: string, a: { account?: string; repo: string; sha: string; include_patch: boolean }) {
      const { token } = await accountFor(userId, a.account);
      const { getCommitWithFiles } = await import("../github/api.server");
      const c = await getCommitWithFiles(token, a.repo, a.sha);
      const MAX_PATCH = 4000;
      return {
        sha: c.sha,
        message: c.commit.message,
        author: c.commit.author.name,
        date: c.commit.author.date,
        url: c.html_url,
        files: (c.files ?? []).slice(0, 100).map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
          ...(a.include_patch && f.patch
            ? { patch: f.patch.length > MAX_PATCH ? `${f.patch.slice(0, MAX_PATCH)}\n… (truncated)` : f.patch }
            : {}),
        })),
      };
    },
  },
  search_code: {
    description:
      "Search code in one repository (GitHub code search: default branch only, and new pushes can take a few minutes to be indexed). Returns matching file paths with text snippets.",
    schema: z.object({
      account,
      repo,
      query: z.string().min(1).describe("Search terms, e.g. Scholr or 'useAuth language:ts'"),
      limit: z.number().int().min(1).max(100).default(30),
    }),
    async run(userId: string, a: { account?: string; repo: string; query: string; limit: number }) {
      const { token } = await accountFor(userId, a.account);
      const { searchCode } = await import("../github/api.server");
      const res = await searchCode(token, a.repo, a.query, 1, a.limit);
      return {
        total: res.total_count,
        incomplete: res.incomplete_results,
        results: res.items.map((item) => ({
          path: item.path,
          url: item.html_url,
          snippets: (item.text_matches ?? []).map((m) => m.fragment),
        })),
      };
    },
  },
  get_ci_status: {
    description:
      "Check whether CI is passing for a branch or commit: overall state (passing / failing / pending / none), check runs, commit statuses, and recent workflow runs when given a branch.",
    schema: z.object({
      account,
      repo,
      ref: z.string().describe("Branch name or commit SHA"),
    }),
    async run(userId: string, a: { account?: string; repo: string; ref: string }) {
      const { token } = await accountFor(userId, a.account);
      const { listCheckRuns, getCombinedStatus, listWorkflowRuns } = await import("../github/api.server");
      const isSha = /^[0-9a-f]{7,40}$/i.test(a.ref);
      const [checks, combined, runs] = await Promise.all([
        listCheckRuns(token, a.repo, a.ref),
        getCombinedStatus(token, a.repo, a.ref),
        isSha ? Promise.resolve(null) : listWorkflowRuns(token, a.repo, a.ref, 5),
      ]);

      const anyFailing =
        checks.check_runs.some((c) => c.status === "completed" && FAILING_CONCLUSIONS.includes(c.conclusion ?? "")) ||
        (combined.total_count > 0 && (combined.state === "failure" || combined.state === "error"));
      const anyPending =
        checks.check_runs.some((c) => c.status !== "completed") ||
        (combined.total_count > 0 && combined.state === "pending");
      const nothing = checks.total_count === 0 && combined.total_count === 0;
      const state = anyFailing ? "failing" : anyPending ? "pending" : nothing ? "none" : "passing";

      return {
        state,
        check_runs: checks.check_runs.map((c) => ({
          name: c.name,
          status: c.status,
          conclusion: c.conclusion,
          url: c.html_url,
          summary: c.output?.summary ?? null,
        })),
        statuses: combined.statuses.map((s) => ({
          context: s.context,
          state: s.state,
          description: s.description,
          url: s.target_url,
        })),
        workflow_runs: (runs?.workflow_runs ?? []).map((r) => ({
          name: r.name,
          status: r.status,
          conclusion: r.conclusion,
          sha: r.head_sha,
          url: r.html_url,
          created_at: r.created_at,
        })),
      };
    },
  },
  list_pull_requests: {
    description: "List pull requests in a repository, most recently updated first.",
    schema: z.object({
      account,
      repo,
      state: z.enum(["open", "closed", "all"]).default("open"),
      limit: z.number().int().min(1).max(50).default(10),
    }),
    async run(
      userId: string,
      a: { account?: string; repo: string; state: "open" | "closed" | "all"; limit: number },
    ) {
      const { token } = await accountFor(userId, a.account);
      const { listPullRequests } = await import("../github/api.server");
      const prs = await listPullRequests(token, a.repo, a.state, a.limit);
      return prs.map((p) => ({
        number: p.number,
        title: p.title,
        state: p.state,
        draft: p.draft,
        head: p.head.ref,
        base: p.base.ref,
        url: p.html_url,
      }));
    },
  },
  get_pull_request: {
    description: "Show one pull request: details, mergeability and the files it changes.",
    schema: z.object({ account, repo, number: z.number().int().min(1) }),
    async run(userId: string, a: { account?: string; repo: string; number: number }) {
      const { token } = await accountFor(userId, a.account);
      const { getPullRequest, listPullRequestFiles } = await import("../github/api.server");
      const [pr, files] = await Promise.all([
        getPullRequest(token, a.repo, a.number),
        listPullRequestFiles(token, a.repo, a.number),
      ]);
      return {
        number: pr.number,
        title: pr.title,
        body: pr.body,
        state: pr.state,
        draft: pr.draft,
        merged: pr.merged,
        // null means GitHub is still computing it; ask again in a few seconds.
        mergeable: pr.mergeable,
        head: pr.head.ref,
        base: pr.base.ref,
        url: pr.html_url,
        files: files.map((f) => ({
          filename: f.filename,
          status: f.status,
          additions: f.additions,
          deletions: f.deletions,
        })),
      };
    },
  },
  create_pull_request: {
    description:
      "Open a pull request from `head` (a branch) into `base`. Safer than pushing straight to the default branch: push to a new branch with create_branch + push_files, then open a PR.",
    schema: z.object({
      account,
      repo,
      title: z.string().min(1),
      head: z.string().describe("Branch containing the changes"),
      base: z.string().describe("Branch to merge into, e.g. main"),
      body: z.string().optional(),
      draft: z.boolean().default(false),
    }),
    async run(
      userId: string,
      a: {
        account?: string;
        repo: string;
        title: string;
        head: string;
        base: string;
        body?: string;
        draft: boolean;
      },
    ) {
      const { token } = await accountFor(userId, a.account);
      const { createPullRequest } = await import("../github/api.server");
      const pr = await createPullRequest(token, a.repo, {
        title: a.title,
        head: a.head,
        base: a.base,
        draft: a.draft,
        ...(a.body ? { body: a.body } : {}),
      });
      return { number: pr.number, url: pr.html_url, state: pr.state, draft: pr.draft };
    },
  },
  merge_pull_request: {
    description:
      "Merge an open pull request. This changes the base branch and cannot be undone from here: only call it when the user has asked to merge, and check get_pull_request and get_ci_status first.",
    schema: z.object({
      account,
      repo,
      number: z.number().int().min(1),
      method: z.enum(["merge", "squash", "rebase"]).default("squash"),
    }),
    async run(
      userId: string,
      a: { account?: string; repo: string; number: number; method: "merge" | "squash" | "rebase" },
    ) {
      const { token } = await accountFor(userId, a.account);
      const { mergePullRequest } = await import("../github/api.server");
      const res = await mergePullRequest(token, a.repo, a.number, a.method);
      return { merged: res.merged, commit: res.sha, message: res.message };
    },
  },
  create_branch: {
    description: "Create a new branch from an existing branch.",
    schema: z.object({ account, repo, name: z.string(), from: z.string() }),
    async run(userId: string, a: { account?: string; repo: string; name: string; from: string }) {
      const { token } = await accountFor(userId, a.account);
      const { getRef, ghFetch } = await import("../github/api.server");
      const base = await getRef(token, a.repo, a.from);
      await ghFetch(token, `/repos/${a.repo}/git/refs`, {
        method: "POST",
        body: JSON.stringify({ ref: `refs/heads/${a.name}`, sha: base.object.sha }),
      });
      return { branch: a.name, from: a.from };
    },
  },
  create_repo: {
    description: "Create a new repository on the connected GitHub account.",
    schema: z.object({
      account,
      name: z.string(),
      description: z.string().optional(),
      private: z.boolean().default(true),
    }),
    async run(
      userId: string,
      a: { account?: string; name: string; description?: string; private: boolean },
    ) {
      const { token } = await accountFor(userId, a.account);
      const { createRepo } = await import("../github/api.server");
      const r = await createRepo(token, {
        name: a.name,
        description: a.description,
        isPrivate: a.private,
        autoInit: true,
      });
      return { full_name: r.full_name, default_branch: r.default_branch, url: r.html_url };
    },
  },
} as const;

export type ToolName = keyof typeof TOOLS;
