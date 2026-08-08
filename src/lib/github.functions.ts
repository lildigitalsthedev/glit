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
      description?: string | undefined;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    await requireActiveWorkspaceCapability(context.userId, "repos:push");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_write", limit: 60, windowSeconds: 300 });
    const { pushSingleFile } = await import("./github/push.server");
    return pushSingleFile(context.supabase, context.userId, data);
  });

export const pushFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      accountId: string;
      fullName: string;
      branch: string;
      message: string;
      description?: string | undefined;
      files: { path: string; content: string }[];
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    await requireActiveWorkspaceCapability(context.userId, "repos:push");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_write", limit: 60, windowSeconds: 300 });
    const { pushMultipleFiles } = await import("./github/push.server");
    return pushMultipleFiles(context.supabase, context.userId, data);
  });

export const deleteFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      accountId: string;
      fullName: string;
      branch: string;
      path: string;
      message: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    await requireActiveWorkspaceCapability(context.userId, "repos:push");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_write", limit: 60, windowSeconds: 300 });
    const { deleteSingleFile } = await import("./github/push.server");
    return deleteSingleFile(context.supabase, context.userId, data);
  });

export const deleteFolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      accountId: string;
      fullName: string;
      branch: string;
      path: string;
      message: string;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    await requireActiveWorkspaceCapability(context.userId, "repos:push");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_write", limit: 60, windowSeconds: 300 });
    const { deleteFolderRecursive } = await import("./github/push.server");
    return deleteFolderRecursive(context.supabase, context.userId, data);
  });

export const createRepository = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      accountId: string;
      name: string;
      description?: string | undefined;
      isPrivate: boolean;
      autoInit: boolean;
      gitignoreTemplate?: string | undefined;
      licenseTemplate?: string | undefined;
    }) => data,
  )
  .handler(async ({ data, context }): Promise<RepoCard> => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    await requireActiveWorkspaceCapability(context.userId, "repos:create");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_repo_admin", limit: 10, windowSeconds: 3600 });
    const name = data.name.trim();
    if (!name) throw new Error("Repository name cannot be empty.");
    if (name.length > 100) throw new Error("Repository names can't be longer than 100 characters.");
    if (name === "." || name === "..") throw new Error("That name isn't allowed by GitHub.");
    if (!/^[A-Za-z0-9._-]+$/.test(name)) {
      throw new Error("Only letters, numbers, hyphens, underscores and periods are allowed.");
    }
    const { loadAccountToken } = await import("./github/tokens.server");
    const { createRepo } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    const repo = await createRepo(token, {
      name,
      description: data.description?.trim() || undefined,
      isPrivate: data.isPrivate,
      autoInit: data.autoInit,
      gitignoreTemplate: data.gitignoreTemplate || undefined,
      licenseTemplate: data.licenseTemplate || undefined,
    });
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      ownerAvatar: repo.owner.avatar_url,
      isPrivate: repo.private,
      description: repo.description,
      defaultBranch: repo.default_branch,
      updatedAt: repo.pushed_at ?? repo.updated_at,
      canPush: repo.permissions?.push ?? true,
    };
  });

export interface RepoDetails {
  fullName: string;
  owner: string;
  ownerAvatar: string;
  defaultBranch: string;
  isPrivate: boolean;
  visibility: string;
  sizeKb: number;
  updatedAt: string;
  pushedAt: string | null;
  htmlUrl: string;
}

/**
 * Full repository metadata straight from GitHub's single-repo endpoint —
 * owner, visibility, size, timestamps — that the list endpoint used for the
 * dashboard grid doesn't bother returning. Powers the "Repository info"
 * panel in the workspace.
 */
export const getRepoDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string }) => data)
  .handler(async ({ data, context }): Promise<RepoDetails> => {
    const { loadAccountToken } = await import("./github/tokens.server");
    const { getRepo } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    const repo = await getRepo(token, data.fullName);
    return {
      fullName: repo.full_name,
      owner: repo.owner.login,
      ownerAvatar: repo.owner.avatar_url,
      defaultBranch: repo.default_branch,
      isPrivate: repo.private,
      visibility: repo.visibility ?? (repo.private ? "private" : "public"),
      sizeKb: repo.size ?? 0,
      updatedAt: repo.pushed_at ?? repo.updated_at,
      pushedAt: repo.pushed_at,
      htmlUrl: repo.html_url ?? `https://github.com/${repo.full_name}`,
    };
  });

export interface RenamedRepo {
  id: number;
  name: string;
  fullName: string;
  defaultBranch: string;
}

export const renameRepository = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string; newName: string }) => data)
  .handler(async ({ data, context }): Promise<RenamedRepo> => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    await requireActiveWorkspaceCapability(context.userId, "repos:manage");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_repo_admin", limit: 10, windowSeconds: 3600 });
    const { loadAccountToken } = await import("./github/tokens.server");
    const { renameRepo } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    const repo = await renameRepo(token, data.fullName, data.newName);
    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
    };
  });

export interface RepoZipResult {
  filename: string;
  base64: string;
}

export const downloadRepoZip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string; branch: string }) => data)
  .handler(async ({ data, context }): Promise<RepoZipResult> => {
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_zip", limit: 10, windowSeconds: 600 });
    const { loadAccountToken } = await import("./github/tokens.server");
    const { downloadZipball } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    const { buffer } = await downloadZipball(token, data.fullName, data.branch);
    const repoName = data.fullName.split("/").pop() ?? data.fullName;
    const safeBranch = data.branch.replace(/[^a-zA-Z0-9._-]+/g, "-");
    return {
      filename: `${repoName}-${safeBranch}.zip`,
      base64: buffer.toString("base64"),
    };
  });