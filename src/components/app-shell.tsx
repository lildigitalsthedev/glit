import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Terminal, LogOut, LayoutGrid, Code2, History } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "repos", icon: LayoutGrid },
  { to: "/workspace", label: "workspace", icon: Code2 },
  { to: "/activity", label: "activity", icon: History },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur">
        <div className="flex h-12 items-center gap-6 px-4">
          <Link to="/app" className="flex items-center gap-2 font-mono text-sm font-semibold">
            <Terminal className="size-4 text-primary" />
            gitpush
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors",
                  pathname === item.to
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <item.icon className="size-3.5" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                void navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-3.5" />
              <span className="sr-only">Sign out</span>
            </Button>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}