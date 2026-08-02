import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Github, KeyRound, Loader2, Lock, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import {
  connectWithToken,
  deleteAccount,
  githubOAuthAvailable,
  listAccounts,
  refreshAccount,
  startGithubOAuth,
} from "@/lib/accounts.functions";
import { usePlan } from "@/hooks/usePlan";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** Free plan tops out at a single connected GitHub account (see pricing). */
const FREE_ACCOUNT_LIMIT = 1;

export function useAccounts() {
  const fn = useServerFn(listAccounts);
  return useQuery({ queryKey: ["accounts"], queryFn: () => fn() });
}

export function ConnectGithubDialog({ trigger }: { trigger?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const queryClient = useQueryClient();
  const oauthFn = useServerFn(githubOAuthAvailable);
  const startFn = useServerFn(startGithubOAuth);
  const patFn = useServerFn(connectWithToken);

  // Reads off the same ["accounts"] cache every account list already
  // populates, so this doesn't trigger an extra fetch.
  const { isPro, isLoading: planLoading } = usePlan();
  const accounts = useAccounts();
  const accountCount = accounts.data?.length ?? 0;
  const atLimit = !planLoading && !isPro && accountCount >= FREE_ACCOUNT_LIMIT;

  const { data: oauth } = useQuery({ queryKey: ["github-oauth"], queryFn: () => oauthFn() });

  const oauthMutation = useMutation({
    mutationFn: () => startFn(),
    onSuccess: ({ authorizationUrl }) => {
      const popup = window.open(authorizationUrl, "gitpush-github", "width=720,height=780");
      if (!popup) {
        toast.error("Popup blocked. Allow popups and try again.");
        return;
      }
      const onMessage = (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        if (event.data?.type !== "gitpush:github-oauth") return;
        window.removeEventListener("message", onMessage);
        if (event.data.ok) {
          toast.success("GitHub connected");
          void queryClient.invalidateQueries({ queryKey: ["accounts"] });
          setOpen(false);
        } else {
          toast.error("GitHub connection failed");
        }
      };
      window.addEventListener("message", onMessage);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patMutation = useMutation({
    mutationFn: () => patFn({ data: { token, label: label || undefined } }),
    onSuccess: (account) => {
      toast.success(`Connected @${account.login}`);
      setToken("");
      setLabel("");
      setOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant={atLimit ? "outline" : "default"}>
            {atLimit ? <Lock className="size-4" /> : <Github className="size-4" />}
            {atLimit ? "Add account" : "Connect GitHub"}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        {atLimit ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                Unlock more accounts with Pro
              </DialogTitle>
              <DialogDescription>
                Free is limited to {FREE_ACCOUNT_LIMIT} connected GitHub account. Upgrade to GitPush
                Pro to connect unlimited accounts and switch between them instantly.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <ul className="space-y-2.5">
                {[
                  "Unlimited connected GitHub accounts",
                  "Instant switching, right where you work",
                  "AI tools, prompt library & more"].map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span className="text-foreground">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button asChild className="w-full" onClick={() => setOpen(false)}>
                <Link to="/pricing">
                  <Sparkles className="size-4" />
                  Upgrade to GitPush Pro — $12/mo
                </Link>
              </Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Connect a GitHub account</DialogTitle>
              <DialogDescription>
                Tokens are encrypted before storage and every GitHub call happens server-side.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6">
              <div className="space-y-3">
                <p className="label-caps">Recommended</p>
                <Button
                  className="w-full"
                  onClick={() => oauthMutation.mutate()}
                  disabled={oauthMutation.isPending || oauth?.available === false}
                >
                  {oauthMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Github className="size-4" />
                  )}
                  Authorize with GitHub
                </Button>
                {oauth?.available === false && (
                  <p className="text-xs text-muted-foreground">
                    GitHub OAuth credentials aren&apos;t configured for this app yet — use a
                    personal access token below in the meantime.
                  </p>
                )}
              </div>

              <div className="space-y-3 border-t border-border pt-5">
                <p className="label-caps">Personal access token</p>
                <div className="space-y-2">
                  <Label htmlFor="pat">Token</Label>
                  <Input
                    id="pat"
                    value={token}
                    onChange={(e) => setToken(e.target.value)}
                    placeholder="ghp_… or github_pat_…"
                    className="font-mono text-xs"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Needs the <span className="font-mono text-code-string">repo</span> scope.
                    Fine-grained tokens need Contents: read &amp; write.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="label">Label (optional)</Label>
                  <Input
                    id="label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="Work account"
                  />
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={!token.trim() || patMutation.isPending}
                  onClick={() => patMutation.mutate()}
                >
                  {patMutation.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <KeyRound className="size-4" />
                  )}
                  Connect with token
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function statusMeta(status: string): { text: string; className: string } {
  switch (status) {
    case "connected":
      return { text: "Connected", className: "bg-primary/10 text-primary border-transparent" };
    case "error":
    case "expired":
      return {
        text: "Needs reconnect",
        className: "bg-destructive/10 text-destructive border-transparent",
      };
    default:
      return { text: status, className: "bg-secondary text-muted-foreground border-transparent" };
  }
}

export function AccountRow({
  id,
  login,
  label,
  avatarUrl,
  connectionType,
  tokenHint,
  repoCount,
  status,
}: {
  id: string;
  login: string;
  label: string | null;
  avatarUrl: string | null;
  connectionType: string;
  tokenHint: string;
  repoCount: number;
  status: string;
}) {
  const queryClient = useQueryClient();
  const refreshFn = useServerFn(refreshAccount);
  const deleteFn = useServerFn(deleteAccount);

  const refresh = useMutation({
    mutationFn: () => refreshFn({ data: { accountId: id } }),
    onSuccess: () => {
      toast.success("Account refreshed");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteFn({ data: { accountId: id } }),
    onSuccess: () => {
      toast.success("Account disconnected");
      void queryClient.invalidateQueries();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5 transition-colors duration-150 hover:border-primary/30">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="size-8 rounded-full" />
      ) : (
        <div className="flex size-8 items-center justify-center rounded-full bg-secondary">
          <Github className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate font-mono text-sm">@{login}</p>
          <Badge className={cn("shrink-0 px-1.5 py-0 text-[10px] font-normal", statusMeta(status).className)}>
            {statusMeta(status).text}
          </Badge>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {label ?? "GitHub"} · {connectionType === "oauth" ? "OAuth" : "PAT"} {tokenHint} ·{" "}
          {repoCount} repos
        </p>
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => refresh.mutate()}
        disabled={refresh.isPending}
      >
        <RefreshCw className={refresh.isPending ? "size-3.5 animate-spin" : "size-3.5"} />
      </Button>
      <Button variant="ghost" size="sm" onClick={() => remove.mutate()} disabled={remove.isPending}>
        <Trash2 className="size-3.5 text-destructive" />
      </Button>
    </div>
  );
}