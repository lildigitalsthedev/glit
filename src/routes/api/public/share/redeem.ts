import { createFileRoute } from "@tanstack/react-router";
import { buildSessionCookie, clientIp, json } from "@/lib/github/share-cookie.server";

export const Route = createFileRoute("/api/public/share/redeem")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { token?: unknown };
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid request body." }, 400);
        }
        const token = typeof body.token === "string" ? body.token.trim() : "";
        if (!token || token.length < 16 || token.length > 512) {
          return json({ error: "Invalid link." }, 400);
        }

        const { hashIp, assertLinkRateLimit, redeemAccessLink } = await import(
          "@/lib/github/share-links.server"
        );
        const ip = clientIp(request);
        const ipHash = hashIp(ip);

        try {
          // Two independent limits: per-IP (stop one guesser hammering many
          // tokens) and per-token-prefix (stop distributed guessing at one
          // token). Both are cheap, additive checks — see the spec's
          // "Prevent Link Abuse" requirements.
          await assertLinkRateLimit(`redeem_ip:${ipHash}`, 20, 300);
          await assertLinkRateLimit(`redeem_token:${token.slice(0, 8)}`, 20, 300);

          const session = await redeemAccessLink({ rawToken: token, ipHash });
          return json(
            {
              role: session.role,
              fullName: session.fullName,
              allowDownload: session.allowDownload,
              expiresAt: session.expiresAt,
            },
            200,
            { "Set-Cookie": buildSessionCookie(session.sessionToken, session.expiresAt) },
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "Couldn't open this link.";
          return json({ error: message }, 400);
        }
      },
    },
  },
});
