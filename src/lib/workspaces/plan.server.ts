/**
 * Team workspaces are a GitPush Pro feature. Personal workspaces are always
 * available, so this only guards *creating* a team.
 *
 * Reads `user_roles.subscription_plan` for the same reason `gate.server.ts`
 * does: that table has no client write grants and is only ever changed by the
 * signature-verified Paystack webhook.
 */
import { isOwner } from "@/lib/permissions";

export async function assertTeamsPlan(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role, subscription_plan")
    .eq("user_id", userId)
    .maybeSingle();
  const row = data as { role?: string; subscription_plan?: string } | null;
  if (isOwner(row?.role)) return;
  if (row?.subscription_plan === "pro") return;
  throw new Error("Team workspaces are a GitPush Pro feature. Upgrade to create one.");
}