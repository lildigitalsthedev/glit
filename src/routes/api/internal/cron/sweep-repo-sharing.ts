import { createFileRoute } from "@tanstack/react-router";

/**
 * The server-side heartbeat behind both sharing features. The lazy
 * self-heal in `getTemporaryPublicStatus` / `redeemAccessLink` already
 * handles the common case (someone looks at the app again), but the spec
 * explicitly requires expiry to survive the browser being closed, the
 * device going offline, or GitPush never being reopened at all — this
 * endpoint is what makes that true unconditionally, independent of any
 * user visiting the app.
 *
 * Call this on a schedule (every 1–5 minutes) from whatever your
 * deployment already uses for cron — a platform cron feature, GitHub
 * Actions, cron-job.org, or Supabase's pg_cron+pg_net hitting this URL
 * directly. It does nothing destructive if called more often than
 * needed, and nothing at all if called less often (the lazy self-heal
 * still covers the gap for anyone actively using the app).
 *
 * Protected by a shared secret rather than requireSupabaseAuth, since the
 * caller here is a scheduler, not a signed-in user. Set CRON_SECRET in
 * the environment and send it back as `x-cron-secret`.
 */
export const Route = createFileRoute("/api/internal/cron/sweep-repo-sharing")({
  server: {
    handlers: {
      POST: async ({ request }) => handleSweep(request),
      GET: async ({ request }) => handleSweep(request),
    },
  },
});

async function handleSweep(request: Request): Promise<Response> {
  const configured = process.env["CRON_SECRET"];
  if (!configured) {
    return new Response(
      JSON.stringify({ error: "CRON_SECRET is not configured on the server." }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }
  const provided = request.headers.get("x-cron-secret");
  if (!provided || provided !== configured) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { sweepExpiredTempPublic } = await import("@/lib/github/temp-public.server");
  const tempPublicResult = await sweepExpiredTempPublic(50);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  await db.rpc("expire_stale_access_links");
  await db.rpc("prune_stale_rate_limits").catch(() => {});
  await db.rpc("prune_stale_link_rate_limits").catch(() => {});
  await db.rpc("prune_stale_repo_temp_public").catch(() => {});
  await db.rpc("prune_stale_repo_share_audit").catch(() => {});

  // Also clear out expired share sessions so `repo_access_sessions` doesn't
  // grow unbounded — they're already unusable past `expires_at`, this just
  // reclaims the rows.
  await db.from("repo_access_sessions").delete().lt("expires_at", new Date().toISOString());

  return new Response(JSON.stringify({ ok: true, tempPublic: tempPublicResult }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
