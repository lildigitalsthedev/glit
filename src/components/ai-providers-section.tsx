import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Check, Loader2, Plug, Sparkles, Trash2, Zap } from "lucide-react";
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
import { AI_PROVIDERS, providerLabel, providerMeta, type ProviderId } from "@/lib/ai/catalog";
import {
  deleteAiProvider,
  listAiProviders,
  saveAiProvider,
  setAiProviderEnabled,
  setDefaultAiProvider,
  testAiProvider,
} from "@/lib/ai.functions";
import { usePlan } from "@/hooks/usePlan";
import { cn } from "@/lib/utils";

/**
 * "Bring Your Own AI" settings. Users paste their own provider API keys,
 * which are encrypted server-side and never sent back to the browser — the
 * list here only ever shows a masked hint. Providers can be switched on/off
 * individually, and exactly one is the default used by the AI tools.
 */
export function AiProvidersSection() {
  const queryClient = useQueryClient();
  const { isPro } = usePlan();
  const listFn = useServerFn(listAiProviders);
  const saveFn = useServerFn(saveAiProvider);
  const enableFn = useServerFn(setAiProviderEnabled);
  const defaultFn = useServerFn(setDefaultAiProvider);
  const deleteFn = useServerFn(deleteAiProvider);
  const testFn = useServerFn(testAiProvider);

  const providers = useQuery({
    queryKey: ["ai-providers"],
    queryFn: () => listFn(),
    enabled: isPro,
  });

  const [addOpen, setAddOpen] = useState(false);
  const [provider, setProvider] = useState<ProviderId>("openai");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const meta = providerMeta(provider);
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["ai-providers"] });

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          provider,
          apiKey: apiKey.trim(),
          baseUrl: baseUrl.trim() || meta?.baseUrl || null,
          model: model.trim() || meta?.defaultModel || null,
          enabled: true,
        },
      }),
    onSuccess: () => {
      toast.success(`${providerLabel(provider)} connected.`);
      setAddOpen(false);
      setApiKey("");
      setBaseUrl("");
      setModel("");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message || "Couldn't save that provider."),
  });

  function toggle(providerId: string, enabled: boolean) {
    enableFn({ data: { provider: providerId, enabled } })
      .then(invalidate)
      .catch((error: Error) => toast.error(error.message));
  }

  function makeDefault(id: string) {
    defaultFn({ data: { id } })
      .then(() => {
        toast.success("Default provider updated.");
        invalidate();
      })
      .catch((error: Error) => toast.error(error.message));
  }

  function remove(id: string) {
    deleteFn({ data: { id } })
      .then(() => {
        toast.success("Provider removed.");
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

  const rows = providers.data ?? [];
  const used = new Set(rows.map((row) => row.provider));

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-medium">
            <Bot className="size-4 text-primary" />
            AI providers
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Bring your own API keys. Keys are encrypted and never leave the server.
          </p>
        </div>
        {isPro && (
          <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
            <Plug className="size-3.5" />
            Add provider
          </Button>
        )}
      </div>

      {!isPro ? (
        <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-4">
          <p className="text-sm">
            <Sparkles className="mr-1.5 inline size-3.5 text-primary" />
            Bring Your Own AI is a GitPush Pro feature — connect OpenAI, Claude, Gemini, xAI,
            OpenRouter, DeepSeek, Mistral, Together AI or any OpenAI-compatible endpoint.
          </p>
        </div>
      ) : providers.isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Loading providers…
        </div>
      ) : rows.length === 0 ? (
        <p className="mt-3 rounded-md border border-border bg-card p-4 text-xs text-muted-foreground">
          No providers connected yet. Add one to unlock AI code generation and AI file editing.
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
                  {providerLabel(row.provider)}
                  {row.isDefault && (
                    <Badge variant="secondary" className="text-[10px]">
                      Default
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                  {row.keyHint} · {row.model ?? providerMeta(row.provider)?.defaultModel ?? "—"}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Switch
                  checked={row.enabled}
                  onCheckedChange={(next) => toggle(row.provider, next)}
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
                  className="size-8 text-destructive"
                  aria-label="Remove provider"
                  title="Remove provider"
                  onClick={() => remove(row.id)}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Connect an AI provider</DialogTitle>
            <DialogDescription>
              Your key is encrypted before it's stored and is only ever used server-side.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Provider</Label>
              <Select value={provider} onValueChange={(next) => setProvider(next as ProviderId)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AI_PROVIDERS.map((item) => (
                    <SelectItem key={item.id} value={item.id} className="text-xs">
                      {item.label}
                      {used.has(item.id) ? " (connected)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">API key</Label>
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
                !apiKey.trim() ||
                save.isPending ||
                (Boolean(meta?.requiresBaseUrl) && !baseUrl.trim())
              }
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
              Save provider
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}