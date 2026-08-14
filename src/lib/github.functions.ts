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
  /** The GitHub connection this card's data was fetched with. Always present so quick actions (push/rename/archive/favorite) know which token to use, even on the shared workspace dashboard where cards can span different members' connections. */
  accountId: string;
  language: string | null;
  archived: boolean;
  htmlUrl: string | null;
  /** Only populated on the shared workspace dashboard (Feature 4) — workspace members who've opened/pushed this repo through GitPush, not raw GitHub commit history. */
  contributors?: { userId: string; name: string; avatarUrl: string | null }[];
  addedBy?: { userId: string; name: string; avatarUrl: string | null } | null;
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
      accountId: data.accountId,
      language: repo.language ?? null,
      archived: repo.archived ?? false,
      htmlUrl: repo.html_url ?? null,
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
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, "repos:push");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_write", limit: 60, windowSeconds: 300 });
    const { pushSingleFile } = await import("./github/push.server");
    const result = await pushSingleFile(context.supabase, context.userId, data);

    const { logActivity } = await import("./workspaces/activity.server");
    await logActivity({
      workspaceId,
      actorId: context.userId,
      action: "push_completed",
      repoFullName: data.fullName,
      summary: `Pushed ${data.path} to ${data.fullName}`,
      metadata: { branch: data.branch, path: data.path, commitSha: result.commitSha },
    });

    const { notifyUser } = await import("./notifications/store.server");
    await notifyUser(context.userId, {
      type: "push_completed",
      title: "Push completed",
      body: `Pushed ${data.path} to ${data.fullName}.`,
      workspaceId,
      repoFullName: data.fullName,
      actorId: context.userId,
      // `pushId` lets tapping this notification offer an immediate "Undo"
      // (see undoPush below) the same way the push toast does.
      metadata: { branch: data.branch, path: data.path, commitSha: result.commitSha, pushId: result.pushId },
    });

    return result;
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
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, "repos:push");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_write", limit: 60, windowSeconds: 300 });
    const { pushMultipleFiles } = await import("./github/push.server");
    const result = await pushMultipleFiles(context.supabase, context.userId, data);

    const { logActivity } = await import("./workspaces/activity.server");
    await logActivity({
      workspaceId,
      actorId: context.userId,
      action: "push_completed",
      repoFullName: data.fullName,
      summary: `Pushed ${result.filesPushed} file${result.filesPushed === 1 ? "" : "s"} to ${data.fullName}`,
      metadata: { branch: data.branch, filesPushed: result.filesPushed, commitSha: result.commitSha },
    });

    const { notifyUser } = await import("./notifications/store.server");
    await notifyUser(context.userId, {
      type: "push_completed",
      title: "Push completed",
      body: `Pushed ${result.filesPushed} file${result.filesPushed === 1 ? "" : "s"} to ${data.fullName}.`,
      workspaceId,
      repoFullName: data.fullName,
      actorId: context.userId,
      metadata: {
        branch: data.branch,
        filesPushed: result.filesPushed,
        commitSha: result.commitSha,
        pushId: result.pushId,
      },
    });

    return result;
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
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, "repos:create");
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

    // Feature 10: Workspace Settings → Default branch. GitHub's create-repo
    // endpoint has no field for the initial branch name — the only way to
    // get a custom one is to rename after the fact, and only once a first
    // commit actually exists to point a ref at (auto_init or a gitignore/
    // license template forces that; createRepo already accounts for this).
    // Best-effort: a rename failing shouldn't fail the whole repo creation,
    // since the repo itself already exists and is otherwise usable.
    const hadInitialCommit = data.autoInit || Boolean(data.gitignoreTemplate) || Boolean(data.licenseTemplate);
    let finalDefaultBranch = repo.default_branch;
    if (hadInitialCommit) {
      try {
        const { getWorkspace } = await import("./workspaces/store.server");
        const workspace = await getWorkspace(context.userId, workspaceId);
        const desired = workspace.defaultBranch?.trim();
        if (desired && desired !== repo.default_branch) {
          const { getRef, createRef, setDefaultBranch, deleteRef } = await import("./github/api.server");
          const head = await getRef(token, repo.full_name, repo.default_branch);
          await createRef(token, repo.full_name, desired, head.object.sha);
          await setDefaultBranch(token, repo.full_name, desired);
          await deleteRef(token, repo.full_name, repo.default_branch);
          finalDefaultBranch = desired;
        }
      } catch (err) {
        console.error(`[createRepository] default-branch rename failed for ${repo.full_name}:`, err);
      }
    }

    const { logActivity } = await import("./workspaces/activity.server");
    await logActivity({
      workspaceId,
      actorId: context.userId,
      action: "repository_created",
      repoFullName: repo.full_name,
      summary: `Created repository ${repo.full_name}`,
    });

    return {
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      owner: repo.owner.login,
      ownerAvatar: repo.owner.avatar_url,
      isPrivate: repo.private,
      description: repo.description,
      defaultBranch: finalDefaultBranch,
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

export const archiveRepository = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string; archived: boolean }) => data)
  .handler(async ({ data, context }): Promise<{ fullName: string; archived: boolean }> => {
    const { requireActiveWorkspaceCapability, listWorkspaceMemberIds } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, "repos:manage");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_repo_admin", limit: 10, windowSeconds: 3600 });
    const { loadAccountToken } = await import("./github/tokens.server");
    const { setRepoArchived } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    const repo = await setRepoArchived(token, data.fullName, data.archived);
    const archived = repo.archived ?? data.archived;

    // Only the "archived" direction is notification-worthy — unarchiving
    // is just restoring visibility, not something the rest of the team
    // needs an alert about.
    if (archived) {
      const { notifyUsers } = await import("./notifications/store.server");
      const otherMemberIds = await listWorkspaceMemberIds(workspaceId, context.userId);
      await notifyUsers(otherMemberIds, {
        type: "repository_archived",
        title: "Repository archived",
        body: `${repo.full_name} was archived.`,
        workspaceId,
        repoFullName: repo.full_name,
        actorId: context.userId,
      });
    }

    return { fullName: repo.full_name, archived };
  });

export const setRepositoryVisibility = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; fullName: string; isPrivate: boolean }) => data)
  .handler(async ({ data, context }): Promise<{ fullName: string; isPrivate: boolean }> => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    await requireActiveWorkspaceCapability(context.userId, "repos:manage");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_repo_admin", limit: 10, windowSeconds: 3600 });
    const { loadAccountToken } = await import("./github/tokens.server");
    const { setRepoVisibility } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, data.accountId);
    const repo = await setRepoVisibility(token, data.fullName, data.isPrivate);
    return { fullName: repo.full_name, isPrivate: repo.private };
  });

/**
 * Undoes the most recent push/delete recorded in `recent_pushes` — either
 * from the "Undo" action on the push toast, or by tapping the matching
 * push notification. Rather than trusting anything the client says about
 * *what* to undo, this only takes a `pushId` and looks the rest up itself:
 * which repo/branch/commit, and whether it's still safe to undo at all.
 *
 * "Undo" here means moving the branch ref back to that commit's parent —
 * the same thing `git reset --hard HEAD~1 && git push --force` would do.
 * That's only safe if the pushed commit is still the tip of the branch
 * (nobody has pushed since), so this refuses rather than guessing if the
 * ref has moved, and refuses outright past a short time window so an old
 * "Undo" button can't surprise-rewrite history much later.
 */
export const undoPush = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { pushId: string }) => data)
  .handler(async ({ data, context }): Promise<{ fullName: string; branch: string; revertedTo: string }> => {
    const { requireActiveWorkspaceCapability } = await import("./workspaces/store.server");
    const { workspaceId } = await requireActiveWorkspaceCapability(context.userId, "repos:push");
    const { assertRateLimit } = await import("./rate-limit.server");
    await assertRateLimit(context.userId, { bucket: "github_write", limit: 60, windowSeconds: 300 });

    const { data: row, error } = await context.supabase
      .from("recent_pushes")
      .select("id, account_id, full_name, branch, commit_sha, status, undone_at, created_at")
      .eq("id", data.pushId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("That push couldn't be found.");
    if (row.status !== "success" || !row.commit_sha) throw new Error("That push can't be undone.");
    if (row.undone_at) throw new Error("That push was already undone.");
    if (!row.account_id) throw new Error("That push's GitHub connection is no longer available.");

    const UNDO_WINDOW_MS = 15 * 60 * 1000;
    const pushedAt = new Date(row.created_at as string).getTime();
    if (Date.now() - pushedAt > UNDO_WINDOW_MS) {
      throw new Error("This push is too old to undo — undo is only available for 15 minutes after pushing.");
    }

    const fullName = row.full_name as string;
    const branch = row.branch as string;
    const commitSha = row.commit_sha as string;

    const { loadAccountToken } = await import("./github/tokens.server");
    const { getRef, getCommit, updateRef } = await import("./github/api.server");
    const { token } = await loadAccountToken(context.supabase, row.account_id as string);

    const ref = await getRef(token, fullName, branch);
    if (ref.object.sha !== commitSha) {
      throw new Error("Someone has pushed to this branch since — undo is no longer safe.");
    }

    const commit = await getCommit(token, fullName, commitSha);
    const parent = commit.parents[0];
    if (!parent) {
      throw new Error("Can't undo the very first commit on a branch.");
    }

    await updateRef(token, fullName, branch, { sha: parent.sha, force: true });

    await context.supabase
      .from("recent_pushes")
      .update({ undone_at: new Date().toISOString() })
      .eq("id", data.pushId);

    const { logActivity } = await import("./workspaces/activity.server");
    await logActivity({
      workspaceId,
      actorId: context.userId,
      action: "push_undone",
      repoFullName: fullName,
      summary: `Undid the last push to ${fullName} (${branch})`,
      metadata: { branch, revertedCommit: commitSha, revertedTo: parent.sha },
    });

    return { fullName, branch, revertedTo: parent.sha.slice(0, 7) };
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

/**
 * The Shared Repository Dashboard (Feature 4). Resolves the caller's active
 * workspace server-side, aggregates every member's `repo_prefs` rows for it,
 * then fetches live GitHub metadata one call per distinct connecting
 * account (not one call per repo) to keep this bounded for larger teams.
 * Repos whose connecting account's token has since been revoked, or that
 * were deleted/renamed on GitHub since anyone last touched them here, are
 * silently skipped rather than failing the whole dashboard.
 */
export const listWorkspaceRepoCards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RepoCard[]> => {
    const { getActiveWorkspaceId, requireCapability } = await import("./workspaces/store.server");
    const workspaceId = await getActiveWorkspaceId(context.userId);
    await requireCapability(context.userId, workspaceId, "workspace:view");

    const { listWorkspaceRepoRefs } = await import("./workspaces/repos.server");
    const refs = await listWorkspaceRepoRefs(workspaceId, context.userId);
    if (refs.length === 0) return [];

    const byAccount = new Map<string, typeof refs>();
    for (const ref of refs) {
      const bucket = byAccount.get(ref.accountId);
      if (bucket) bucket.push(ref);
      else byAccount.set(ref.accountId, [ref]);
    }

    const { loadAccountToken } = await import("./github/tokens.server");
    const { listAllRepos } = await import("./github/api.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const cards: RepoCard[] = [];
    // Bound worst-case GitHub API usage for very large teams — beyond this,
    // members should narrow down with search rather than the dashboard
    // eagerly fetching dozens of accounts' full repo lists.
    const accountEntries = Array.from(byAccount.entries()).slice(0, 25);

    for (const [accountId, group] of accountEntries) {
      let ghRepos;
      try {
        const { token } = await loadAccountToken(supabaseAdmin, accountId);
        ghRepos = await listAllRepos(token);
      } catch {
        continue; // that connection's token was revoked/broken — skip its repos
      }
      const byFullName = new Map(ghRepos.map((r) => [r.full_name, r]));
      for (const ref of group) {
        const repo = byFullName.get(ref.fullName);
        if (!repo) continue; // renamed/deleted/no longer visible to that token
        cards.push({
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
          accountId,
          language: repo.language ?? null,
          archived: repo.archived ?? false,
          htmlUrl: repo.html_url ?? null,
          contributors: ref.contributors,
          addedBy: ref.addedBy,
        });
      }
    }
    return cards;
  });