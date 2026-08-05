import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Neither of the two functions below can grant Pro. `startCheckout` only
 * ever hands back a Paystack-hosted checkout URL; `cancelSubscription`
 * only ever asks Paystack to disable a subscription. The actual plan flag
 * — `user_roles.subscription_plan` — is only ever written by the
 * signature-verified webhook handler. See
 * `src/lib/paystack/subscriptions.server.ts` for why.
 */

export const billingAvailable = createServerFn({ method: "GET" }).handler(async () => {
  const { paystackAvailable } = await import("@/lib/paystack/client.server");
  return { available: paystackAvailable() };
});

export interface MyBilling {
  status: string | null;
  currentPeriodEnd: string | null;
  canCancel: boolean;
}

/** Current subscription status for the pricing page — e.g. showing "renews Aug 12" or a "cancel" action, without exposing anything from the `subscriptions` table the client shouldn't see. */
export const getMyBilling = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyBilling> => {
    const { getSubscription } = await import("@/lib/paystack/subscriptions.server");
    const sub = await getSubscription(context.userId);
    if (!sub) return { status: null, currentPeriodEnd: null, canCancel: false };
    return {
      status: sub.status,
      currentPeriodEnd: sub.currentPeriodEnd,
      canCancel:
        sub.status === "active" && Boolean(sub.paystackSubscriptionCode && sub.paystackEmailToken),
    };
  });

/**
 * Starts a Paystack-hosted checkout for GitPush Pro and returns the URL to
 * redirect the browser to. Requires `PAYSTACK_SECRET_KEY` and
 * `PAYSTACK_PRO_PLAN_CODE` (the recurring Plan created in the Paystack
 * dashboard) to be configured.
 */
export const startCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const planCode = process.env["PAYSTACK_PRO_PLAN_CODE"];
    if (!planCode) {
      throw new Error("GitPush Pro billing isn't configured yet. Set PAYSTACK_PRO_PLAN_CODE.");
    }
    const email = context.claims.email as string | undefined;
    if (!email) throw new Error("Your account has no email on file — can't start checkout.");

    const request = getRequest();
    if (!request) throw new Error("Checkout must start from an app request.");
    const origin = new URL(request.url).origin;
    const callbackUrl = `${origin}/api/public/paystack/callback`;

    const { initializeTransaction } = await import("@/lib/paystack/client.server");
    const result = await initializeTransaction({
      email,
      planCode,
      callbackUrl,
      userId: context.userId,
    });
    return { authorizationUrl: result.authorizationUrl };
  });

/**
 * Asks Paystack to stop auto-renewing the caller's own subscription.
 * Doesn't touch the plan flag — Pro stays active until Paystack confirms
 * via `subscription.disable` (matching normal SaaS behavior: you keep
 * access through the period you already paid for).
 */
export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { getSubscription } = await import("@/lib/paystack/subscriptions.server");
    const sub = await getSubscription(context.userId);
    if (!sub?.paystackSubscriptionCode || !sub.paystackEmailToken) {
      throw new Error("No active GitPush Pro subscription to cancel.");
    }
    const { disableSubscription } = await import("@/lib/paystack/client.server");
    await disableSubscription({ code: sub.paystackSubscriptionCode, token: sub.paystackEmailToken });
    return { ok: true };
  });
