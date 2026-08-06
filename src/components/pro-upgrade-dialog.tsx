import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { proPriceLocalEquivalent, proPriceNGN } from "@/lib/pricing";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Generic "this is a Pro feature" upsell dialog.
 *
 * Every Pro-gated action (bulk upload, folder upload, ZIP upload, AI tools,
 * etc.) should render this instead of building its own upgrade copy, so the
 * upsell stays visually and verbally consistent across the app. Mirrors the
 * inline upgrade card in `connect-github.tsx`.
 */
export function ProUpgradeDialog({
  open,
  onOpenChange,
  title,
  description,
  features,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  features: string[];
}) {
  const proPrice = proPriceNGN();
  const proPriceLocal = proPriceLocalEquivalent();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <ul className="space-y-2.5">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2 text-sm">
                <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
                <span className="text-foreground">{feature}</span>
              </li>
            ))}
          </ul>
          <Button asChild className="w-full" onClick={() => onOpenChange(false)}>
            <Link to="/pricing">
              <Sparkles className="size-4" />
              Upgrade to GitPush Pro — {proPrice}/mo
              {proPriceLocal ? ` (${proPriceLocal})` : ""}
            </Link>
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
