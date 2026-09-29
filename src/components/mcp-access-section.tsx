import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Cable, Copy, KeyRound, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createMcpKey, deleteMcpKey, listMcpKeys } from "@/lib/mcp.functions";
import { usePlan } from "@/hooks/usePlan";

/** Lets users connect Claude and other AI tools to GitPush with a personal access key. */
export function McpAccessSection() {
  const qc = useQueryClient();
  const { isPro } = usePlan();
  const listFn = useServerFn(listMcpKeys);
  const createFn = useServerFn(createMcpKey);
  const deleteFn = useServerFn(deleteMcpKey);
  const keys = useQuery({ queryKey: ["mcp-keys"], queryFn: () => listFn(), enabled: isPro });
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("Claude");
  const [newKey, setNewKey] = useState<string | null>(null);

  const url = typeof window !== "undefined" ? `${window.location.origin}/api/public/mcp` : "/api/public/mcp";
  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success("Copied.");
  };

  const create = useMutation({
    mutationFn: () => createFn({ data: { name } }),
    onSuccess: (res) => {
      setNewKey(res.key);
      void qc.invalidateQueries({ queryKey: ["mcp-keys"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = (id: string) =>
    deleteFn({ data: { id } })
      .then(() => {
        toast.success("Key revoked.");
        void qc.invalidateQueries({ queryKey: ["mcp-keys"] });
      })
      .catch((e: Error) => toast.error(e.message));

  const rows = keys.data ?? [];

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Cable className="size-4 text-primary" />
            Connect AI tools
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Connect an MCP-compatible AI tool to browse repositories, pull files, and push changes through GitPush.
          </p>
        </div>
        {isPro && (
          <Button size="sm" variant="outline" onClick={() => { setNewKey(null); setOpen(true); }}>
            <KeyRound className="size-3.5" />
            New key
          </Button>
        )}
      </div>

      {!isPro ? (
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-4 text-sm">
          <Sparkles className="mr-1.5 inline size-3.5 text-primary" />
          Connecting AI tools is a GitPush Pro feature.
        </div>
      ) : (
        <>
          <div className="mt-3 rounded-md border border-border bg-card p-3">
            <p className="text-xs text-muted-foreground">Server address</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{url}</code>
              <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => copy(url)} aria-label="Copy address">
                <Copy className="size-3.5" />
              </Button>
            </div>
            <div className="mt-3 space-y-1 text-xs text-muted-foreground">
              <p>To connect: create a key below, then add this URL as a remote MCP server in your AI tool.</p>
              <p>
                Set the server authorization header to <code className="font-mono">Bearer YOUR_GITPUSH_KEY</code>.
                The key lets the tool access repositories connected to your GitPush account.
              </p>
              <p>Once connected, ask the tool to list repositories, read or pull files, and commit changes with GitPush.</p>
            </div>
          </div>

          {keys.isLoading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" /> Loading keys…
            </div>
          ) : rows.length === 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">No keys yet.</p>
          ) : (
            <ul className="mt-3 space-y-2">
              {rows.map((k) => (
                <li key={k.id} className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">{k.name}</p>
                    <p className="font-mono text-xs text-muted-foreground">
                      {k.keyPrefix}••••  ·  {k.lastUsedAt ? `used ${new Date(k.lastUsedAt).toLocaleDateString()}` : "never used"}
                    </p>
                  </div>
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => void remove(k.id)} aria-label="Revoke key">
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{newKey ? "Copy your key" : "New access key"}</DialogTitle>
            <DialogDescription>
              {newKey
                ? "This key is shown only once. Anyone with it can push to your repositories."
                : "Name it after the tool you'll use it in."}
            </DialogDescription>
          </DialogHeader>
          {newKey ? (
            <div className="flex items-center gap-2 rounded-md border border-border bg-muted p-2">
              <code className="min-w-0 flex-1 break-all font-mono text-xs">{newKey}</code>
              <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => copy(newKey)} aria-label="Copy key">
                <Copy className="size-3.5" />
              </Button>
            </div>
          ) : (
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Claude" />
          )}
          <DialogFooter>
            {newKey ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : (
              <Button onClick={() => create.mutate()} disabled={create.isPending}>
                {create.isPending && <Loader2 className="size-3.5 animate-spin" />}
                Create key
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
