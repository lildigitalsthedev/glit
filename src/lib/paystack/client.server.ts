// Server-only. Never import from anything that ships to the browser — this
// reads PAYSTACK_SECRET_KEY, which must never reach the client bundle.
// Mirrors the shape of `github/api.server.ts`: a thin typed fetch wrapper
// plus a typed error class, nothing fancier.
import { createHmac, timingSafeEqual } from "node:crypto";

const PAYSTACK_API = "https://api.paystack.co";

export class PaystackError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function secretKey(): string {
  const key = process.env["PAYSTACK_SECRET_KEY"];
  if (!key) {
    throw new Error(
      "Paystack isn't configured yet. Set PAYSTACK_SECRET_KEY (and PAYSTACK_PRO_PLAN_CODE) to enable GitPush Pro billing.",
    );
  }
  return key;
}

export function paystackAvailable(): boolean {
  return Boolean(process.env["PAYSTACK_SECRET_KEY"] && process.env["PAYSTACK_PRO_PLAN_CODE"]);
}

async function psFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${PAYSTACK_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
  const text = await res.text();
  const body = (() => {
    try {
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  })() as { message?: string; data?: unknown } | null;
  if (!res.ok || (body && body["status" as never] === false)) {
    throw new PaystackError(res.status, body?.message ?? `Paystack request failed (${res.status}).`);
  }
  return body as T;
}

export interface InitializeTransactionResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

/**
 * Starts a hosted Paystack checkout for the Pro subscription plan. Passing
 * `plan` (the Paystack Plan code, from PAYSTACK_PRO_PLAN_CODE) makes this a
 * subscription checkout — Paystack creates the recurring subscription
 * itself on first successful charge and reports it back via the
 * `subscription.create` webhook, so we never have to compute amounts or
 * currency here; that all lives on the Plan configured in the Paystack
 * dashboard.
 *
 * `metadata.userId` round-trips through Paystack and comes back on every
 * webhook event for this transaction/subscription, which is how the
 * webhook handler maps a Paystack event back to a GitPush user without
 * relying on email matching.
 */
export async function initializeTransaction(args: {
  email: string;
  planCode: string;
  callbackUrl: string;
  userId: string;
}): Promise<InitializeTransactionResult> {
  const result = await psFetch<{
    data: { authorization_url: string; access_code: string; reference: string };
  }>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify({
      email: args.email,
      plan: args.planCode,
      callback_url: args.callbackUrl,
      metadata: { userId: args.userId },
    }),
  });
  return {
    authorizationUrl: result.data.authorization_url,
    accessCode: result.data.access_code,
    reference: result.data.reference,
  };
}

export interface VerifyTransactionResult {
  status: string;
  reference: string;
  customerCode: string | null;
  planCode: string | null;
  userId: string | null;
}

/** Read-only status check used by the post-checkout landing page for UX only — never used to grant Pro. See webhook.ts. */
export async function verifyTransaction(reference: string): Promise<VerifyTransactionResult> {
  const result = await psFetch<{
    data: {
      status: string;
      reference: string;
      customer?: { customer_code?: string };
      plan?: string | { plan_code?: string } | null;
      metadata?: { userId?: string } | null;
    };
  }>(`/transaction/verify/${encodeURIComponent(reference)}`);
  const data = result.data;
  return {
    status: data.status,
    reference: data.reference,
    customerCode: data.customer?.customer_code ?? null,
    planCode: typeof data.plan === "object" ? (data.plan?.plan_code ?? null) : (data.plan ?? null),
    userId: data.metadata?.userId ?? null,
  };
}

/** Cancels auto-renewal on a subscription. Requires both the subscription code and the email token Paystack issued for it (see `subscription.create` webhook payload). */
export async function disableSubscription(args: { code: string; token: string }): Promise<void> {
  await psFetch("/subscription/disable", {
    method: "POST",
    body: JSON.stringify({ code: args.code, token: args.token }),
  });
}

/**
 * Verifies the `x-paystack-signature` header against the raw request body.
 * Paystack signs webhooks with HMAC-SHA512 of the raw JSON body using the
 * secret key — must run against the exact bytes received, before any
 * JSON.parse, or a semantically-identical-but-differently-serialized body
 * would fail verification. Uses a constant-time comparison so this can't be
 * timed to leak the expected signature.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = createHmac("sha512", secretKey()).update(rawBody).digest("hex");
  const expectedBuf = Buffer.from(expected, "utf8");
  const actualBuf = Buffer.from(signatureHeader, "utf8");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
