import { createFileRoute } from "@tanstack/react-router";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers } });
const oauthError = (error: string, status = 400) => json({ error }, status);

export const Route = createFileRoute("/api/public/oauth/$action")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const origin = new URL(request.url).origin;
        const action = params.action;
        if (action === "resource") return json({
          resource: `${origin}/api/public/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], scopes_supported: ["mcp"],
        });
        if (action === "authorize") {
          const q = new URL(request.url).searchParams;
          const clientId = q.get("client_id") ?? "";
          const redirectUri = q.get("redirect_uri") ?? "";
          const challenge = q.get("code_challenge") ?? "";
          const resource = q.get("resource") ?? `${origin}/api/public/mcp`;
          const { getClient } = await import("@/lib/mcp/oauth.server");
          const client = await getClient(clientId);
          if (!client || !client.redirect_uris.includes(redirectUri) || q.get("response_type") !== "code" || q.get("code_challenge_method") !== "S256" || !/^[A-Za-z0-9_-]{43}$/.test(challenge) || resource !== `${origin}/api/public/mcp`) {
            return oauthError("invalid_request");
          }
          const next = new URL("/mcp/authorize", origin);
          for (const key of ["client_id", "redirect_uri", "code_challenge", "resource", "state"]) {
            const value = q.get(key); if (value) next.searchParams.set(key, value);
          }
          next.searchParams.set("client_name", client.client_name);
          return Response.redirect(next, 302);
        }
        return oauthError("not_found", 404);
      },
      POST: async ({ request, params }) => {
        const action = params.action;
        let body: Record<string, unknown>;
        try {
          const type = request.headers.get("content-type") ?? "";
          if (type.includes("application/json")) {
            const parsed: unknown = await request.json();
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return oauthError("invalid_request");
            body = parsed as Record<string, unknown>;
          } else body = Object.fromEntries(new URLSearchParams(await request.text()));
        } catch { return oauthError("invalid_request"); }

        if (action === "register") {
          try {
            const { registerClient } = await import("@/lib/mcp/oauth.server");
            return json(await registerClient({
              client_name: typeof body.client_name === "string" ? body.client_name : undefined,
              redirect_uris: body.redirect_uris,
            }), 201);
          } catch { return oauthError("invalid_client_metadata"); }
        }
        if (action === "token") {
          const origin = new URL(request.url).origin;
          const form = new URLSearchParams();
          for (const [key, value] of Object.entries(body)) form.set(key, String(value));
          const { exchangeToken } = await import("@/lib/mcp/oauth.server");
          const tokens = await exchangeToken(form, `${origin}/api/public/mcp`);
          return tokens ? json(tokens) : oauthError("invalid_grant", 400);
        }
        if (action === "revoke") {
          const { revokeToken } = await import("@/lib/mcp/oauth.server");
          await revokeToken(String(body.token ?? ""), String(body.client_id ?? ""));
          return new Response(null, { status: 200, headers: { "Cache-Control": "no-store" } });
        }
        return oauthError("not_found", 404);
      },
    },
  },
});
