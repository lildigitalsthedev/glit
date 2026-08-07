import { Link } from "@tanstack/react-router";
import { LayoutGrid, Code2, History, Settings, Sparkles, Crown, Wrench, Users } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { WorkspaceSwitcher } from "@/components/workspace-switcher";
import { useRole } from "@/hooks/useRole";
import { cn } from "@/lib/utils";

const PRIMARY = [
  { to: "/app", label: "Repositories", icon: LayoutGrid },
  { to: "/workspace", label: "Workspace", icon: Code2 },
  { to: "/activity", label: "Activity", icon: History },
  { to: "/team", label: "Team & workspaces", icon: Users },
] as const;

const ACCOUNT = [
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/pricing", label: "Plan & pricing", icon: Sparkles },
] as const;

/**
 * Left navigation drawer, opened by tapping the GitPush logo in the header.
 * Holds the full navigation map — including the secondary destinations that
 * used to need their own header real estate — so the header itself can stay
 * a single slim row.
 */
export function NavDrawer({
  open,
  onOpenChange,
  pathname,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pathname: string;
}) {
  const { isOwner, isDeveloper } = useRole();

  const staff = [
    ...(isOwner ? ([{ to: "/owner", label: "Owner dashboard", icon: Crown }] as const) : []),
    ...(isDeveloper ? ([{ to: "/developer", label: "Developer tools", icon: Wrench }] as const) : []),
  ];

  function renderGroup(label: string, items: readonly { to: string; label: string; icon: typeof LayoutGrid }[]) {
    if (items.length === 0) return null;
    return (
      <div className="mt-4 first:mt-0">
        <p className="label-caps px-2 text-muted-foreground">{label}</p>
        <nav className="mt-1 flex flex-col gap-0.5">
          {items.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => onOpenChange(false)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors duration-150",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                <item.icon className={cn("size-4", active && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-72 p-4">
        <SheetHeader className="space-y-0 text-left">
          <SheetTitle className="font-mono text-sm">gitpush</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <WorkspaceSwitcher onNavigate={() => onOpenChange(false)} />
        </div>
        <div className="mt-4">
          {renderGroup("Navigate", PRIMARY)}
          {renderGroup("Account", ACCOUNT)}
          {renderGroup("Staff", staff)}
        </div>
      </SheetContent>
    </Sheet>
  );
}
