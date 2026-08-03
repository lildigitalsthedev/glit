import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Floating search popup shown below the Tools row. Unlike the shared
 * `SearchInput` used elsewhere in the app, this one lives inside a
 * `ToolPopup` shell (see `workspace-tools.tsx`) — it never pushes the rest
 * of the sidebar or the editor down, it just floats above it.
 *
 * Typing filters the file tree live (the parent's `onValueChange` is the
 * single source of truth, same as before). Pressing Enter or tapping the
 * search icon "submits" — which simply closes the popup, since the results
 * are already visible in the tree underneath. The ✕ clears the query and
 * closes the popup in one tap.
 */
export function SearchPopup({
  value,
  onValueChange,
  onClose,
  placeholder,
  className,
}: {
  value: string;
  onValueChange: (next: string) => void;
  onClose: () => void;
  placeholder?: string;
  className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  // Autofocus (and pop the on-screen keyboard on mobile) the instant the
  // popup mounts.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onClose();
            }
          }}
          placeholder={placeholder ?? "Search files…"}
          aria-label={placeholder ?? "Search files"}
          className="h-8 w-full rounded-md border border-input bg-transparent pl-8 pr-2 font-mono text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>
      <button
        type="button"
        aria-label="Run search"
        title="Search"
        onClick={onClose}
        className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground active:scale-95"
      >
        <Search className="size-3.5" />
      </button>
      <button
        type="button"
        aria-label="Close search"
        title="Close"
        onClick={() => {
          onValueChange("");
          onClose();
        }}
        className="flex size-8 shrink-0 items-center justify-center rounded-md border border-input text-muted-foreground transition-colors duration-150 hover:bg-secondary hover:text-foreground active:scale-95"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
