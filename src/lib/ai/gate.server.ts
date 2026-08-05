import { isOwner } from "@/lib/permissions";

/**
 * Server-side Pro enforcement for AI features. The UI's `usePlan()` checks
 * only decide what to *show*; this is what actually protects the endpoints.
 * The Owner is always treated as Pro, matching `usePlan`.
 *
 * Reads `user_roles.subscription_plan` — never `user_preferences` — since
 * `user_roles` has zero client write grants and is only ever updated by
 * the signature-verified Paystack webhook. `user_preferences` used to also
 * carry a `plan` column, but it granted `authenticated` full read/write on
 * their own row, so this check could previously be defeated by calling
 * Supabase directly. See `src/lib/paystack/subscriptions.server.ts`.
 */
export async function assertPro(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role, subscription_plan")
    .eq("user_id", userId)
    .maybeSingle();
  const row = role as { role?: string; subscription_plan?: string } | null;
  if (isOwner(row?.role)) return;
  if (row?.subscription_plan === "pro") return;

  throw new Error("AI tools are a GitPush Pro feature. Upgrade to use them.");
}
