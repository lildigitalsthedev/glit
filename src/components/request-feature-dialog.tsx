import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Lightbulb, Loader2, Send, Sparkles } from "lucide-react";
import { submitFeatureRequest } from "@/lib/feature-requests.functions";
import { useAuth } from "@/hooks/useAuth";
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
  DialogTrigger,
} from "@/components/ui/dialog";

export function RequestFeatureDialog({ trigger }: { trigger?: React.ReactNode }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState(user?.email ?? "");
  const [feature, setFeature] = useState("");
  const submitFn = useServerFn(submitFeatureRequest);

  const submit = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          gitpushUsername: username.trim(),
          email: email.trim(),
          feature: feature.trim(),
        },
      }),
    onSuccess: () => {
      toast.success("Feature request sent — thanks for the idea!");
      setFeature("");
      setOpen(false);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const canSubmit = Boolean(username.trim() && email.trim() && feature.trim()) && !submit.isPending;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <Lightbulb className="size-4" />
            Request a feature
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lightbulb className="size-4 text-primary" />
            Request a feature
          </DialogTitle>
          <DialogDescription>
            Tell us what you&apos;d like GitPush to do. If we build it, you get 1 year of free
            access to it — even if it ships as a Pro feature.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="feature-username">GitPush username</Label>
            <Input
              id="feature-username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="How you're known on GitPush"
              autoComplete="off"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="feature-email">Email</Label>
            <Input
              id="feature-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
            <p className="text-xs text-muted-foreground">
              We&apos;ll use this to reach you if this ships.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feature-desc">Feature you&apos;d like to see</Label>
            <Textarea
              id="feature-desc"
              value={feature}
              onChange={(e) => setFeature(e.target.value)}
              placeholder="What should GitPush do that it doesn't today?"
              className="min-h-28"
              maxLength={2000}
            />
          </div>

          <Button className="w-full" disabled={!canSubmit} onClick={() => submit.mutate()}>
            {submit.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Submit request
          </Button>

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <Sparkles className="size-3 shrink-0 text-primary" />
            Premium features you request get 1 year of GitPush Pro access, free, if we ship them.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
