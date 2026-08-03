import { useEffect, useRef } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Icon-only search trigger that expands into a full search field on tap.
 *
 * Collapsed, it costs almost no vertical space — just a single compact row
 * with a magnifying-glass icon. Tapping it (or focusing it via keyboard)
 * smoothly expands it into the same search experience as `SearchInput`,
 * auto-focuses the field, and shows a clear (✕) button. Collapsing happens
 * by tapping the ✕, pressing Escape, or tapping anywhere outside the field.
 *
 * `expanded` / `onExpandedChange` are controlled by the parent so it can be
 * coordinated with sibling collapsible sections (Recent Files, Favorite
 * Paths) — only one of them stays open at a time.
 */
export function CollapsibleSearch({
  value,
  onValueChange,
  expanded,
  onExpandedChange,
  placeholder,
  className,
}: {
  value: string;
  onValueChange: (next: string) => void;
  expanded: boolean;
  onExpandedChange: (next: boolean) => void;
  placeholder?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the field the moment it expands.
  useEffect(() => {
    if (!expanded) return;
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [expanded]);

  // Tapping anywhere outside the expanded field collapses it back down.
  useEffect(() => {
    if (!expanded) return;
    function handlePointerDown(e: PointerEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        onExpandedChange(false);
      }
    }
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [expanded, onExpandedChange]);

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => onExpandedChange(true)}
        aria-label="Search"
        title="Search"
        className={cn(
          "flex w-full items-center gap-1.5 rounded px-1.5 py-1.5 text-left font-mono text-[11px] text-muted-foreground transition-colors duration-200 ease-in-out hover:bg-secondary/40 hover:text-foreground",
          className,
        )}
      >
        <Search className="size-3.5 shrink-0" />
        Search
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative animate-in duration-200 ease-in-out fade-in zoom-in-95",
        className,
      )}
    >
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        aria-label={placeholder ?? "Search"}
        onChange={(e) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onValueChange("");
            onExpandedChange(false);
          }
        }}
        placeholder={placeholder}
        className="h-8 pl-8 pr-8 font-mono text-xs"
      />
      <button
        type="button"
        aria-label="Clear search"
        title="Clear search"
        onClick={() => {
          onValueChange("");
          onExpandedChange(false);
        }}
        className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground transition-colors duration-200 ease-in-out hover:bg-white/5 hover:text-foreground active:scale-90"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
