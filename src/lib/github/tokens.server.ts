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