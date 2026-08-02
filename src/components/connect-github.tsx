import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Github, KeyRound, Loader2, RefreshCw, Trash2 } from "lucide-react";
import {
  connectWithToken,
  deleteAccount,
  githubOAuthAvailable,
  listAccounts,
  refreshAccount,
  startGithubOAuth,
} from "@/lib/accounts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

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
          <Button size="sm">
            <Github className="size-4" />
            Connect GitHub
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
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
                GitHub OAuth credentials aren&apos;t configured for this app yet — use a personal
                access token below in the meantime.
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
                Needs the <span className="font-mono text-code-string">repo</span> scope. Fine-grained
                tokens need Contents: read &amp; write.
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
      </DialogContent>
    </Dialog>
  );
}

export function AccountRow({
  id,
  login,
  label,
  avatarUrl,
  connectionType,
  tokenHint,
  repoCount,
}: {
  id: string;
  login: string;
  label: string | null;
  avatarUrl: string | null;
  connectionType: string;
  tokenHint: string;
  repoCount: number;
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
    <div className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2.5">
      {avatarUrl ? (
        <img src={avatarUrl} alt="" className="size-8 rounded-full" />
      ) : (
        <div className="flex size-8 items-center justify-center rounded-full bg-secondary">
          <Github className="size-4" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-sm">@{login}</p>
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