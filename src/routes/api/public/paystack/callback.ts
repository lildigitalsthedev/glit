import { createFileRoute } from "@tanstack/react-router";

function page(title: string, message: string, ok: boolean) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<meta http-equiv="refresh" content="2;url=/pricing">
</head>
<body style="background:#08090b;color:#e7e9ee;font-family:ui-monospace,monospace;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0">
<div style="max-width:32rem;text-align:center;padding:0 1.5rem">
<h1 style="font-size:1rem;letter-spacing:.08em;text-transform:uppercase;color:${ok ? "#3ddc97" : "#ff6b6b"}">${title}</h1>
<p style="color:#8b93a7;font-size:.875rem">${message}</p>
</div>
<script>setTimeout(function () { window.location.href = "/pricing"; }, 2000);</script>
</body></html>`,
    { status: ok ? 200 : 400, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

/**
 * Where Paystack sends the browser back after checkout. Purely cosmetic —
 * it verifies the transaction with Paystack just to show an accurate
 * message, but never writes to the database itself. The actual Pro grant
 * happens over on the `subscription.create`/`charge.success` webhook,
 * which is signature-verified and typically lands within a second or two
 * of this redirect; `usePlan()` on the pricing page picks it up as soon as
 * that webhook lands.
 */
export const Route = createFileRoute("/api/public/paystack/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const reference = url.searchParams.get("reference") ?? url.searchParams.get("trxref");
        if (!reference) {
          return page("Missing reference", "No transaction reference was provided.", false);
        }

        try {
          const { verifyTransaction } = await import("@/lib/paystack/client.server");
          const result = await verifyTransaction(reference);
          if (result.status === "success") {
            return page("Payment received", "Activating your GitPush Pro plan — redirecting…", true);
          }
          return page(
            "Payment not completed",
            `Paystack reported this transaction as "${result.status}". No changes were made.`,
            false,
          );
        } catch (error) {
          return page(
            "Couldn't confirm payment",
            error instanceof Error ? error.message : "Unknown error.",
            false,
          );
        }
      },
    },
  },
});
