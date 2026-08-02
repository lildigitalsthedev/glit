import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface RepoCard {
  id: number;
  name: string;
  fullName: string;
  owner: string;
  ownerAvatar: string;
  isPrivate: boolean;
  description: string | null;
  defaultBranch: string;
  updatedAt: string;
  canPush: boolean;
}

export const listRepos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data, context }): Promise<RepoCard[]> => {
    const { loadAccountToken } = await import("./github/tokens.server");
    const { listAllRepos } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    const repos = await listAllRepos(token);
    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      ownerAvatar: repo.owner.avatar_url,
      isPrivate: repo.private,
      description: repo.description,
      defaultBranch: repo.default_branch,
      updatedAt: repo.pushed_at ?? repo.updated_at,
      canPush: repo.permissions?.push ?? false,
    }));
  });

export const listRepoBranches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string }) => data)
  .handler(async ({ data, context }) => {
    const { loadAccountToken } = await import("./github/tokens.server");
    const { listBranches } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    const branches = await listBranches(token, data.fullName);
    return branches.map((b) => ({ name: b.name, protected: b.protected }));
  });

export interface TreeNode {
  path: string;
  type: "blob" | "tree";
  size: number;
}

export const listRepoTree = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string; branch: string }) => data)
  .handler(async ({ data, context }) => {
    const { loadAccountToken } = await import("./github/tokens.server");
    const { listTree } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    const tree = await listTree(token, data.fullName, data.branch);
    const nodes: TreeNode[] = tree.tree
      .filter((entry) => entry.type === "blob" || entry.type === "tree")
      .map((entry) => ({
        path: entry.path,
        type: entry.type as "blob" | "tree",
        size: entry.size ?? 0,
      }));
    return { nodes, truncated: tree.truncated };
  });

export const readRepoFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string; branch: string; path: string }) => data)
  .handler(async ({ data, context }) => {
    const { loadAccountToken } = await import("./github/tokens.server");
    const { readFile } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    return readFile(token, data.fullName, data.branch, data.path);
  });

export const listRepoCommits = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string; branch: string; path?: string }) => data)
  .handler(async ({ data, context }) => {
    const { loadAccountToken } = await import("./github/tokens.server");
    const { listCommits } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    const commits = await listCommits(token, data.fullName, data.branch, data.path);
    return commits.map((c) => ({
      sha: c.sha.slice(0, 7),
      url: c.html_url,
      message: c.commit.message.split("\n")[0] ?? "",
      author: c.commit.author.name,
      date: c.commit.author.date,
    }));
  });

export const pushFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      accountId: string;
      fullName: string;
      branch: string;
      path: string;
      content: string;
      message: string;
      description?: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { pushSingleFile } = await import("./github/push.server");
    return pushSingleFile(context.supabase, context.userId, data);
  });