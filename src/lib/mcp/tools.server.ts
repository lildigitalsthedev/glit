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
    description: "Read a text file from a repository branch.",
    schema: z.object({ account, repo, branch: z.string(), path: z.string() }),
    async run(userId: string, a: { account?: string; repo: string; branch: string; path: string }) {
      const { token } = await accountFor(userId, a.account);
      const { readFile } = await import("../github/api.server");
      const file = await readFile(token, a.repo, a.branch, a.path);
      return file.content;
    },
  },
  read_files: {
    description:
      "Read multiple text files from a repository branch. Use this to pull a set of files into the AI tool in one request.",
    schema: z.object({
      account,
      repo,
      branch: z.string(),
      paths: z.array(z.string()).min(1).max(100),
    }),
    async run(
      userId: string,
      a: { account?: string; repo: string; branch: string; paths: string[] },
    ) {
      const { token } = await accountFor(userId, a.account);
      const { readFile } = await import("../github/api.server");
      const files = await Promise.all(
        a.paths.map(async (path) => {
          const file = await readFile(token, a.repo, a.branch, path);
          return { path, content: file.content };
        }),
      );
      return { repo: a.repo, branch: a.branch, files };
    },
  },
  push_files: {
    description:
      "Create or update one or more files on a branch in a single commit. Content is plain text.",
    schema: z.object({
      account,
      repo,
      branch: z.string(),
      message: z.string().describe("Commit message"),
      files: z
        .array(z.object({ path: z.string(), content: z.string() }))
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
        files: { path: string; content: string }[];
      },
    ) {
      const { accountId } = await accountFor(userId, a.account);
      const { pushMultipleFiles } = await import("../github/push.server");
      const db = await admin();
      const res = await pushMultipleFiles(db as never, userId, {
        accountId,
        fullName: a.repo,
        branch: a.branch,
        message: a.message,
        files: a.files.map((f) => ({
          path: f.path,
          content: Buffer.from(f.content, "utf8").toString("base64"),
        })),
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
