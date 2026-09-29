import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/hooks/useAuth";
import { approveMcpAuthorization } from "@/lib/mcp/oauth.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/mcp/authorize")({ component: McpAuthorizePage });

function McpAuthorizePage() {
  const { user, loading } = useAuth();
  const approveFn = useServerFn(approveMcpAuthorization);
  const params = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  const clientId = params.get("client_id") ?? "";
  const redirectUri = params.get("redirect_uri") ?? "";
  const codeChallenge = params.get("code_challenge") ?? "";
  const resource = params.get("resource") ?? "";
  const redirectHost = (() => { try { return new URL(redirectUri).host; } catch { return "unknown destination"; } })();
  const state = params.get("state") ?? undefined;
  const returnTo = typeof window === "undefined" ? "/mcp/authorize" : `${window.location.pathname}${window.location.search}`;
  const approve = useMutation({
    mutationFn: () => approveFn({ data: { clientId, redirectUri, codeChallenge, resource, state } }),
    onSuccess: ({ redirect }) => window.location.assign(redirect),
  });
  const valid = Boolean(clientId && redirectUri && codeChallenge && resource);

  if (loading) return <main className="mx-auto max-w-lg p-8 text-sm text-muted-foreground">Loading sign-in…</main>;
  if (!user) return (
    <main className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-semibold">Sign in to GitPush</h1>
      <p className="text-sm text-muted-foreground">Sign in to authorize this AI tool to access your connected GitHub repositories.</p>
      <Button asChild><a href={`/auth?returnTo=${encodeURIComponent(returnTo)}`}>Continue to sign in</a></Button>
    </main>
  );
  if (!valid) return <main className="mx-auto max-w-lg p-8 text-sm">This authorization request is incomplete or invalid. Return to your AI tool and try connecting again.</main>;

  return (
    <main className="mx-auto max-w-lg space-y-5 p-8">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">GitPush authorization</p>
        <h1 className="mt-2 text-xl font-semibold">Allow {params.get("client_name") || "an AI tool"}?</h1>
      </div>
      <p className="text-sm text-muted-foreground">This will let the connected tool browse your GitHub repositories, read files, and push commits through GitPush. You can revoke access by disconnecting the connector in Claude.</p>
      <p className="text-xs text-muted-foreground">Authorization returns to <code className="font-mono">{redirectHost}</code>.</p>
      {approve.error && <p role="alert" className="text-sm text-destructive">{approve.error.message}</p>}
      <Button onClick={() => approve.mutate()} disabled={approve.isPending}>
        {approve.isPending ? "Authorizing…" : "Authorize GitPush"}
      </Button>
    </main>
  );
}
