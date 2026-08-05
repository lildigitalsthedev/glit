import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { diffLines } from "diff";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { editFileWithAi } from "@/lib/ai.functions";
import { cn } from "@/lib/utils";

const PRESETS = [
  "Make responsive",
  "Convert to TypeScript",
  "Add loading states",
  "Optimize performance",
  "Add error handling",
  "Add JSDoc comments",
];

/**
 * AI file editing (Pro). The user describes a change in plain English; the
 * result is shown as a line diff against the current buffer and only lands
 * in the editor once they explicitly apply it.
 */
export function AiEditDialog({
  open,
  onOpenChange,
  path,
  content,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  content: string;
  onApply: (code: string) => void;
}) {
  const editFn = useServerFn(editFileWithAi);
  const [instruction, setInstruction] = useState("");
  const [result, setResult] = useState("");

  const edit = useMutation({
    mutationFn: () => editFn({ data: { instruction, path, content } }),
    onSuccess: (data) => {
      setResult(data.code);
      toast.success(`Updated with ${data.model}. Review the diff.`);
    },
    onError: (error: Error) => toast.error(error.message || "Edit failed."),
  });

  const diff = useMemo(() => (result ? diffLines(content, result) : []), [content, result]);
  const stats = useMemo(() => {
    let added = 0;
    let removed = 0;
    for (const part of diff) {
      const lines = part.value.replace(/\n$/, "").split("\n").length;
      if (part.added) added += lines;
      if (part.removed) removed += lines;
    }
    return { added, removed };
  }, [diff]);

  function reset() {
    setInstruction("");
    setResult("");
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Edit with AI
          </DialogTitle>
          <DialogDescription>
            <span className="font-mono">{path || "no file selected"}</span> — uses your own AI
            provider (
            <Link to="/settings" search={{ tab: "ai" }} className="underline">
              manage providers
            </Link>
            ).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">What should change?</Label>
            <Textarea
              value={instruction}
              onChange={(e) => setInstruction(e.target.value)}
              placeholder="Make this component responsive and add a loading skeleton."
              className="min-h-20 text-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setInstruction(preset)}
                  className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!instruction.trim() || !content.trim() || edit.isPending}
            onClick={() => edit.mutate()}
          >
            {edit.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            {result ? "Regenerate" : "Propose changes"}
          </Button>

          {result && (
            <div className="space-y-2">
              <p className="label-caps">
                Diff preview · <span className="text-success">+{stats.added}</span>{" "}
                <span className="text-destructive">-{stats.removed}</span>
              </p>
              <pre className="max-h-72 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-[11px] leading-5">
                {diff.map((part, index) => (
                  <div
                    key={index}
                    className={cn(
                      part.added && "bg-success/15 text-success",
                      part.removed && "bg-destructive/15 text-destructive",
                      !part.added && !part.removed && "text-muted-foreground",
                    )}
                  >
                    {part.value.replace(/\n$/, "")}
                  </div>
                ))}
              </pre>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onApply(result);
                  reset();
                  onOpenChange(false);
                }}
              >
                Apply to editor
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}