import { createFileRoute } from "@tanstack/react-router";

function page(title: string, message: string, ok: boolean) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>
<body style="background:#08090b;color:#e7e9ee;font-family:ui-monospace,monospace;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:32rem;text-align:center">
<h1 style="font-size:1rem;letter-spacing:.08em;text-transform:uppercase;color:${ok ? "#3ddc97" : "#ff6b6b"}">${title}</h1>
<p style="color:#8b93a7;font-size:.875rem">${message}</p>
</div>
<script>
  try { window.opener && window.opener.postMessage({ type: "gitpush:github-oauth", ok: ${ok} }, window.location.origin); } catch (e) {}
  setTimeout(function () { window.close(); }, ${ok ? 600 : 4000});
</script>
</body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

export const Route = createFileRoute("/api/public/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (url.searchParams.get("error")) {
          return page("Connection cancelled", "GitHub authorization was denied.", false);
        }
        if (!code || !state) {
          return page("Invalid callback", "Missing authorization code or state.", false);
        }

        const clientId = process.env["GITHUB_CLIENT_ID"];
        const clientSecret = process.env["GITHUB_CLIENT_SECRET"];
        if (!clientId || !clientSecret) {
          return page("Not configured", "GitHub OAuth credentials are not set.", false);
        }

        const { consumeOAuthState, saveOAuthConnection } = await import(
          "@/lib/github/connections.server"
        );
        const stored = await consumeOAuthState(state);
        if (!stored) {
          return page("Expired request", "This authorization link expired. Try again.", false);
        }

        const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
            redirect_uri: stored.redirectUri,
          }),
        });
        const tokenBody = (await tokenRes.json()) as {
          access_token?: string;
          error_description?: string;
        };
        if (!tokenRes.ok || !tokenBody.access_token) {
          return page(
            "Token exchange failed",
            tokenBody.error_description ?? `GitHub returned ${tokenRes.status}.`,
            false,
          );
        }

        try {
          const account = await saveOAuthConnection(stored.userId, tokenBody.access_token);
          return page("Connected", `@${account.login} is now linked to GitPush.`, true);
        } catch (error) {
          return page(
            "Could not save connection",
            error instanceof Error ? error.message : "Unknown error.",
            false,
          );
        }
      },
    },
  },
});