import { isOwner } from "@/lib/permissions";

/**
 * Server-side Pro enforcement for AI features. The UI's `usePlan()` checks
 * only decide what to *show*; this is what actually protects the endpoints.
 * The Owner is always treated as Pro, matching `usePlan`.
 */
export async function assertPro(userId: string): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (isOwner((role as { role?: string } | null)?.role)) return;

  const { data: prefs } = await supabaseAdmin
    .from("user_preferences")
    .select("plan")
    .eq("user_id", userId)
    .maybeSingle();
  if ((prefs as { plan?: string } | null)?.plan === "pro") return;

  throw new Error("AI tools are a GitPush Pro feature. Upgrade to use them.");
}