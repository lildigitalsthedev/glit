import { z } from "zod";

/**
 * Tools exposed to external AI tools over MCP. Every call is scoped to the
 * key's owner: GitHub accounts are looked up with an explicit user_id filter
 * before any token is decrypted.
 */
async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function accountFor(userId: string, login?: string) {
  const db = await admin();
  let q = db.from("github_accounts").select("id, login").eq("user_id", userId);
  if (login) q = q.ilike("login", login);
  const { data, error } = await q.order("created_at", { ascending: true }).limit(1);
  if (error) throw new Error(error.message);
  const row = data?.[0];
  if (!row) {
    throw new Error(
      login
        ? `No connected GitHub account named "${login}".`
        : "No GitHub account connected. Connect one in GitPush first.",
    );
  }
  const { loadAccountTokenAdmin } = await import("../github/tokens.server");
  const { token } = await loadAccountTokenAdmin(row.id as string);
  return { accountId: row.id as string, login: row.login as string, token };
}

const account = z.string().optional().describe("GitHub login to use (defaults to the first connected account)");
const repo = z.string().describe('Repository full name, e.g. "octocat/hello-world"');

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

export const TOOLS = {
  list_accounts: {
    description: "List the GitHub accounts connected to GitPush.",
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
      'Create or update one or more files on a branch in a single commit. Each file\'s `content` is plain text by default. To push images or any other binary file (png, jpg, gif, webp, ico, woff2, pdf, zip…), base64-encode the bytes and set that file\'s `encoding` to "base64" (a data: URL prefix is accepted and stripped).',
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
