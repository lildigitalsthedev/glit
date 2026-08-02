import type { SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { encryptToken, tokenHint } from "./crypto.server";
import { getViewer, listAllRepos } from "./api.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, any, any>;

export async function saveConnection(
  supabase: Client,
  userId: string,
  args: { token: string; label?: string; accountId?: string; connectionType: "pat" | "oauth" },
) {
  if (!args.token) throw new Error("A token is required.");
  const viewer = await getViewer(args.token);
  const repos = await listAllRepos(args.token).catch(() => []);

  const row = {
    user_id: userId,
    login: viewer.login,
    display_name: viewer.name,
    avatar_url: viewer.avatar_url,
    label: args.label ?? viewer.login,
    connection_type: args.connectionType,
    encrypted_token: encryptToken(args.token),
    token_hint: tokenHint(args.token),
    repo_count: repos.length,
    status: "connected",
    last_sync: new Date().toISOString(),
  };

  if (args.accountId) {
    const { data, error } = await supabase
      .from("github_accounts")
      .update(row)
      .eq("id", args.accountId)
      .select("id, login")
      .single();
    if (error) throw new Error(error.message);
    return { id: data.id as string, login: data.login as string };
  }

  const { data, error } = await supabase
    .from("github_accounts")
    .upsert(row, { onConflict: "user_id,login" })
    .select("id, login")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string, login: data.login as string };
}

export async function refreshConnection(supabase: Client, accountId: string) {
  const { loadAccountToken } = await import("./tokens.server");
  const { token } = await loadAccountToken(supabase, accountId);
  const repos = await listAllRepos(token);
  const { error } = await supabase
    .from("github_accounts")
    .update({ repo_count: repos.length, last_sync: new Date().toISOString(), status: "connected" })
    .eq("id", accountId);
  if (error) throw new Error(error.message);
  return { repoCount: repos.length };
}

export async function createOAuthState(userId: string, redirectUri: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const state = randomBytes(24).toString("hex");
  const { error } = await supabaseAdmin
    .from("oauth_states")
    .insert({ state, user_id: userId, redirect_uri: redirectUri });
  if (error) throw new Error(error.message);
  return state;
}

export async function consumeOAuthState(state: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("oauth_states")
    .select("state, user_id, redirect_uri, created_at")
    .eq("state", state)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  await supabaseAdmin.from("oauth_states").delete().eq("state", state);
  const ageMs = Date.now() - new Date(data.created_at as string).getTime();
  if (ageMs > 10 * 60 * 1000) return null;
  return { userId: data.user_id as string, redirectUri: data.redirect_uri as string };
}

/** Stores an OAuth-obtained token for a user without a request-scoped client. */
export async function saveOAuthConnection(userId: string, token: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return saveConnection(supabaseAdmin as unknown as Client, userId, {
    token,
    connectionType: "oauth",
  });
}