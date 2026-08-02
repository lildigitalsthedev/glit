import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Terminal, GitBranch, ShieldCheck, Zap } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  component: Index,
});

const FEATURES = [
  { icon: Zap, title: "Push in seconds", body: "Open a repo, edit a file, commit. No clone, no CLI." },
  { icon: GitBranch, title: "Branch aware", body: "Pick any branch, set a working folder, see the diff before you push." },
  { icon: ShieldCheck, title: "Server-side only", body: "Tokens are encrypted at rest and never touch the browser." },
];

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) void navigate({ to: "/app" });
  }, [loading, session, navigate]);

  return (
    <main className="mx-auto max-w-4xl px-4 py-24">
      <div className="flex items-center gap-2 font-mono text-sm">
        <Terminal className="size-4 text-primary" />
        <span className="font-semibold tracking-tight">gitpush</span>
      </div>

      <h1 className="mt-16 max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
        Push files to GitHub straight from your browser.
      </h1>
      <p className="mt-5 max-w-xl text-base text-muted-foreground">
        A lightweight editor for the moments you just need one file in a repo — a config, a README, a
        quick fix. Connect GitHub once and commit from anywhere.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button asChild>
          <Link to="/auth">Start pushing</Link>
        </Button>
        <Button asChild variant="outline">
          <Link to="/auth">Sign in</Link>
        </Button>
      </div>

      <section className="mt-24 grid gap-4 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <article key={feature.title} className="rounded-md border border-border bg-card p-4">
            <feature.icon className="size-4 text-primary" />
            <h2 className="mt-3 text-sm font-semibold">{feature.title}</h2>
            <p className="mt-1.5 text-xs text-muted-foreground">{feature.body}</p>
          </article>
        ))}
      </section>

      <pre className="mt-16 overflow-x-auto rounded-md border border-border bg-card p-4 font-mono text-[11px] leading-6 text-muted-foreground">
        <span className="text-code-comment"># the old way</span>
        {"\n"}git clone git@github.com:you/repo.git && cd repo{"\n"}vim README.md && git add . &&
        git commit -m "fix" && git push{"\n\n"}
        <span className="text-code-comment"># with gitpush</span>
        {"\n"}
        <span className="text-primary">open</span> repo → edit → <span className="text-code-string">commit</span>
      </pre>
    </main>
  );
}
