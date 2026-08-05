import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getMyRole } from "@/lib/roles.functions";

/**
 * The shared "is this user on GitPush Pro?" check.
 *
 * `plan` comes from `getMyRole`, which reads `user_roles.subscription_plan`
 * — a table with zero write grants to `authenticated`, only ever updated
 * by the Paystack webhook handler after signature verification (see
 * `src/lib/paystack/subscriptions.server.ts`). Earlier this read
 * `user_preferences.plan` instead, which — because `user_preferences`
 * grants authenticated users full read/write on their own row — could be
 * set to "pro" by calling Supabase directly, without going through any
 * application code at all. Don't reintroduce that by reading plan from
 * anywhere other than `user_roles`.
 *
 * Every Pro-gated feature (multiple accounts, AI tools, prompt library,
 * etc.) should check `isPro` here rather than re-deriving plan state on
 * its own, so plan logic stays in one place.
 *
 * The Owner is always Pro, regardless of whatever `subscription_plan`
 * happens to say, since the Owner is never restricted by billing.
 */
export function usePlan() {
  const roleFn = useServerFn(getMyRole);
  const roleQuery = useQuery({ queryKey: ["role"], queryFn: () => roleFn() });

  const plan = roleQuery.data?.subscriptionPlan ?? "free";
  const isOwner = roleQuery.data?.isOwner ?? false;

  return {
    plan,
    isPro: plan === "pro" || isOwner,
    isLoading: roleQuery.isLoading,
  };
}
