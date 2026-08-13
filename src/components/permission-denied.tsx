import { ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKSPACE_ROLE_LABELS, type WorkspaceRole } from "@/lib/workspaces/permissions";

interface PermissionDeniedProps {
  /** What the person was trying to do, e.g. "manage invitations". */
  action?: string;
  /** Roles that *can* do this, shown as a hint (e.g. ["owner", "admin"]). */
  allowedRoles?: readonly WorkspaceRole[];
  size?: "default" | "compact";
  className?: string;
}

/**
 * Shown in place of a gated section instead of a plain sentence, so
 * "you can't do this here" reads the same everywhere in the app — same
 * icon-in-a-box shape as EmptyState, just with a locked/denied tone.
 */
export function PermissionDenied({
  action = "do this",
  allowedRoles,
  size = "default",
  className,
}: PermissionDeniedProps) {
  const isCompact = size === "compact";
  const roleHint =
    allowedRoles && allowedRoles.length > 0
      ? allowedRoles.map((role) => WORKSPACE_ROLE_LABELS[role]).join(" and ")
      : null;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center animate-in fade-in zoom-in-95 duration-300",
        isCompact ? "gap-1 px-4 py-6" : "gap-0 px-6 py-12",
        className,
      )}
      role="status"
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-md border border-border bg-card text-muted-foreground",
          isCompact ? "size-8" : "size-12",
        )}
      >
        <ShieldAlert className={isCompact ? "size-3.5" : "size-5"} />
      </div>
      <p
        className={cn(
          "font-medium tracking-tight text-foreground",
          isCompact ? "mt-2.5 text-xs" : "mt-5 text-base",
        )}
      >
        You don't have permission to {action}
      </p>
      {roleHint && (
        <p
          className={cn(
            "text-muted-foreground",
            isCompact ? "mt-1 max-w-[240px] text-[11px]" : "mt-2 max-w-sm text-sm",
          )}
        >
          Only the {roleHint} of this workspace can do that.
        </p>
      )}
    </div>
  );
}
