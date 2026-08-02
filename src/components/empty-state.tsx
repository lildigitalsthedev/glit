import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  size?: "default" | "compact";
  className?: string;
}

/**
 * Friendly, consistent empty state used across the workspace whenever
 * there's nothing to show yet — no repository selected, no file open,
 * no search results, etc. Mirrors the icon-in-a-box pattern already used
 * on the dashboard's "Connect GitHub to start" screen.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  size = "default",
  className,
}: EmptyStateProps) {
  const isCompact = size === "compact";

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-300",
        isCompact ? "gap-1 px-4 py-8" : "gap-0 px-6 py-16",
        className,
      )}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-border bg-card text-primary transition-transform duration-300",
          isCompact ? "size-8" : "size-12",
        )}
      >
        <Icon className={isCompact ? "size-3.5" : "size-5"} />
      </div>
      <p
        className={cn(
          "font-medium tracking-tight text-foreground",
          isCompact ? "mt-2.5 text-xs" : "mt-5 text-base",
        )}
      >
        {title}
      </p>
      {description && (
        <p
          className={cn(
            "text-muted-foreground",
            isCompact ? "mt-1 max-w-[220px] text-[11px]" : "mt-2 max-w-sm text-sm",
          )}
        >
          {description}
        </p>
      )}
      {action && <div className={isCompact ? "mt-3" : "mt-6"}>{action}</div>}
    </div>
  );
}
