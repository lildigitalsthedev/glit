// Server-only, service-role. This is the ONLY code path in the app allowed
// to set `user_roles.subscription_plan = 'pro'` — it's called exclusively
// from the signature-verified Paystack webhook handler
// (routes/api/public/paystack/webhook.ts). There is deliberately no
// client-callable function anywhere that can grant Pro directly; compare
// `cancelSubscription` in billing.functions.ts, which only ever *asks*
// Paystack to disable a subscription — the actual downgrade still happens
// here, once Paystack confirms it via the `subscription.disable` webhook.
//
// Paystack's subscription-lifecycle events don't all carry our
// `metadata.userId` the way the initial `charge.success` does — only the
// transaction/charge events do. So the flow is: `charge.success` (which we
// only ever fire a checkout for with `metadata.userId` attached) links
// `paystack_customer_code` to the GitPush user and grants Pro immediately;
// every later event (`subscription.create`, renewals, cancellation) is
// looked up by `paystack_customer_code` or `paystack_subscription_code`
// instead, since that's all those payloads give us.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface SubscriptionRecord {
  userId: string;
  paystackCustomerCode: string | null;
  paystackSubscriptionCode: string | null;
  paystackEmailToken: string | null;
  paystackPlanCode: string | null;
  status: string;
  currentPeriodEnd: string | null;
}

function toRecord(row: {
  user_id: string;
  paystack_customer_code: string | null;
  paystack_subscription_code: string | null;
  paystack_email_token: string | null;
  paystack_plan_code: string | null;
  status: string;
  current_period_end: string | null;
}): SubscriptionRecord {
  return {
    userId: row.user_id,
    paystackCustomerCode: row.paystack_customer_code,
    paystackSubscriptionCode: row.paystack_subscription_code,
    paystackEmailToken: row.paystack_email_token,
    paystackPlanCode: row.paystack_plan_code,
    status: row.status,
    currentPeriodEnd: row.current_period_end,
  };
}

export async function getSubscription(userId: string): Promise<SubscriptionRecord | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select(
      "user_id, paystack_customer_code, paystack_subscription_code, paystack_email_token, paystack_plan_code, status, current_period_end",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toRecord(data) : null;
}

async function findUserIdByCustomerCode(customerCode: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("paystack_customer_code", customerCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.user_id ?? null;
}

async function findUserIdBySubscriptionCode(subscriptionCode: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id")
    .eq("paystack_subscription_code", subscriptionCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.user_id ?? null;
}

async function setPlanFlag(userId: string, plan: "free" | "pro"): Promise<void> {
  // Upsert, not update: covers the (rare) case a webhook for a brand-new
  // user arrives before `ensureRoleForUser` has ever run for them.
  const { error } = await supabaseAdmin
    .from("user_roles")
    .upsert({ user_id: userId, subscription_plan: plan }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}

/**
 * `charge.success` for a checkout that carried our `metadata.userId` —
 * i.e. the transaction `startCheckout` initialized. Links the Paystack
 * customer to the GitPush user and grants Pro right away, so the person
 * isn't stuck waiting on `subscription.create` (which typically follows
 * within seconds, but there's no reason to make them wait).
 */
export async function grantProFromCharge(args: {
  userId: string;
  customerCode: string;
  planCode: string | null;
  event: string;
}): Promise<void> {
  const { error } = await supabaseAdmin.from("subscriptions").upsert(
    {
      user_id: args.userId,
      paystack_customer_code: args.customerCode,
      paystack_plan_code: args.planCode,
      status: "active",
      last_event: args.event,
      last_event_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(error.message);
  await setPlanFlag(args.userId, "pro");
}

/** `subscription.create`: fills in the subscription code + email token needed later to cancel, matched by the customer code `grantProFromCharge` stored moments earlier. */
export async function attachSubscription(args: {
  customerCode: string;
  subscriptionCode: string;
  emailToken: string;
  planCode: string | null;
  currentPeriodEnd: string | null;
  event: string;
}): Promise<void> {
  const userId = await findUserIdByCustomerCode(args.customerCode);
  if (!userId) {
    console.error(
      `[paystack] subscription.create for unknown customer ${args.customerCode} — no matching charge.success seen yet.`,
    );
    return;
  }
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      paystack_subscription_code: args.subscriptionCode,
      paystack_email_token: args.emailToken,
      paystack_plan_code: args.planCode,
      status: "active",
      current_period_end: args.currentPeriodEnd,
      last_event: args.event,
      last_event_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await setPlanFlag(userId, "pro");
}

/** `charge.success` for a renewal (no `metadata.userId` — Paystack triggers these itself): push the next billing date out. */
export async function recordRenewal(args: {
  subscriptionCode: string;
  currentPeriodEnd: string | null;
  event: string;
}): Promise<void> {
  const userId = await findUserIdBySubscriptionCode(args.subscriptionCode);
  if (!userId) return;
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({
      status: "active",
      current_period_end: args.currentPeriodEnd,
      last_event: args.event,
      last_event_at: new Date().toISOString(),
    })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await setPlanFlag(userId, "pro");
}

/** `subscription.not_renew`: user cancelled auto-renew. Still Pro until `current_period_end` — Paystack sends `subscription.disable` separately once it actually lapses. */
export async function markNonRenewing(subscriptionCode: string, event: string): Promise<void> {
  const userId = await findUserIdBySubscriptionCode(subscriptionCode);
  if (!userId) return;
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: "non-renewing", last_event: event, last_event_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** `invoice.payment_failed`: flag for visibility. Doesn't revoke Pro — Paystack retries per its dunning schedule and sends `subscription.disable` if it ultimately gives up. */
export async function markPaymentAttention(subscriptionCode: string, event: string): Promise<void> {
  const userId = await findUserIdBySubscriptionCode(subscriptionCode);
  if (!userId) return;
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: "attention", last_event: event, last_event_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
}

/** `subscription.disable`: the subscription has actually ended — this is what revokes Pro. */
export async function deactivateSubscription(subscriptionCode: string, event: string): Promise<void> {
  const userId = await findUserIdBySubscriptionCode(subscriptionCode);
  if (!userId) return;
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .update({ status: "cancelled", last_event: event, last_event_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  await setPlanFlag(userId, "free");
}
