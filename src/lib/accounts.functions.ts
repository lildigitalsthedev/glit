import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface AccountSummary {
  id: string;
  login: string;
  displayName: string | null;
  avatarUrl: string | null;
  label: string | null;
  connectionType: string;
  tokenHint: string;
  repoCount: number;
  status: string;
  lastSync: string | null;
}

export const listAccounts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<AccountSummary[]> => {
    const { data, error } = await context.supabase
      .from("github_accounts")
      .select(
        "id, login, display_name, avatar_url, label, connection_type, token_hint, repo_count, status, last_sync",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((row) => ({
      id: row.id as string,
      login: row.login as string,
      displayName: row.display_name as string | null,
      avatarUrl: row.avatar_url as string | null,
      label: row.label as string | null,
      connectionType: row.connection_type as string,
      tokenHint: row.token_hint as string,
      repoCount: row.repo_count as number,
      status: row.status as string,
      lastSync: row.last_sync as string | null,
    }));
  });

export const connectWithToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { token: string; label?: string | undefined; accountId?: string | undefined }) => data,
  )
  .handler(async ({ data, context }) => {
    const { saveConnection } = await import("./github/connections.server");
    return saveConnection(context.supabase, context.userId, {
      token: data.token.trim(),
      label: data.label,
      accountId: data.accountId,
      connectionType: "pat",
    });
  });

export const renameAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string; label: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("github_accounts")
      .update({ label: data.label })
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("github_accounts")
      .delete()
      .eq("id", data.accountId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { accountId: string }) => data)
  .handler(async ({ data, context }) => {
    const { refreshConnection } = await import("./github/connections.server");
    return refreshConnection(context.supabase, data.accountId);
  });

export const githubOAuthAvailable = createServerFn({ method: "GET" }).handler(async () => ({
  available: Boolean(process.env["GITHUB_CLIENT_ID"] && process.env["GITHUB_CLIENT_SECRET"]),
}));

export const startGithubOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const clientId = process.env["GITHUB_CLIENT_ID"];
    if (!clientId) {
      throw new Error(
        "GitHub OAuth is not configured yet. Add your GitHub OAuth App credentials, or connect with a personal access token.",
      );
    }
    // Check the free-plan account cap before sending the user through the
    // GitHub authorize flow, so we don't bounce them back with a failure
    // after they've already approved access on GitHub's side.
    const { assertAccountQuota } = await import("./github/connections.server");
    await assertAccountQuota(context.supabase, context.userId);
    const request = getRequest();
    if (!request) throw new Error("OAuth must start from an app request.");
    const origin = new URL(request.url).origin;
    const redirectUri = `${origin}/api/public/github/callback`;
    const { createOAuthState } = await import("./github/connections.server");
    const state = await createOAuthState(context.userId, redirectUri);
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("scope", "repo read:user");
    url.searchParams.set("state", state);
    return { authorizationUrl: url.toString() };
  });

/**
 * Permanently deletes the CALLING USER'S OWN GitPush account (auth user +
 * every row that references it). Not to be confused with `deleteAccount`
 * above, which only disconnects one linked GitHub account.
 *
 * Every user-owned table (`profiles`, `github_accounts`, `ai_providers`,
 * `drafts`, `favorite_paths`, `feature_requests`, `oauth_states`,
 * `recent_files`, `recent_pushes`, `repo_prefs`, `user_preferences`,
 * `user_roles`) has `user_id REFERENCES auth.users ON DELETE CASCADE`, so
 * deleting the auth user is sufficient — Postgres cleans up the rest.
 * Requires the service-role admin client since only Supabase's admin API
 * can delete an auth user.
 */
export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });