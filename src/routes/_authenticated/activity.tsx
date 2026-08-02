import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";
import { listPushes } from "@/lib/workspace.functions";

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
    <main className="mx-auto max-w-4xl px-4 py-8">
      <p className="label-caps">History</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Recent pushes</h1>

      {pushes.isLoading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-5 animate-spin text-primary" />
        </div>
      )}

      <ul className="mt-6 divide-y divide-border rounded-md border border-border">
        {(pushes.data ?? []).map((push) => (
          <li key={push.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={
                push.status === "success"
                  ? "size-1.5 rounded-full bg-success"
                  : "size-1.5 rounded-full bg-destructive"
              }
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">{push.commitMessage}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">
                {push.fullName} · {push.branch} · {push.path}
                {push.errorMessage ? ` · ${push.errorMessage}` : ""}
              </p>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              {new Date(push.createdAt).toLocaleString()}
            </span>
            {push.commitUrl && (
              <a
                href={push.commitUrl}
                target="_blank"
                rel="noreferrer"
                className="font-mono text-[11px] text-primary hover:underline"
              >
                view
              </a>
            )}
          </li>
        ))}
      </ul>

      {!pushes.isLoading && (pushes.data ?? []).length === 0 && (
        <p className="mt-8 text-sm text-muted-foreground">No pushes yet.</p>
      )}
    </main>
  );
}