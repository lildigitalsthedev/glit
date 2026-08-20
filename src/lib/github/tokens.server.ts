import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptToken } from "./crypto.server";

/**
 * Loads and decrypts the GitHub token for an account. The passed client is the
 * request-scoped, RLS-enforcing client, so an account belonging to another user
 * simply is not visible here.
 */
export async function loadAccountToken(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  accountId: string,
): Promise<{ token: string; login: string }> {
  const { data, error } = await supabase
    .from("github_accounts")
    .select("id, login, encrypted_token")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That GitHub connection was not found for your account.");
  return { token: decryptToken(data.encrypted_token as string), login: data.login as string };
}

/**
 * Same as `loadAccountToken`, but via the service-role client instead of a
 * request-scoped RLS client. Used only where there is no signed-in GitPush
 * user to scope RLS to — redeemed access-link sessions (Feature: Expiring
 * Access Links) and the background sweep that reverts temporary-public
 * repos. Both callers must independently verify the caller is authorized
 * (a validated link/session row, or a claimed sweep row) before reaching
 * for this, since it bypasses the per-user visibility RLS normally gives.
 */
export async function loadAccountTokenAdmin(
  accountId: string,
): Promise<{ token: string; login: string }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("github_accounts")
    .select("id, login, encrypted_token")
    .eq("id", accountId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("That GitHub connection is no longer available.");
  return { token: decryptToken(data.encrypted_token as string), login: data.login as string };
}