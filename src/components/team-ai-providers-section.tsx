import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Check, Loader2, Pencil, Plug, Sparkles, Trash2, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AI_PROVIDERS, providerLabel, providerMeta, type ProviderId } from "@/lib/ai/catalog";
import {
  deleteTeamAiProvider,
  listTeamAiProviders,
  saveTeamAiProvider,
  setDefaultTeamAiProvider,
  setTeamAiProviderEnabled,
  testTeamAiProvider,
  type TeamProviderRow,
} from "@/lib/team-ai-providers.functions";
import { usePlan } from "@/hooks/usePlan";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { cn } from "@/lib/utils";

/**
 * Feature 8: Team API Key Management. One shared key per provider for the
 * whole workspace — added once by an Owner/Admin, usable by every Developer
 * for AI tools without ever seeing the plaintext. Viewers get nothing:
 * `can("keys:use")` is false for them, so this returns `null` before
 * rendering anything, matching "Viewers: No access" rather than showing a
 * disabled or locked-looking section.
 */
export function TeamAiProvidersSection() {
  const queryClient = useQueryClient();
  const { isPro } = usePlan();
  const { can, activeWorkspace } = useWorkspaces();
  const canManage = can("keys:manage");
  const canUse = can("keys:use");

  const listFn = useServerFn(listTeamAiProviders);
  const saveFn = useServerFn(saveTeamAiProvider);
  const enableFn = useServerFn(setTeamAiProviderEnabled);
  const defaultFn = useServerFn(setDefaultTeamAiProvider);
  const deleteFn = useServerFn(deleteTeamAiProvider);
  const testFn = useServerFn(testTeamAiProvider);

  const providers = useQuery({
    queryKey: ["team-ai-providers"],
    queryFn: () => listFn(),
    enabled: isPro && canUse,
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamProviderRow | null>(null);
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [apiKey, setApiKey] = useState("");
  const [label, setLabel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<TeamProviderRow | null>(null);

  const meta = providerMeta(provider);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["team-ai-providers"] });

  function openAdd() {
    setEditing(null);
    setProvider("openai");
    setApiKey("");
    setLabel("");
    setBaseUrl("");
    setModel("");
    setDialogOpen(true);
  }

  function openEdit(row: TeamProviderRow) {
    setEditing(row);
    setProvider(row.provider as ProviderId);
    setApiKey("");
    setLabel(row.label ?? "");
    setBaseUrl(row.baseUrl ?? "");
    setModel(row.model ?? "");
    setDialogOpen(true);
  }

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          provider,
          apiKey: apiKey.trim() || undefined,
          label: label.trim() || null,
          baseUrl: baseUrl.trim() || meta?.baseUrl || null,
          model: model.trim() || meta?.defaultModel || null,
          ...(editing ? {} : { enabled: true }),
        },
      }),
    onSuccess: () => {
      toast.success(editing ? `${providerLabel(provider)} key updated.` : `${providerLabel(provider)} added for the team.`);
      setDialogOpen(false);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't save that key."),
  });

  function toggle(row: TeamProviderRow, enabled: boolean) {
    enableFn({ data: { id: row.id, provider: row.provider, enabled } })
      .then(invalidate)
      .catch((error: Error) => toast.error(error.message));
  }

  function makeDefault(id: string) {
    defaultFn({ data: { id } })
      .then(() => {
        toast.success("Default team provider updated.");
        invalidate();
      })
      .catch((error: Error) => toast.error(error.message));
  }

  function confirmRemove() {
    if (!removing) return;
    deleteFn({ data: { id: removing.id, provider: removing.provider } })
      .then(() => {
        toast.success("Team key removed.");
        setRemoving(null);
        invalidate();
      })
      .catch((error: Error) => toast.error(error.message));
  }

  function test(id: string) {
    setTestingId(id);
    testFn({ data: { id } })
      .then((result) => toast.success(`Key works — ${result.model} replied.`))
      .catch((error: Error) => toast.error(error.message || "That key didn't work."))
      .finally(() => setTestingId(null));
  }

  if (!canUse) return null;

  const rows = providers.data ?? [];
  const used = new Set(rows.map((row) => row.provider));

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Users className="size-4 text-primary" />
            Team AI providers
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {activeWorkspace?.isPersonal
              ? "Shared keys apply once you're in a team workspace."
              : "One key per provider, shared across the whole workspace. Developers can use these; only Owners and Admins manage them."}
          </p>
        </div>
        {isPro && canManage && (
          <Button size="sm" variant="outline" onClick={openAdd}>
            <Plug className="size-3.5" />
            Add team key
          </Button>
        )}
      </div>

      {!isPro ? (
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm">
            <Sparkles className="mr-1.5 inline size-3.5 text-primary" />
            Shared team AI keys are a GitPush Pro feature — add one key per provider once, and
            every Developer in the workspace can use it.
          </p>
        </div>
      ) : providers.isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading team providers…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 rounded-md border border-border bg-card p-4 text-xs text-muted-foreground">
          {canManage
            ? "No shared keys yet. Add one so your team's Developers don't need their own."
            : "No shared keys yet. Ask a workspace Owner or Admin to add one."}
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {rows.map((row) => (
            <li
              key={row.id}
              className={cn(
                "flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3",
                row.isDefault && "border-primary/40",
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm">
                  <Bot className="size-3.5 shrink-0 text-muted-foreground" />
                  {row.label?.trim() || providerLabel(row.provider)}
                  {row.isDefault && (
                    <Badge variant="secondary" className="text-[10px]">
                      Default
                    </Badge>
                  )}
                  {!row.enabled && (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">
                      Disabled
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {row.keyHint} · {row.model ?? providerMeta(row.provider)?.defaultModel ?? "—"}
                </p>
                {row.createdBy?.displayName && (
                  <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                    Added by {row.createdBy.displayName}
                  </p>
                )}
              </div>

              {canManage ? (
                <div className="flex items-center gap-1.5">
                  <Switch
                    checked={row.enabled}
                    onCheckedChange={(next) => toggle(row, next)}
                    aria-label={`Enable ${providerLabel(row.provider)}`}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Test key"
                    title="Test key"
                    disabled={testingId === row.id}
                    onClick={() => test(row.id)}
                  >
                    {testingId === row.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Zap className="size-3.5" />
                    )}
                  </Button>
                  {!row.isDefault && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      aria-label="Make default"
                      title="Make default"
                      onClick={() => makeDefault(row.id)}
                    >
                      <Check className="size-3.5" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    aria-label="Edit key"
                    title="Edit"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil className="size-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8 text-destructive"
                    aria-label="Remove team key"
                    title="Remove"
                    onClick={() => setRemoving(row)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              ) : (
                <Badge variant="outline" className="text-[10px] text-muted-foreground">
                  {row.enabled ? "Available to use" : "Disabled"}
                </Badge>
              )}
            </li>
          ))}
        </ul>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${providerLabel(provider)}` : "Add a team key"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Leave the API key blank to keep the current one. The key is validated against the provider before saving whenever you set a new one."
                : "Shared with every Developer in this workspace. The key is validated against the provider — and encrypted — before it's saved."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Provider</Label>
              <Select
                value={provider}
                onValueChange={(next) => setProvider(next as ProviderId)}
                disabled={Boolean(editing)}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((item) => (
                    <SelectItem
                      key={item.id}
                      value={item.id}
                      className="text-xs"
                      disabled={!editing && used.has(item.id)}
                    >
                      {item.label}
                      {used.has(item.id) ? " (already added)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Label (optional)</Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Team OpenAI key"
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                API key {editing ? "(leave blank to keep current)" : ""}
              </Label>
              <Input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={meta?.keyPlaceholder ?? "..."}
                className="h-9 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">
                Base URL {meta?.requiresBaseUrl ? "(required)" : "(optional)"}
              </Label>
              <Input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder={meta?.baseUrl || "https://your-endpoint/v1"}
                className="h-9 font-mono text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Model (optional)</Label>
              <Input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder={meta?.defaultModel || "model-name"}
                className="h-9 font-mono text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              className="w-full"
              disabled={
                (!editing && !apiKey.trim()) ||
                save.isPending ||
                (Boolean(meta?.requiresBaseUrl) && !baseUrl.trim())
              }
              onClick={() => save.mutate()}
            >
              {save.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plug className="size-4" />
              )}
              {save.isPending ? "Validating key…" : editing ? "Save changes" : "Add team key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(removing)} onOpenChange={(open) => !open && setRemoving(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this team key?</AlertDialogTitle>
            <AlertDialogDescription>
              {removing ? providerLabel(removing.provider) : "This key"} will stop working for
              every Developer in this workspace immediately. This can't be undone — you'll need to
              re-add and re-validate the key to restore access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmRemove}
            >
              Remove key
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
