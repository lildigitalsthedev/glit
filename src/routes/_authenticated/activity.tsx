import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { History } from "lucide-react";
import { listPushes } from "@/lib/workspace.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/_authenticated/activity")({
  head: () => ({
    meta: [
      { title: "Activity — GitPush" },
      { name: "description", content: "Every file you pushed to GitHub through GitPush." },
      { property: "og:title", content: "Activity — GitPush" },
      { property: "og:description", content: "Every file you pushed to GitHub through GitPush." },
    ],
  }),
  component: Activity,
});

function Activity() {
  const fn = useServerFn(listPushes);
  const pushes = useQuery({ queryKey: ["pushes"], queryFn: () => fn() });

  return (
    <main className="mx-auto max-w-4xl px-3 py-4">
      <p className="label-caps">History</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Recent pushes</h1>

      {pushes.isLoading && (
        <div className="mt-6 divide-y divide-border rounded-md border border-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="size-1.5 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-1/3" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-3 w-24 shrink-0" />
            </div>
          ))}
        </div>
      )}

      {!pushes.isLoading && (pushes.data ?? []).length > 0 && (
        <ul className="mt-6 divide-y divide-border rounded-md border border-border">
          {(pushes.data ?? []).map((push, index) => (
            <li
              key={push.id}
              style={{ animationDelay: `${Math.min(index, 10) * 30}ms` }}
              className="flex animate-in fade-in items-center gap-3 px-4 py-3 transition-colors duration-300 hover:bg-secondary/30"
            >
              <span
                className={
                  push.status === "success"
                    ? "size-1.5 shrink-0 rounded-full bg-success"
                    : "size-1.5 shrink-0 rounded-full bg-destructive"
                }
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{push.commitMessage}</p>
                <p className="truncate font-mono text-[11px] text-muted-foreground">
                  {push.fullName} · {push.branch} · {push.path}
                  {push.errorMessage ? ` · ${push.errorMessage}` : ""}
                </p>
              </div>
              <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                {new Date(push.createdAt).toLocaleString()}
              </span>
              {push.commitUrl && (
                <a
                  href={push.commitUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 font-mono text-[11px] text-primary transition-colors hover:underline"
                >
                  view
                </a>
              )}
            </li>
          ))}
        </ul>
      )}

      {!pushes.isLoading && (pushes.data ?? []).length === 0 && (
        <EmptyState
          className="mt-6"
          icon={History}
          title="No pushes yet."
          description="Commits you push through GitPush will show up here."
        />
      )}
    </main>
  );
}