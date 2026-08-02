import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Loader2, Sparkles } from "lucide-react";
import { setPlan } from "@/lib/workspace.functions";
import { usePlan } from "@/hooks/usePlan";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  "Bulk, folder & ZIP uploads",
  "Smart path prediction",
  "Recent files & favorite paths",
  "Fast search across files, folders & extensions",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Unlimited connected GitHub accounts",
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

function Pricing() {
  const queryClient = useQueryClient();
  const { plan, isLoading } = usePlan();
  const setPlanFn = useServerFn(setPlan);

  const changePlan = useMutation({
    mutationFn: (next: "free" | "pro") => setPlanFn({ data: { plan: next } }),
    onSuccess: (_result, next) => {
      void queryClient.invalidateQueries({ queryKey: ["prefs"] });
      toast.success(next === "pro" ? "Welcome to GitPush Pro" : "Moved back to the Free plan");
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't update your plan."),
  });

  const isPro = plan === "pro";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
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

          <Button
            variant="outline"
            className="mt-6"
            disabled={!isPro || changePlan.isPending}
            onClick={() => changePlan.mutate("free")}
          >
            {changePlan.isPending && changePlan.variables === "free" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {isPro ? "Downgrade to Free" : "Current plan"}
          </Button>
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
            <span className="text-3xl font-semibold tracking-tight">$12</span>
            <span className="text-xs text-muted-foreground">/month</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            AI-assisted development, unlimited accounts, and advanced workflows.
          </p>

          <ul className="mt-5 flex-1 space-y-2.5">
            {PRO_FEATURES.map((label) => (
              <FeatureRow key={label} label={label} />
            ))}
          </ul>

          <Button
            className="mt-6"
            disabled={isPro || changePlan.isPending}
            onClick={() => changePlan.mutate("pro")}
          >
            {changePlan.isPending && changePlan.variables === "pro" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : null}
            {isPro ? "Current plan" : "Upgrade to Pro"}
          </Button>
        </div>
      </div>

      {/* This app has no payment processor wired up yet — switching plans
          here just flips the flag every Pro-gated feature checks. See the
          note on `setPlan` in workspace.functions.ts before shipping this
          for real. */}
      <p className="mx-auto mt-6 max-w-lg text-center text-xs text-muted-foreground">
        No payment required — plan changes take effect immediately while GitPush Pro billing is
        still in development.
      </p>
    </main>
  );
}
