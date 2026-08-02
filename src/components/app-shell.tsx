import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Terminal } from "lucide-react";
import { BottomDock } from "@/components/bottom-dock";
import { NavPrefsProvider } from "@/hooks/useNavPrefs";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <NavPrefsProvider>
      <div className="flex min-h-screen flex-col">
        <header
          className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur transition-shadow"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          <div className="flex h-12 items-center px-4">
            <Link
              to="/app"
              className="flex items-center gap-2 font-mono text-sm font-semibold transition-opacity hover:opacity-80"
            >
              <Terminal className="size-4 text-primary" />
              gitpush
            </Link>
          </div>
        </header>

        {/* Primary navigation lives in the customizable nav bar, which can be
            docked to the bottom, floating, or rigged as a left/right rail.
            It reserves its own space via the `--dock-space` /
            `--dock-inset-left` / `--dock-inset-right` CSS variables so normal-
            flow pages never render content underneath or behind it. */}
        <div
          className="flex-1"
          style={{
            paddingBottom: "var(--dock-space, 7rem)",
            paddingLeft: "var(--dock-inset-left, 0px)",
            paddingRight: "var(--dock-inset-right, 0px)",
          }}
        >
          {children}
        </div>

        <BottomDock />
      </div>
    </NavPrefsProvider>
  );
}
