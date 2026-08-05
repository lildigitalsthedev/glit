/**
 * Server-side rate limiting for abuse-prone actions (AI calls, GitHub
 * writes, feature-request submissions). Backed by the `rate_limits` table
 * and the `increment_rate_limit` Postgres function, which does the
 * read-modify-write atomically inside the database — safe under concurrent
 * requests, unlike a naive select-then-update in application code.
 *
 * Fixed windows, not sliding — the simplest thing that actually stops
 * abuse. A user gets `limit` calls per `windowSeconds` per bucket; every
 * call past that in the same window throws until the window rolls over.
 *
 * Mirrors `assertPro` in `ai/gate.server.ts`: a small function called at
 * the top of a handler, rather than composed middleware, so each server
 * function stays free to pick its own bucket/limit.
 */

export interface RateLimitConfig {
  /** Distinguishes independent limits, e.g. "ai_generate", "github_write". */
  bucket: string;
  /** Max calls allowed within the window. */
  limit: number;
  windowSeconds: number;
}

function friendlyWindow(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))}m`;
  if (seconds < 86400) return `${Math.max(1, Math.round(seconds / 3600))}h`;
  return `${Math.max(1, Math.round(seconds / 86400))}d`;
}

/**
 * Throws if the caller has exceeded `config.limit` calls to `config.bucket`
 * within `config.windowSeconds`. Call this first thing in a server function
 * handler, right after (or alongside) any `assertPro`-style checks.
 *
 * Fails open: if the rate-limit check itself errors (e.g. a transient DB
 * issue), the request is allowed through rather than blocking the whole
 * app on a rate-limiter outage.
 */
export async function assertRateLimit(userId: string, config: RateLimitConfig): Promise<void> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("increment_rate_limit", {
    p_user_id: userId,
    p_bucket: config.bucket,
    p_window_seconds: config.windowSeconds,
  });
  if (error) {
    console.error(`[rate-limit] "${config.bucket}" check failed, allowing request:`, error.message);
    return;
  }
  const count = typeof data === "number" ? data : Number(data);
  if (count > config.limit) {
    throw new Error(
      `You're doing that too much — try again in a bit (limit: ${config.limit} per ${friendlyWindow(config.windowSeconds)}).`,
    );
  }
}
