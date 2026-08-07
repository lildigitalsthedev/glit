import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  ArrowRight,
  Check,
  Clock,
  FolderOpen,
  GitBranch,
  GitCommit,
  Github,
  HelpCircle,
  Search,
  ShieldCheck,
  Sparkles,
  Terminal,
  UploadCloud,
  Users,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { ProductPreview } from "@/components/marketing/product-preview";
import { AnimatedCounter } from "@/components/marketing/animated-counter";
import { SiteFooter } from "@/components/marketing/site-footer";

export const Route = createFileRoute("/")({
  component: Index,
});

const STEPS = [
  {
    icon: Github,
    title: "Connect GitHub",
    body: "One-time OAuth. Your token is encrypted and stored server-side — it never touches the browser.",
  },
  {
    icon: FolderOpen,
    title: "Open a repo & branch",
    body: "Browse your repositories, pick a branch, and set a working folder to start from.",
  },
  {
    icon: GitCommit,
    title: "Edit and push",
    body: "Change a file, write a commit message, and push. The whole loop takes seconds.",
  },
];

const FEATURES = [
  { icon: Zap, title: "Push in seconds", body: "Open a repo, edit a file, commit. No clone, no CLI." },
  { icon: GitBranch, title: "Branch aware", body: "Pick any branch, set a working folder, see the diff before you push." },
  { icon: UploadCloud, title: "Bulk uploads", body: "Drop a folder or a batch of files and land them in one atomic commit." },
  { icon: Search, title: "Find anything fast", body: "Search across files, folders, and extensions, then jump straight in." },
  { icon: ShieldCheck, title: "Server-side only", body: "Tokens are encrypted at rest and never touch the browser." },
  { icon: Sparkles, title: "AI, when you want it", body: "Bring your own key for AI edits, commit messages, and repo chat." },
];

const PRO_TEASERS = [
  "AI code generation and natural-language file edits",
  "AI repository chat and AI-generated commit messages",
  "Unlimited connected GitHub accounts",
];

// Illustrative, rounded figures for the stats strip below — swap these for
// real numbers once product analytics are wired up. Kept as a small config
// array so that's a one-line change when the time comes.
const STATS = [
  { icon: UploadCloud, value: 15000, suffix: "+", label: "Files pushed" },
  { icon: GitCommit, value: 4200, suffix: "+", label: "Commits shipped" },
  { icon: Clock, value: 1000, suffix: "+", label: "Hours saved" },
  { icon: Users, value: 900, suffix: "+", label: "Repos connected" },
];

const FAQS = [
  {
    question: "Is my GitHub token safe?",
    answer:
      "Yes. Your GitHub access token is encrypted at rest and only ever used server-side — it never touches the browser, so it can't be read from your device or leaked through a browser extension.",
  },
  {
    question: "Do I need to install anything?",
    answer:
      "No. gitpush runs entirely in the browser. There's no CLI to install and no need to clone a repo locally — connect GitHub, open a repo, and start editing.",
  },
  {
    question: "What's included on the Free plan?",
    answer:
      "The full editor, diff view, and unlimited repositories — the core experience isn't gated. Free covers everything you need for quick edits and one-off pushes.",
  },
  {
    question: "What do I get with Pro?",
    answer:
      "Pro adds AI code generation and natural-language file edits, AI repository chat, AI-generated commit messages, and unlimited connected GitHub accounts.",
  },
  {
    question: "Can I use it on my phone?",
    answer:
      "Yes — the editor, file tree, and commit flow are all optimized for touch and small screens, so you can push a quick fix from your phone just as easily as from a desktop.",
  },
  {
    question: "Which repos and branches does it work with?",
    answer:
      "Any repository your connected GitHub account has access to, and any branch on it. You can also set a default working folder to jump straight into the right place.",
  },
  {
    question: "Can I cancel a paid plan anytime?",
    answer:
      "Yes, cancel anytime from Settings — you'll keep Pro features until the end of your current billing period, then drop back to Free automatically.",
  },
];

function Index() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) void navigate({ to: "/app" });
  }, [loading, session, navigate]);

  return (
    <>
      <main className="mx-auto max-w-5xl overflow-x-hidden px-4 py-16 sm:py-24">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-mono text-sm">
          <Terminal className="size-4 text-primary" />
          <span className="font-semibold tracking-tight">gitpush</span>
        </div>
        <nav className="flex items-center gap-4 text-sm text-muted-foreground">
          <a href="#features" className="hidden transition-colors hover:text-foreground sm:inline">
            Features
          </a>
          <a href="#faq" className="hidden transition-colors hover:text-foreground sm:inline">
            FAQ
          </a>
          <Link to="/pricing" className="hidden transition-colors hover:text-foreground sm:inline">
            Pricing
          </Link>
          <Link to="/auth" className="transition-colors hover:text-foreground">
            Sign in
          </Link>
        </nav>
      </div>

      <div className="grid min-w-0 gap-12 lg:mt-16 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-10">
        <div className="mt-16 min-w-0 lg:mt-0">
          <h1 className="max-w-xl text-4xl font-semibold tracking-tight sm:text-5xl">
            Push files to GitHub straight from your browser.
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground">
            A lightweight editor for the moments you just need one file in a repo — a config, a README, a
            quick fix. Connect GitHub once and commit from anywhere, on any device.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                Start pushing
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-success" /> Free plan, no card required
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-success" /> No install, no CLI
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-success" /> Tokens encrypted server-side
            </span>
          </div>
        </div>

        <div className="min-w-0 animate-in fade-in slide-in-from-bottom-2 duration-500">
          <ProductPreview />
          <p className="mt-3 text-center text-xs text-muted-foreground">
            The actual GitPush editor — file tree, diff, and commit, live.
          </p>
        </div>
      </div>

      <section className="mt-20 sm:mt-28">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-border bg-border sm:grid-cols-4">
          {STATS.map((stat, index) => (
            <div
              key={stat.label}
              className="animate-in fade-in slide-in-from-bottom-1 flex flex-col items-center gap-1.5 bg-card px-4 py-6 text-center duration-500"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <stat.icon className="size-4 text-primary" aria-hidden="true" />
              <AnimatedCounter
                value={stat.value}
                suffix={stat.suffix}
                className="font-mono text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl"
              />
              <p className="text-xs text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-24 sm:mt-32">
        <p className="label-caps">What to expect</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Three steps between you and a pushed commit
        </h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <article
              key={step.title}
              className="animate-in fade-in slide-in-from-bottom-2 rounded-md border border-border bg-card p-5 duration-500"
              style={{ animationDelay: `${index * 100}ms` }}
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-primary">
                  <step.icon className="size-4" />
                </div>
                <span className="font-mono text-xs text-muted-foreground">0{index + 1}</span>
              </div>
              <h3 className="mt-4 text-sm font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-xs text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-24 sm:mt-32" id="features">
        <p className="label-caps">Everything you need</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          A genuinely useful GitHub manager
        </h2>
        <p className="mt-2 max-w-lg text-sm text-muted-foreground">
          Every account starts on the Free plan — full editor, diff view, and unlimited repositories
          included.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, index) => (
            <article
              key={feature.title}
              className="animate-in fade-in slide-in-from-bottom-1 rounded-md border border-border bg-card p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40"
              style={{ animationDelay: `${Math.min(index, 6) * 60}ms` }}
            >
              <feature.icon className="size-4 text-primary" />
              <h3 className="mt-3 text-sm font-semibold">{feature.title}</h3>
              <p className="mt-1.5 text-xs text-muted-foreground">{feature.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-16 sm:mt-20">
        <div className="flex flex-col gap-6 rounded-md border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="gap-1 font-mono text-[10px]">
                <Sparkles className="size-3" /> Pro
              </Badge>
              <span className="text-sm font-semibold">Want AI in the loop?</span>
            </div>
            <ul className="mt-3 space-y-1.5">
              {PRO_TEASERS.map((label) => (
                <li key={label} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Check className="mt-0.5 size-3 shrink-0 text-primary" />
                  {label}
                </li>
              ))}
            </ul>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link to="/pricing">
              See full pricing
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="mt-16 sm:mt-20">
        <p className="label-caps">The difference</p>
        <pre className="mt-3 overflow-x-auto rounded-md border border-border bg-card p-4 font-mono text-[11px] leading-6 text-muted-foreground">
          <span className="text-code-comment"># the old way</span>
          {"\n"}git clone git@github.com:you/repo.git && cd repo{"\n"}vim README.md && git add . &&
          git commit -m "fix" && git push{"\n\n"}
          <span className="text-code-comment"># with gitpush</span>
          {"\n"}
          <span className="text-primary">open</span> repo → edit →{" "}
          <span className="text-code-string">commit</span>
        </pre>
      </section>

      <section className="mt-16 sm:mt-20" id="faq">
        <p className="label-caps">Questions</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
          Frequently asked questions
        </h2>
        <div className="mt-6 rounded-md border border-border bg-card px-5">
          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq) => (
              <AccordionItem key={faq.question} value={faq.question}>
                <AccordionTrigger className="gap-3 text-sm">
                  <span className="flex items-center gap-2.5">
                    <HelpCircle className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    {faq.question}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="pl-6 text-xs text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      <section className="mt-16 mb-8 flex flex-col items-center gap-4 rounded-md border border-border bg-card px-6 py-12 text-center sm:mt-20">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
          Connect a repo and push your first commit
        </h2>
        <p className="max-w-md text-sm text-muted-foreground">
          Free to start, no credit card, ready in under a minute.
        </p>
        <Button asChild size="lg">
          <Link to="/auth">
            Start pushing
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>
    </main>
      <SiteFooter />
    </>
  );
}
