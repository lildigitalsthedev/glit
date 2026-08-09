import { createFileRoute } from "@tanstack/react-router";
import { useDeferredValue, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Star,
  Plus,
  Loader2,
  Search as SearchIcon,
  Pencil,
  Copy,
  Trash2,
  History,
  Download,
  Upload,
  ClipboardCopy,
  Braces,
  BookOpen,
  MoreVertical,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SearchInput } from "@/components/search-input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  listPrompts,
  createWorkspacePrompt,
  updateWorkspacePrompt,
  deleteWorkspacePrompt,
  duplicateWorkspacePrompt,
  setPromptFavorite,
  listPromptVersions,
  restorePromptVersion,
  importWorkspacePrompts,
  type WorkspacePrompt,
  type PromptVersionRecord,
} from "@/lib/prompts.functions";
import { extractPromptVariables, renderPromptTemplate, KNOWN_PROMPT_VARIABLES } from "@/lib/prompt-template";
import { useWorkspaces } from "@/hooks/useWorkspaces";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/prompts")({
  head: () => ({
    meta: [
      { title: "Prompt Library — GitPush" },
      { name: "description", content: "Shared, reusable AI prompts for your workspace." },
    ],
  }),
  component: PromptLibraryPage,
});

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Highlights `{{variable}}` tokens inside a prompt preview so they read as placeholders rather than plain text. */
function PromptBodyPreview({ body, className }: { body: string; className?: string }) {
  const parts = body.split(/(\{\{\s*[a-zA-Z0-9_]+\s*\}\})/g);
  return (
    <p className={cn("whitespace-pre-wrap break-words", className)}>
      {parts.map((part, i) =>
        /^\{\{\s*[a-zA-Z0-9_]+\s*\}\}$/.test(part) ? (
          <span key={i} className="rounded bg-primary/10 px-1 font-mono text-primary">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </p>
  );
}

interface PromptFormState {
  title: string;
  category: string;
  body: string;
}

const EMPTY_FORM: PromptFormState = { title: "", category: "General", body: "" };

/** Shared create/edit dialog. */
function PromptFormDialog({
  open,
  onOpenChange,
  mode,
  initial,
  categories,
  onSubmit,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  initial: PromptFormState;
  categories: string[];
  onSubmit: (form: PromptFormState) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<PromptFormState>(initial);

  const variables = useMemo(() => extractPromptVariables(form.body), [form.body]);
  const canSubmit = form.title.trim().length > 0 && form.body.trim().length > 0 && !isSaving;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setForm(initial);
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "New prompt" : "Edit prompt"}</DialogTitle>
          <DialogDescription>
            Use <code className="font-mono">{"{{repo}}"}</code>, <code className="font-mono">{"{{branch}}"}</code>,{" "}
            <code className="font-mono">{"{{language}}"}</code> or <code className="font-mono">{"{{feature}}"}</code>{" "}
            — or any <code className="font-mono">{"{{name}}"}</code> you like — as fill-in-the-blank placeholders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Title</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Write a PR description"
              className="text-sm"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Category</Label>
            <Input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="General"
              list="prompt-categories"
              className="text-sm"
            />
            <datalist id="prompt-categories">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Prompt</Label>
            <Textarea
              value={form.body}
              onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
              placeholder={"Summarize the changes on {{branch}} in {{repo}} for a PR description."}
              className="min-h-32 font-mono text-xs"
            />
            {variables.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <Braces className="size-3 text-muted-foreground" />
                {variables.map((v) => (
                  <Badge key={v} variant="secondary" className="font-mono text-[10px]">
                    {`{{${v}}}`}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(form)} disabled={!canSubmit}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            {mode === "create" ? "Create prompt" : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "Fill in the blanks and copy" dialog for actually using a prompt. */
function UsePromptDialog({
  prompt,
  open,
  onOpenChange,
}: {
  prompt: WorkspacePrompt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const variables = prompt ? extractPromptVariables(prompt.body) : [];
  const rendered = prompt ? renderPromptTemplate(prompt.body, values) : "";

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setValues({});
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{prompt?.title}</DialogTitle>
          <DialogDescription>Fill in the placeholders, then copy the finished prompt.</DialogDescription>
        </DialogHeader>

        {variables.length > 0 && (
          <div className="grid grid-cols-2 gap-2">
            {variables.map((v) => (
              <div key={v} className="space-y-1">
                <Label className="font-mono text-[11px] text-muted-foreground">{`{{${v}}}`}</Label>
                <Input
                  value={values[v] ?? ""}
                  onChange={(e) => setValues((prev) => ({ ...prev, [v]: e.target.value }))}
                  className="h-8 text-xs"
                />
              </div>
            ))}
          </div>
        )}

        <div className="rounded-md border border-border bg-secondary/20 p-3">
          <PromptBodyPreview body={rendered} className="text-xs" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            onClick={() => {
              void navigator.clipboard.writeText(rendered);
              toast.success("Copied to clipboard");
              onOpenChange(false);
            }}
          >
            <ClipboardCopy className="size-4" />
            Copy prompt
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function VersionHistoryDrawer({
  prompt,
  open,
  onOpenChange,
  canRestore,
}: {
  prompt: WorkspacePrompt | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canRestore: boolean;
}) {
  const queryClient = useQueryClient();
  const versionsFn = useServerFn(listPromptVersions);
  const restoreFn = useServerFn(restorePromptVersion);

  const versions = useQuery({
    queryKey: ["prompt-versions", prompt?.id],
    queryFn: () => versionsFn({ data: { promptId: prompt!.id } }),
    enabled: open && Boolean(prompt),
  });

  const restore = useMutation({
    mutationFn: (version: number) => restoreFn({ data: { promptId: prompt!.id, version } }),
    onSuccess: () => {
      toast.success("Restored that version");
      void queryClient.invalidateQueries({ queryKey: ["workspace-prompts"] });
      void queryClient.invalidateQueries({ queryKey: ["prompt-versions", prompt?.id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Version history</DrawerTitle>
          <DrawerDescription>{prompt?.title}</DrawerDescription>
        </DrawerHeader>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto px-4 pb-2">
          {versions.isLoading && <Skeleton className="h-16 w-full" />}
          {!versions.isLoading && (versions.data ?? []).length === 0 && (
            <p className="py-4 text-center text-xs text-muted-foreground">
              No edits yet — this prompt hasn't changed since it was created.
            </p>
          )}
          {(versions.data ?? []).map((v: PromptVersionRecord) => (
            <div key={v.id} className="rounded-md border border-border p-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium">
                  v{v.version} · {v.title}
                </span>
                <span className="text-[10px] text-muted-foreground">{timeAgo(v.createdAt)}</span>
              </div>
              <p className="mt-1 line-clamp-2 font-mono text-[11px] text-muted-foreground">{v.body}</p>
              {v.editedBy?.displayName && (
                <p className="mt-1 text-[10px] text-muted-foreground">by {v.editedBy.displayName}</p>
              )}
              {canRestore && (
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 h-7 gap-1 text-[11px]"
                  disabled={restore.isPending}
                  onClick={() => restore.mutate(v.version)}
                >
                  <RotateCcw className="size-3" />
                  Restore this version
                </Button>
              )}
            </div>
          ))}
        </div>

        <DrawerFooter>
          <DrawerClose asChild>
            <Button variant="outline">Close</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function PromptCard({
  prompt,
  canWrite,
  onUse,
  onEdit,
  onDuplicate,
  onDelete,
  onHistory,
  onToggleFavorite,
}: {
  prompt: WorkspacePrompt;
  canWrite: boolean;
  onUse: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onHistory: () => void;
  onToggleFavorite: () => void;
}) {
  const variables = extractPromptVariables(prompt.body);
  return (
    <article className="group flex animate-in fade-in flex-col rounded-md border border-border bg-card p-3 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-md">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-medium">{prompt.title}</h2>
          <Badge variant="secondary" className="mt-1 text-[10px]">
            {prompt.category}
          </Badge>
        </div>
        <button
          onClick={onToggleFavorite}
          aria-label={prompt.isFavoriteForCaller ? "Remove Favorite" : "Favorite"}
          className="transition-transform duration-150 hover:scale-110 active:scale-95"
        >
          <Star
            className={cn(
              "size-3.5",
              prompt.isFavoriteForCaller ? "fill-primary text-primary" : "text-muted-foreground group-hover:text-foreground",
            )}
          />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              aria-label="Prompt actions"
              className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <MoreVertical className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onSelect={onHistory}>
              <History className="size-3.5" />
              Version history
            </DropdownMenuItem>
            {canWrite && (
              <>
                <DropdownMenuItem onSelect={onDuplicate}>
                  <Copy className="size-3.5" />
                  Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={onEdit}>
                  <Pencil className="size-3.5" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onDelete} className="text-destructive focus:bg-destructive/10 focus:text-destructive">
                  <Trash2 className="size-3.5" />
                  Delete
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <PromptBodyPreview body={prompt.body} className="mt-2 line-clamp-3 text-xs text-muted-foreground" />

      {variables.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {variables.map((v) => (
            <span key={v} className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {`{{${v}}}`}
            </span>
          ))}
        </div>
      )}

      <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{prompt.updatedBy?.displayName ?? prompt.createdBy?.displayName ?? "Unknown"}</span>
        <span>{timeAgo(prompt.updatedAt)}</span>
      </div>

      <Button size="sm" className="mt-3" onClick={onUse}>
        Use prompt
      </Button>
    </article>
  );
}

function PromptLibraryPage() {
  const queryClient = useQueryClient();
  const { can, activeWorkspace } = useWorkspaces();
  const canWrite = can("ai:use");

  const listFn = useServerFn(listPrompts);
  const createFn = useServerFn(createWorkspacePrompt);
  const updateFn = useServerFn(updateWorkspacePrompt);
  const deleteFn = useServerFn(deleteWorkspacePrompt);
  const duplicateFn = useServerFn(duplicateWorkspacePrompt);
  const favoriteFn = useServerFn(setPromptFavorite);
  const importFn = useServerFn(importWorkspacePrompts);

  const prompts = useQuery({ queryKey: ["workspace-prompts"], queryFn: () => listFn() });

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"create" | "edit">("create");
  const [editingPrompt, setEditingPrompt] = useState<WorkspacePrompt | null>(null);
  const [useTarget, setUseTarget] = useState<WorkspacePrompt | null>(null);
  const [historyTarget, setHistoryTarget] = useState<WorkspacePrompt | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkspacePrompt | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["workspace-prompts"] });

  const createMutation = useMutation({
    mutationFn: (form: PromptFormState) => createFn({ data: form }),
    onSuccess: () => {
      toast.success("Prompt created");
      setFormOpen(false);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateMutation = useMutation({
    mutationFn: (form: PromptFormState) => updateFn({ data: { promptId: editingPrompt!.id, ...form } }),
    onSuccess: () => {
      toast.success("Prompt updated");
      setFormOpen(false);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (promptId: string) => deleteFn({ data: { promptId } }),
    onSuccess: () => {
      toast.success("Prompt deleted");
      setDeleteTarget(null);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const duplicateMutation = useMutation({
    mutationFn: (promptId: string) => duplicateFn({ data: { promptId } }),
    onSuccess: () => {
      toast.success("Duplicated");
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const favoriteMutation = useMutation({
    mutationFn: (prompt: WorkspacePrompt) =>
      favoriteFn({ data: { promptId: prompt.id, isFavorite: !prompt.isFavoriteForCaller } }),
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const importMutation = useMutation({
    mutationFn: (parsed: { title: string; category?: string; body: string }[]) =>
      importFn({ data: { prompts: parsed } }),
    onSuccess: (result) => {
      toast.success(`Imported ${result.imported} prompt${result.imported === 1 ? "" : "s"}${result.skipped ? ` (${result.skipped} skipped)` : ""}`);
      void invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const categories = useMemo(
    () => Array.from(new Set((prompts.data ?? []).map((p) => p.category))).sort(),
    [prompts.data],
  );

  const deferredQuery = useDeferredValue(query);
  const filtered = (prompts.data ?? [])
    .filter((p) => (onlyFavorites ? p.isFavoriteForCaller : true))
    .filter((p) => (category === "all" ? true : p.category === category))
    .filter((p) => {
      const q = deferredQuery.toLowerCase();
      if (!q) return true;
      return p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    });

  function handleExport() {
    const payload = {
      workspace: activeWorkspace?.name ?? "GitPush",
      exportedAt: new Date().toISOString(),
      prompts: (prompts.data ?? []).map((p) => ({ title: p.title, category: p.category, body: p.body })),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `gitpush-prompts-${(activeWorkspace?.name ?? "workspace").toLowerCase().replace(/\s+/g, "-")}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleImportFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const list = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.prompts) ? parsed.prompts : null;
        if (!list) throw new Error("not an array");
        importMutation.mutate(list);
      } catch {
        toast.error("That file doesn't look like a GitPush prompt export.");
      }
    };
    reader.onerror = () => toast.error("Couldn't read that file.");
    reader.readAsText(file);
  }

  return (
    <main className="mx-auto max-w-6xl px-3 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="flex items-center gap-1.5 text-base font-semibold tracking-tight">
            <BookOpen className="size-4" />
            Prompt Library
          </h1>
          <p className="text-xs text-muted-foreground">
            Shared with everyone in {activeWorkspace?.name ?? "this workspace"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={importInputRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImportFile(file);
              e.target.value = "";
            }}
          />
          {canWrite && (
            <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}>
              <Upload className="size-3.5" />
              Import
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleExport} disabled={(prompts.data ?? []).length === 0}>
            <Download className="size-3.5" />
            Export
          </Button>
          {canWrite && (
            <Button
              size="sm"
              onClick={() => {
                setFormMode("create");
                setEditingPrompt(null);
                setFormOpen(true);
              }}
            >
              <Plus className="size-3.5" />
              New prompt
            </Button>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Search prompts…"
          className="min-w-56 flex-1"
          inputClassName="h-9 text-xs"
        />
        <Button variant={onlyFavorites ? "default" : "outline"} size="sm" onClick={() => setOnlyFavorites((v) => !v)}>
          <Star className="size-3.5" />
          Favorites
        </Button>
      </div>

      {categories.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            onClick={() => setCategory("all")}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
              category === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] transition-colors",
                category === c
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:bg-secondary",
              )}
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {prompts.isLoading && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 w-full" />
          ))}
        </div>
      )}

      {!prompts.isLoading && filtered.length === 0 && (
        <EmptyState
          className="mt-6"
          size="compact"
          icon={SearchIcon}
          title="No prompts match."
          description={
            (prompts.data ?? []).length === 0
              ? canWrite
                ? "Create your workspace's first shared prompt, or import a JSON export."
                : "No one has added a prompt to this workspace yet."
              : "Try a different search term, category, or clear the favorites filter."
          }
        />
      )}

      {filtered.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((prompt) => (
            <PromptCard
              key={prompt.id}
              prompt={prompt}
              canWrite={canWrite}
              onUse={() => setUseTarget(prompt)}
              onEdit={() => {
                setFormMode("edit");
                setEditingPrompt(prompt);
                setFormOpen(true);
              }}
              onDuplicate={() => duplicateMutation.mutate(prompt.id)}
              onDelete={() => setDeleteTarget(prompt)}
              onHistory={() => setHistoryTarget(prompt)}
              onToggleFavorite={() => favoriteMutation.mutate(prompt)}
            />
          ))}
        </div>
      )}

      <PromptFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        mode={formMode}
        initial={formMode === "edit" && editingPrompt ? editingPrompt : EMPTY_FORM}
        categories={categories}
        isSaving={createMutation.isPending || updateMutation.isPending}
        onSubmit={(form) => (formMode === "create" ? createMutation.mutate(form) : updateMutation.mutate(form))}
      />

      <UsePromptDialog prompt={useTarget} open={Boolean(useTarget)} onOpenChange={(open) => !open && setUseTarget(null)} />

      <VersionHistoryDrawer
        prompt={historyTarget}
        open={Boolean(historyTarget)}
        onOpenChange={(open) => !open && setHistoryTarget(null)}
        canRestore={canWrite}
      />

      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{deleteTarget?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the prompt and its version history for everyone in the workspace. This can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteMutation.isPending}
              onClick={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
            >
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
