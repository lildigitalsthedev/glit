import { createFileRoute } from "@tanstack/react-router";
import { readCookie, SHARE_SESSION_COOKIE, json } from "@/lib/github/share-cookie.server";

export const Route = createFileRoute("/api/public/share/session")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = readCookie(request, SHARE_SESSION_COOKIE);
        if (!raw) return json({ active: false }, 200);

        const { validateSession } = await import("@/lib/github/share-links.server");
        const session = await validateSession(raw);
        if (!session) return json({ active: false }, 200);

        return json({
          active: true,
          role: session.role,
          fullName: session.fullName,
          allowDownload: session.allowDownload,
          expiresAt: session.expiresAt,
        });
      },
    },
  },
});
