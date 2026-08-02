import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronUp, ChevronDown, LayoutGrid, Code2, History, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/app", label: "Repos", icon: LayoutGrid },
  { to: "/workspace", label: "Workspace", icon: Code2 },
  { to: "/activity", label: "Activity", icon: History },
  { to: "/profile", label: "Profile", icon: UserRound },
] as const;

// Reserved viewport space (bottom-safe area + dock height + margin). These are
// mirrored via the `--dock-space` CSS variable so any page — including the
// workspace's fixed-height three-pane layout — can subtract the right amount
// of space and never sit underneath the floating dock.
const EXPANDED_SPACE = "7rem";
const COLLAPSED_SPACE = "3.5rem";
const STORAGE_KEY = "gitpush:dock-collapsed";

export function BottomDock() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Restore the user's last collapse preference after mount so server-rendered
  // markup always matches the expanded default (avoids hydration mismatches).
  useEffect(() => {
    setMounted(true);
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === "1") setCollapsed(true);
    } catch {
      // localStorage may be unavailable (private mode, etc.) — safe to ignore.
    }
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty(
      "--dock-space",
      collapsed ? COLLAPSED_SPACE : EXPANDED_SPACE,
    );
    try {
      window.localStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
      // Ignore storage failures — collapse state simply won't persist.
    }
  }, [collapsed]);

  useEffect(() => {
    return () => {
      document.documentElement.style.removeProperty("--dock-space");
    };
  }, []);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className={cn(
          "pointer-events-auto flex flex-col items-center transition-opacity duration-300",
          mounted ? "opacity-100" : "opacity-0",
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Show navigation"
            className="flex size-10 animate-in items-center justify-center rounded-full border border-border bg-card/95 text-foreground shadow-lg shadow-black/20 backdrop-blur-xl duration-200 fade-in zoom-in-95 hover:scale-105 hover:bg-secondary active:scale-95"
          >
            <ChevronUp className="size-4" />
          </button>
        ) : (
          <div className="relative animate-in duration-300 fade-in slide-in-from-bottom-3">
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse navigation"
              className="absolute -top-3 left-1/2 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-md transition-all duration-200 hover:bg-secondary hover:text-foreground active:scale-90"
            >
              <ChevronDown className="size-3.5" />
            </button>

            <nav
              aria-label="Primary"
              className="flex items-center gap-1 rounded-full border border-border bg-card/95 p-1.5 shadow-2xl shadow-black/30 backdrop-blur-xl sm:gap-1.5 sm:p-2"
            >
              {NAV.map((item) => {
                const active = pathname === item.to;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-w-14 flex-col items-center gap-0.5 rounded-full px-3.5 py-2 font-mono text-[10px] transition-all duration-200 sm:min-w-16 sm:px-4",
                      active
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    )}
                  >
                    <item.icon
                      className={cn(
                        "size-4 transition-transform duration-200",
                        active ? "scale-110" : "group-hover:scale-105",
                      )}
                    />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    </div>
  );
}
