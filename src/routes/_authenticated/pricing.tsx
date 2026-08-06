import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Sparkles } from "lucide-react";
import { billingAvailable, cancelSubscription, getMyBilling, startCheckout } from "@/lib/billing.functions";
import { usePlan } from "@/hooks/usePlan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { proPriceLocalEquivalent, proPriceNGN } from "@/lib/pricing";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — GitPush" },
      { name: "description", content: "Compare GitPush Free and GitPush Pro." },
      { property: "og:title", content: "Pricing — GitPush" },
      { property: "og:description", content: "Compare GitPush Free and GitPush Pro." },
    ],
  }),
  component: Pricing,
});

const FREE_FEATURES = [
  "1 connected GitHub account",
  "Unlimited public & private repositories",
  "Full file editor with diff view",
  "ZIP uploads",
  "Smart path prediction",
  "Recent files & favorite paths",
  "Fast search across files, folders & extensions",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Unlimited connected GitHub accounts",
  "Batch file uploads — many files, one commit",
  "Folder uploads with full hierarchy preserved",
  "Bring your own AI (OpenAI, Claude, Gemini, and more)",
  "AI code generation directly in the editor",
  "AI file editing from natural language",
  "AI repository chat",
  "AI-generated commit messages",
  "AI code review before you push",
  "Prompt library & prompt history",
  "AI multi-file changes with full diff approval",
];

function FeatureRow({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <span className="text-foreground">{label}</span>
    </li>
  );
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return null;
  }
}

function Pricing() {
  const queryClient = useQueryClient();
  const { plan, isLoading } = usePlan();
  const proPrice = proPriceNGN();
  const proPriceLocal = proPriceLocalEquivalent();

  const availableFn = useServerFn(billingAvailable);
  const available = useQuery({ queryKey: ["billing-available"], queryFn: () => availableFn() });

  const billingFn = useServerFn(getMyBilling);
  const billing = useQuery({ queryKey: ["my-billing"], queryFn: () => billingFn() });

  const startCheckoutFn = useServerFn(startCheckout);
  const checkout = useMutation({
    mutationFn: () => startCheckoutFn(),
    onSuccess: (result) => {
      // Full-page redirect to Paystack's hosted checkout — there's
      // nothing left to do client-side until the person comes back
      // through /api/public/paystack/callback.
      window.location.href = result.authorizationUrl;
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't start checkout."),
  });

  const cancelFn = useServerFn(cancelSubscription);
  const cancel = useMutation({
    mutationFn: () => cancelFn(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-billing"] });
      toast.success("Auto-renew turned off — you'll keep Pro until your current period ends.");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't cancel your subscription."),
  });

  const isPro = plan === "pro";
  const periodEnd = formatDate(billing.data?.currentPeriodEnd ?? null);
  const isNonRenewing = billing.data?.status === "non-renewing";
  const paystackReady = available.data?.available ?? true; // assume ready until proven otherwise, to avoid a flash of "not configured"

  return (
    <main className="mx-auto max-w-3xl px-3 py-4">
      <p className="label-caps">Pricing</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Simple, upfront pricing</h1>
      <p className="mt-2 max-w-lg text-sm text-muted-foreground">
        GitPush stays a genuinely useful GitHub manager for free. Pro adds AI-assisted development
        and support for unlimited connected accounts.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Free */}
        <div className="flex flex-col rounded-md border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Free</h2>
            {!isPro && !isLoading && (
              <Badge variant="secondary" className="font-mono text-[10px]">
                Current plan
              </Badge>
            )}
          </div>
          <p className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight">$0</span>
            <span className="text-xs text-muted-foreground">/month</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Everything you need to manage GitHub repositories from your phone.
          </p>

          <ul className="mt-5 flex-1 space-y-2.5">
            {FREE_FEATURES.map((label) => (
              <FeatureRow key={label} label={label} />
            ))}
          </ul>

          {isPro && (
            <Button
              variant="outline"
              className="mt-6"
              disabled={!billing.data?.canCancel || isNonRenewing || cancel.isPending}
              onClick={() => cancel.mutate()}
            >
              {cancel.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {isNonRenewing ? "Auto-renew off" : "Cancel Pro subscription"}
            </Button>
          )}
          {!isPro && (
            <Button variant="outline" className="mt-6" disabled>
              Current plan
            </Button>
          )}
        </div>

        {/* Pro */}
        <div
          className={cn(
            "flex flex-col rounded-md border p-5 shadow-sm",
            isPro ? "border-primary/50 bg-primary/5" : "border-primary/30 bg-card",
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="size-3.5 text-primary" />
              GitPush Pro
            </h2>
            {isPro && !isLoading && (
              <Badge className="font-mono text-[10px]">Current plan</Badge>
            )}
          </div>
          <p className="mt-3 flex items-baseline gap-1">
            <span className="text-3xl font-semibold tracking-tight">{proPrice}</span>
            <span className="text-xs text-muted-foreground">/month</span>
            {proPriceLocal && (
              <span className="text-xs text-muted-foreground">({proPriceLocal})</span>
            )}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI-assisted development, unlimited accounts, and advanced workflows.
          </p>

          <ul className="mt-5 flex-1 space-y-2.5">
            {PRO_FEATURES.map((label) => (
              <FeatureRow key={label} label={label} />
            ))}
          </ul>

          {isPro ? (
            <Button className="mt-6" disabled>
              Current plan
            </Button>
          ) : (
            <Button
              className="mt-6"
              disabled={checkout.isPending || !paystackReady}
              onClick={() => checkout.mutate()}
            >
              {checkout.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              <Sparkles className="size-4" />
              Upgrade to Pro
            </Button>
          )}
        </div>
      </div>

      {isPro && periodEnd && (
        <p className="mx-auto mt-6 max-w-lg text-center text-xs text-muted-foreground">
          {isNonRenewing
            ? `Pro access continues through ${periodEnd}, then moves to Free.`
            : `Renews ${periodEnd}.`}
        </p>
      )}
      {!available.isLoading && !paystackReady && (
        <p className="mx-auto mt-6 max-w-lg text-center text-xs text-muted-foreground">
          GitPush Pro billing isn't configured yet on this deployment.
        </p>
      )}
      <p className="mx-auto mt-2 max-w-lg text-center text-xs text-muted-foreground">
        Payments are processed by Paystack. Upgrading redirects you to a secure Paystack checkout page.
      </p>
    </main>
  );
}
