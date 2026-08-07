import { useEffect, useState, type ReactNode } from "react";
import { Check, FileCode2, FileJson2, FileText, Folder, GitBranch, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Phase = "editing" | "typing-commit" | "pushing" | "pushed";

const COMMIT_MESSAGE = "Fix rate limit on upload endpoint";
const PHASE_DURATIONS: Record<Phase, number> = {
  editing: 1800,
  "typing-commit": COMMIT_MESSAGE.length * 45 + 500,
  pushing: 1100,
  pushed: 1600,
};
const PHASE_ORDER: Phase[] = ["editing", "typing-commit", "pushing", "pushed"];

interface FileRow {
  name: string;
  type: "dir" | "code" | "json" | "text";
  indent?: boolean;
  active?: boolean;
}

const FILES: FileRow[] = [
  { name: "src", type: "dir" },
  { name: "api.server.ts", type: "code", indent: true, active: true },
  { name: "package.json", type: "json" },
  { name: "README.md", type: "text" },
];

function FileRowIcon({ type }: { type: "dir" | "code" | "json" | "text" }) {
  if (type === "dir") return <Folder className="size-3.5 shrink-0 text-muted-foreground" />;
  if (type === "json") return <FileJson2 className="size-3.5 shrink-0 text-code-string" />;
  if (type === "text") return <FileText className="size-3.5 shrink-0 text-muted-foreground" />;
  return <FileCode2 className="size-3.5 shrink-0 text-primary" />;
}

interface CodeLine {
  n: number;
  content: ReactNode;
  added?: boolean;
}

const CODE_LINES: CodeLine[] = [
  { n: 12, content: <span className="text-code-comment">// throttle bursts from a single client</span> },
  {
    n: 13,
    content: (
      <>
        <span className="text-code-key">const</span> limiter = <span className="text-code-key">new</span>{" "}
        <span className="text-primary">RateLimiter</span>(
        <span className="text-code-string">{"{ windowMs: 10_000, max: 20 }"}</span>);
      </>
    ),
  },
  { n: 14, content: <span>&nbsp;</span> },
  {
    n: 15,
    content: (
      <>
        <span className="text-code-key">export async function</span>{" "}
        <span className="text-primary">POST</span>(req: Request) {"{"}
      </>
    ),
  },
  {
    n: 16,
    content: (
      <>
        &nbsp;&nbsp;<span className="text-code-key">if</span> (limiter.<span className="text-primary">isLimited</span>(req)) {"{"}
      </>
    ),
    added: true,
  },
  {
    n: 17,
    content: (
      <>
        &nbsp;&nbsp;&nbsp;&nbsp;<span className="text-code-key">return</span> json({"{ "}error:{" "}
        <span className="text-code-string">"Too many requests"</span>
        {" }"}, {"{ "}status: <span className="text-code-string">429</span>
        {" }"});
      </>
    ),
    added: true,
  },
  { n: 18, content: <span>&nbsp;&nbsp;{"}"}</span>, added: true },
];

/**
 * A self-animating mock of the GitPush editor — file tree, a small diff,
 * and a commit bar — built from the app's own design tokens rather than a
 * screenshot, so it stays accurate as the product changes and never goes
 * stale or out of sync with the real UI.
 */
export function ProductPreview() {
  const [phase, setPhase] = useState<Phase>("editing");
  const [typed, setTyped] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(query.matches);
    const listener = (event: MediaQueryListEvent) => setReducedMotion(event.matches);
    query.addEventListener("change", listener);
    return () => query.removeEventListener("change", listener);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;
    const timeout = setTimeout(() => {
      setPhase((current) => {
        const next = PHASE_ORDER[(PHASE_ORDER.indexOf(current) + 1) % PHASE_ORDER.length] ?? current;
        if (next !== "typing-commit") setTyped("");
        return next;
      });
    }, PHASE_DURATIONS[phase]);
    return () => clearTimeout(timeout);
  }, [phase, reducedMotion]);

  useEffect(() => {
    if (reducedMotion || phase !== "typing-commit") return;
    setTyped("");
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      setTyped(COMMIT_MESSAGE.slice(0, i));
      if (i >= COMMIT_MESSAGE.length) clearInterval(interval);
    }, 45);
    return () => clearInterval(interval);
  }, [phase, reducedMotion]);

  const showDiff = phase === "typing-commit" || phase === "pushing" || phase === "pushed";
  const commitText = reducedMotion ? COMMIT_MESSAGE : typed;
  const effectivePhase = reducedMotion ? "pushed" : phase;

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border border-border bg-card shadow-xl shadow-black/30">
      {/* window chrome */}
      <div className="flex items-center gap-3 border-b border-border bg-secondary/40 px-3 py-2.5">
        <div className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-destructive/70" />
          <span className="size-2.5 rounded-full bg-chart-3/70" />
          <span className="size-2.5 rounded-full bg-success/70" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded border border-border bg-background px-2.5 py-1 font-mono text-[10px] text-muted-foreground">
          <GitBranch className="size-3 shrink-0 text-primary" />
          <span className="truncate">you / api-gateway</span>
          <span className="text-code-comment">on main</span>
        </div>
      </div>

      <div className="flex min-w-0">
        {/* file tree */}
        <div className="hidden w-36 shrink-0 border-r border-border p-2 sm:block">
          {FILES.map((file) => (
            <div
              key={file.name}
              className={cn(
                "flex items-center gap-1.5 rounded px-1.5 py-1 text-[11px]",
                file.indent && "ml-3",
                file.active ? "bg-primary/15 text-foreground" : "text-muted-foreground",
              )}
            >
              <FileRowIcon type={file.type} />
              <span className="truncate">{file.name}</span>
            </div>
          ))}
        </div>

        {/* editor */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
            <div className="flex items-center gap-1.5 rounded-t border-x border-t border-border bg-background px-2.5 py-1 text-[11px] text-foreground">
              <FileCode2 className="size-3 text-primary" />
              api.server.ts
              <span
                className={cn(
                  "size-1.5 rounded-full transition-colors",
                  showDiff ? "bg-primary" : "bg-transparent",
                )}
              />
            </div>
          </div>

          <div className="w-full min-w-0 max-w-full overflow-x-auto px-2 py-2 font-mono text-[10.5px] leading-5 sm:text-[11px]">
            {CODE_LINES.map((line) => (
              <div
                key={line.n}
                className={cn(
                  "flex w-max min-w-full gap-3 rounded px-1.5 transition-colors duration-500",
                  line.added && showDiff && "bg-success/10",
                )}
              >
                <span className="w-4 shrink-0 select-none text-right text-line-number">{line.n}</span>
                <span
                  className={cn(
                    "whitespace-pre text-foreground/90 transition-opacity duration-500",
                    line.added && !showDiff && "opacity-0",
                  )}
                >
                  {line.added && showDiff && <span className="mr-1.5 text-success">+</span>}
                  {line.content}
                </span>
              </div>
            ))}
          </div>

          {/* commit bar */}
          <div className="flex min-w-0 items-center gap-2 border-t border-border bg-secondary/30 px-2.5 py-2">
            <div className="min-w-0 flex-1 truncate rounded border border-border bg-background px-2.5 py-1.5 font-mono text-[10.5px] text-foreground">
              {commitText || <span className="text-muted-foreground">Commit message</span>}
              {phase === "typing-commit" && !reducedMotion && (
                <span className="ml-px inline-block h-3 w-px animate-[blink_1s_step-end_infinite] bg-primary align-middle" />
              )}
            </div>
            <div
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded px-3 text-[10.5px] font-medium transition-colors",
                effectivePhase === "pushed"
                  ? "bg-success text-success-foreground"
                  : "bg-primary text-primary-foreground",
              )}
            >
              {effectivePhase === "pushing" && <Loader2 className="size-3 animate-spin" />}
              {effectivePhase === "pushed" && <Check className="size-3" />}
              {effectivePhase === "pushing"
                ? "Pushing"
                : effectivePhase === "pushed"
                  ? "Pushed"
                  : "Commit"}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
