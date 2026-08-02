import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface Preferences {
  theme: string;
  editorFontSize: number;
  tabWidth: number;
  wordWrap: boolean;
  autoSave: boolean;
  notifications: boolean;
  defaultBranch: string | null;
  defaultFolder: string | null;
  activeAccountId: string | null;
  activeRepo: string | null;
  /** "free" or "pro" — see GitPush Pro. Changed via `setPlan`, not `updatePreferences`. */
  plan: "free" | "pro";
}

export const getPreferences = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Preferences> => {
    const { data, error } = await context.supabase
      .from("user_preferences")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) {
      await context.supabase.from("user_preferences").insert({ user_id: context.userId });
      return {
        theme: "dark",
        editorFontSize: 13,
        tabWidth: 2,
        wordWrap: true,
        autoSave: true,
        notifications: true,
        defaultBranch: null,
        defaultFolder: null,
        activeAccountId: null,
        activeRepo: null,
        plan: "free",
      };
    }
    return {
      theme: data.theme as string,
      editorFontSize: data.editor_font_size as number,
      tabWidth: data.tab_width as number,
      wordWrap: data.word_wrap as boolean,
      autoSave: data.auto_save as boolean,
      notifications: data.notifications as boolean,
      defaultBranch: data.default_branch as string | null,
      defaultFolder: data.default_folder as string | null,
      activeAccountId: data.active_account_id as string | null,
      activeRepo: data.active_repo as string | null,
      plan: (data.plan as "free" | "pro" | undefined) ?? "free",
    };
  });

export const updatePreferences = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Partial<Omit<Preferences, "plan">>) => data)
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = { user_id: context.userId };
    if (data.theme !== undefined) patch["theme"] = data.theme;
    if (data.editorFontSize !== undefined) patch["editor_font_size"] = data.editorFontSize;
    if (data.tabWidth !== undefined) patch["tab_width"] = data.tabWidth;
    if (data.wordWrap !== undefined) patch["word_wrap"] = data.wordWrap;
    if (data.autoSave !== undefined) patch["auto_save"] = data.autoSave;
    if (data.notifications !== undefined) patch["notifications"] = data.notifications;
    if (data.defaultBranch !== undefined) patch["default_branch"] = data.defaultBranch;
    if (data.defaultFolder !== undefined) patch["default_folder"] = data.defaultFolder;
    if (data.activeAccountId !== undefined) patch["active_account_id"] = data.activeAccountId;
    if (data.activeRepo !== undefined) patch["active_repo"] = data.activeRepo;
    const { error } = await context.supabase
      .from("user_preferences")
      .upsert(patch as never, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Switches the user's plan between "free" and "pro".
 *
 * NOTE: this flips the flag directly — there's no payment processor wired
 * up yet. Before shipping GitPush Pro for real, this should sit behind an
 * actual checkout (e.g. a Stripe Checkout session + webhook that calls this
 * same upsert on payment confirmation) rather than being callable directly
 * from the client like it is today.
 */
export const setPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { plan: "free" | "pro" }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("user_preferences").upsert(
      {
        user_id: context.userId,
        plan: data.plan,
        plan_updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "user_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, plan: data.plan };
  });

export interface RepoPref {
  fullName: string;
  isFavorite: boolean;
  preferredBranch: string | null;
  workingFolder: string | null;
  lastUsedAt: string;
}

export const listRepoPrefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<RepoPref[]> => {
    const { data, error } = await context.supabase
      .from("repo_prefs")
      .select("full_name, is_favorite, preferred_branch, working_folder, last_used_at")
      .order("last_used_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      fullName: row.full_name as string,
      isFavorite: row.is_favorite as boolean,
      preferredBranch: row.preferred_branch as string | null,
      workingFolder: row.working_folder as string | null,
      lastUsedAt: row.last_used_at as string,
    }));
  });

export const saveRepoPref = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      fullName: string;
      accountId?: string;
      isFavorite?: boolean;
      preferredBranch?: string;
      workingFolder?: string;
      touch?: boolean;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, unknown> = {
      user_id: context.userId,
      full_name: data.fullName,
    };
    if (data.accountId !== undefined) patch["account_id"] = data.accountId;
    if (data.isFavorite !== undefined) patch["is_favorite"] = data.isFavorite;
    if (data.preferredBranch !== undefined) patch["preferred_branch"] = data.preferredBranch;
    if (data.workingFolder !== undefined) patch["working_folder"] = data.workingFolder;
    if (data.touch) patch["last_used_at"] = new Date().toISOString();
    const { error } = await context.supabase
      .from("repo_prefs")
      .upsert(patch as never, { onConflict: "user_id,full_name" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface PathPref {
  fullName: string | null;
  path: string;
  isFavorite: boolean;
  useCount: number;
}

export const listPaths = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PathPref[]> => {
    const { data, error } = await context.supabase
      .from("favorite_paths")
      .select("full_name, path, is_favorite, use_count")
      .order("last_used_at", { ascending: false })
      .limit(40);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      fullName: row.full_name as string | null,
      path: row.path as string,
      isFavorite: row.is_favorite as boolean,
      useCount: row.use_count as number,
    }));
  });

export const savePath = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fullName: string; path: string; isFavorite?: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("favorite_paths")
      .select("id, use_count, is_favorite")
      .eq("full_name", data.fullName)
      .eq("path", data.path)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase
        .from("favorite_paths")
        .update({
          use_count: (existing.use_count as number) + 1,
          is_favorite: data.isFavorite ?? (existing.is_favorite as boolean),
          last_used_at: new Date().toISOString(),
        })
        .eq("id", existing.id as string);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await context.supabase.from("favorite_paths").insert({
      user_id: context.userId,
      full_name: data.fullName,
      path: data.path,
      is_favorite: data.isFavorite ?? false,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface RecentFile {
  id: string;
  fullName: string;
  branch: string;
  path: string;
  openCount: number;
  lastOpenedAt: string;
}

/**
 * The last files the user opened or pushed in this repository/branch,
 * newest first. Backs the "Recent Files" panel so people can jump straight
 * back into what they were just working on — including across sessions.
 */
export const listRecentFiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fullName: string; branch: string }) => data)
  .handler(async ({ data, context }): Promise<RecentFile[]> => {
    const { data: rows, error } = await context.supabase
      .from("recent_files")
      .select("id, full_name, branch, path, open_count, last_opened_at")
      .eq("full_name", data.fullName)
      .eq("branch", data.branch)
      .order("last_opened_at", { ascending: false })
      .limit(8);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      id: row.id as string,
      fullName: row.full_name as string,
      branch: row.branch as string,
      path: row.path as string,
      openCount: row.open_count as number,
      lastOpenedAt: row.last_opened_at as string,
    }));
  });

/**
 * Records that a file was just opened or edited. Upserts so repeatedly
 * touching the same file just bumps its timestamp and open count instead of
 * growing the table, keeping the most-relevant files at the top.
 */
export const touchRecentFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { accountId?: string | null; fullName: string; branch: string; path: string }) => data,
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("recent_files")
      .select("id, open_count")
      .eq("full_name", data.fullName)
      .eq("branch", data.branch)
      .eq("path", data.path)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase
        .from("recent_files")
        .update({
          open_count: (existing.open_count as number) + 1,
          last_opened_at: new Date().toISOString(),
        })
        .eq("id", existing.id as string);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await context.supabase.from("recent_files").insert({
      user_id: context.userId,
      account_id: data.accountId ?? null,
      full_name: data.fullName,
      branch: data.branch,
      path: data.path,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Clears the recent files list for the current repository/branch. */
export const clearRecentFiles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fullName: string; branch: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("recent_files")
      .delete()
      .eq("full_name", data.fullName)
      .eq("branch", data.branch);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Just the starred paths for a single repository, e.g. `src/components`,
 * `src/hooks`, `src/pages` — the shortcuts a developer jumps to constantly.
 * Kept separate from `listPaths` (which is ordered by recency across all
 * repos) so the favorites strip in the workspace stays small and stable.
 */
export const listFavoritePaths = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fullName: string }) => data)
  .handler(async ({ data, context }): Promise<PathPref[]> => {
    const { data: rows, error } = await context.supabase
      .from("favorite_paths")
      .select("full_name, path, is_favorite, use_count")
      .eq("full_name", data.fullName)
      .eq("is_favorite", true)
      .order("path", { ascending: true })
      .limit(30);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((row) => ({
      fullName: row.full_name as string | null,
      path: row.path as string,
      isFavorite: row.is_favorite as boolean,
      useCount: row.use_count as number,
    }));
  });

/**
 * Marks (or unmarks) a folder as a favorite path. Deliberately doesn't touch
 * `use_count` — that's reserved for actual navigation frequency — so simply
 * starring a folder you've never opened doesn't skew its usage stats.
 */
export const setPathFavorite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { fullName: string; path: string; isFavorite: boolean }) => data)
  .handler(async ({ data, context }) => {
    const { data: existing } = await context.supabase
      .from("favorite_paths")
      .select("id")
      .eq("full_name", data.fullName)
      .eq("path", data.path)
      .maybeSingle();
    if (existing) {
      const { error } = await context.supabase
        .from("favorite_paths")
        .update({ is_favorite: data.isFavorite })
        .eq("id", existing.id as string);
      if (error) throw new Error(error.message);
      return { ok: true };
    }
    const { error } = await context.supabase.from("favorite_paths").insert({
      user_id: context.userId,
      full_name: data.fullName,
      path: data.path,
      is_favorite: data.isFavorite,
      use_count: 0,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface PushRecord {
  id: string;
  fullName: string;
  branch: string;
  path: string;
  commitMessage: string;
  commitUrl: string | null;
  action: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
}

export const listPushes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<PushRecord[]> => {
    const { data, error } = await context.supabase
      .from("recent_pushes")
      .select(
        "id, full_name, branch, path, commit_message, commit_url, action, status, error_message, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      fullName: row.full_name as string,
      branch: row.branch as string,
      path: row.path as string,
      commitMessage: row.commit_message as string,
      commitUrl: row.commit_url as string | null,
      action: row.action as string,
      status: row.status as string,
      errorMessage: row.error_message as string | null,
      createdAt: row.created_at as string,
    }));
  });

export const saveDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      fullName: string;
      branch: string;
      path: string;
      content: string;
      baseSha?: string | null;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("drafts").upsert(
      {
        user_id: context.userId,
        full_name: data.fullName,
        branch: data.branch,
        path: data.path,
        content: data.content,
        base_sha: data.baseSha ?? null,
      },
      { onConflict: "user_id,full_name,branch,path" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("drafts")
      .select("full_name, branch, path, content, updated_at")
      .order("updated_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      fullName: row.full_name as string,
      branch: row.branch as string,
      path: row.path as string,
      content: row.content as string,
      updatedAt: row.updated_at as string,
    }));
  });