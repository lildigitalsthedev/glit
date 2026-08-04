import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { generateCode } from "@/lib/ai.functions";

const EXAMPLES = [
  "Create a ProductCard component",
  "Create an Express API route for orders",
  "Create a Next.js page with metadata",
  "Write a Vitest suite for this util",
];

/**
 * AI code generation (Pro). Describe a file in plain English, review the
 * generated code, then drop it into the Monaco editor — nothing is pushed to
 * GitHub until the user commits, so every generation is reviewable.
 */
export function AiGenerateDialog({
  open,
  onOpenChange,
  path,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  path: string;
  onApply: (result: { path: string; code: string }) => void;
}) {
  const generateFn = useServerFn(generateCode);
  const [prompt, setPrompt] = useState("");
  const [targetPath, setTargetPath] = useState(path);
  const [code, setCode] = useState("");

  const generate = useMutation({
    mutationFn: () =>
      generateFn({ data: { prompt, path: targetPath || path || undefined } }),
    onSuccess: (result) => {
      setCode(result.code);
      toast.success(`Generated with ${result.model}.`);
    },
    onError: (error: Error) => toast.error(error.message || "Generation failed."),
  });

  function reset() {
    setPrompt("");
    setCode("");
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
            Generate code
          </DialogTitle>
          <DialogDescription>
            Uses your own AI provider. Review the result before it goes into the editor —{" "}
            <Link to="/profile" className="underline">
              manage providers
            </Link>
            .
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">File path</Label>
            <Input
              value={targetPath}
              onChange={(e) => setTargetPath(e.target.value)}
              placeholder="src/components/ProductCard.tsx"
              className="h-9 font-mono text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">What should it do?</Label>
            <Textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Create a ProductCard component with image, title, price and an add-to-cart button."
              className="min-h-24 text-xs"
            />
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setPrompt(example)}
                  className="rounded border border-border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-secondary/40 hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!prompt.trim() || generate.isPending}
            onClick={() => generate.mutate()}
          >
            {generate.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wand2 className="size-4" />
            )}
            {code ? "Regenerate" : "Generate"}
          </Button>

          {code && (
            <div className="space-y-2">
              <p className="label-caps">Preview</p>
              <pre className="max-h-72 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-[11px] leading-5">
                {code}
              </pre>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  onApply({ path: targetPath.trim(), code });
                  reset();
                  onOpenChange(false);
                }}
              >
                Insert into editor
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}