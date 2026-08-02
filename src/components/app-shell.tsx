import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Terminal } from "lucide-react";
import { BottomDock } from "@/components/bottom-dock";

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur transition-shadow">
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

      {/* Primary navigation now lives in the floating bottom dock. The dock
          reserves its own space via the `--dock-space` CSS variable so
          normal-flow pages never render content underneath it. */}
      <div className="flex-1 pb-[var(--dock-space,7rem)]">{children}</div>

      <BottomDock />
    </div>
  );
}
