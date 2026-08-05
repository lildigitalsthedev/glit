import { createFileRoute } from "@tanstack/react-router";

interface PaystackCustomer {
  customer_code?: string;
  email?: string;
}
interface PaystackPlanRef {
  plan_code?: string;
}
interface PaystackEventBody {
  event?: string;
  data?: {
    reference?: string;
    status?: string;
    subscription_code?: string;
    email_token?: string;
    next_payment_date?: string | null;
    customer?: PaystackCustomer;
    plan?: string | PaystackPlanRef | null;
    subscription?: { subscription_code?: string };
    metadata?: { userId?: string } | null;
  };
}

function planCodeOf(plan: string | PaystackPlanRef | null | undefined): string | null {
  if (!plan) return null;
  return typeof plan === "string" ? plan : (plan.plan_code ?? null);
}

/**
 * Paystack webhook. This is the ONLY place in the app that can grant
 * GitPush Pro — see `src/lib/paystack/subscriptions.server.ts`. Everything
 * here runs after the HMAC-SHA512 signature check, so nothing downstream
 * trusts anything from the client.
 *
 * Public + unauthenticated by necessity (Paystack has no user session to
 * send), same as the GitHub OAuth callback route — the signature check is
 * what stands in for auth here.
 */
export const Route = createFileRoute("/api/public/paystack/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawBody = await request.text();

        const { verifyWebhookSignature } = await import("@/lib/paystack/client.server");
        const signature = request.headers.get("x-paystack-signature");
        if (!verifyWebhookSignature(rawBody, signature)) {
          console.error("[paystack webhook] signature verification failed");
          return new Response("Invalid signature", { status: 401 });
        }

        let body: PaystackEventBody;
        try {
          body = JSON.parse(rawBody) as PaystackEventBody;
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const event = body.event;
        const data = body.data;
        if (!event || !data) {
          return new Response("ok", { status: 200 });
        }

        try {
          const subs = await import("@/lib/paystack/subscriptions.server");

          switch (event) {
            case "charge.success": {
              // Only ever act on charges that carry the metadata our own
              // checkout attaches — this is what `startCheckout` sets, so
              // this is what tells us it's an initial Pro subscription
              // charge and not some unrelated transaction.
              const userId = data.metadata?.userId;
              const customerCode = data.customer?.customer_code;
              if (userId && customerCode) {
                await subs.grantProFromCharge({
                  userId,
                  customerCode,
                  planCode: planCodeOf(data.plan),
                  event,
                });
                break;
              }
              // Renewal charges: Paystack triggers these itself with no
              // metadata, but do carry the subscription code.
              const subscriptionCode = data.subscription?.subscription_code;
              if (subscriptionCode) {
                await subs.recordRenewal({
                  subscriptionCode,
                  currentPeriodEnd: data.next_payment_date ?? null,
                  event,
                });
              }
              break;
            }

            case "subscription.create": {
              const customerCode = data.customer?.customer_code;
              const subscriptionCode = data.subscription_code;
              const emailToken = data.email_token;
              if (customerCode && subscriptionCode && emailToken) {
                await subs.attachSubscription({
                  customerCode,
                  subscriptionCode,
                  emailToken,
                  planCode: planCodeOf(data.plan),
                  currentPeriodEnd: data.next_payment_date ?? null,
                  event,
                });
              }
              break;
            }

            case "subscription.not_renew": {
              if (data.subscription_code) await subs.markNonRenewing(data.subscription_code, event);
              break;
            }

            case "invoice.payment_failed": {
              const subscriptionCode = data.subscription?.subscription_code ?? data.subscription_code;
              if (subscriptionCode) await subs.markPaymentAttention(subscriptionCode, event);
              break;
            }

            case "subscription.disable": {
              if (data.subscription_code) await subs.deactivateSubscription(data.subscription_code, event);
              break;
            }

            default:
              // Unhandled event types are expected — Paystack sends many
              // more than we act on. Ack with 200 so it isn't retried.
              break;
          }
        } catch (error) {
          // Non-2xx tells Paystack to retry with backoff — appropriate for
          // a transient DB/error here, since missing a webhook silently
          // means a paying customer never gets Pro (or never gets
          // downgraded).
          console.error(`[paystack webhook] failed to process "${event}":`, error);
          return new Response("Internal error", { status: 500 });
        }

        return new Response("ok", { status: 200 });
      },
    },
  },
});
