import { forwardRef, useImperativeHandle, useRef, type ChangeEvent } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Shared search field used by every searchable list in GitPush.
 *
 * Adds a clear (✕) affordance that only renders while the field has text —
 * tapping it wipes the query, resets the results immediately (the parent's
 * state is the single source of truth) and keeps the caret inside the input
 * so the user can keep typing without a second tap.
 *
 * Forwards its ref to the underlying `<input>` so pages can wire up
 * keyboard shortcuts like "press / to search" without owning the field.
 */
export const SearchInput = forwardRef<
  HTMLInputElement,
  {
    value: string;
    onValueChange: (next: string) => void;
    placeholder?: string;
    className?: string;
    inputClassName?: string;
    ariaLabel?: string;
  }
>(function SearchInput({ value, onValueChange, placeholder, className, inputClassName, ariaLabel }, forwardedRef) {
  const inputRef = useRef<HTMLInputElement>(null);
  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);
  const hasValue = value.length > 0;

  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={value}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onValueChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && hasValue) {
            e.preventDefault();
            onValueChange("");
          }
        }}
        placeholder={placeholder}
        className={cn("pl-9", hasValue && "pr-9", inputClassName)}
      />
      {hasValue && (
        <button
          type="button"
          aria-label="Clear search"
          title="Clear search"
          onClick={() => {
            onValueChange("");
            inputRef.current?.focus();
          }}
          className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 animate-in items-center justify-center rounded text-muted-foreground duration-150 fade-in zoom-in-95 hover:bg-white/5 hover:text-foreground active:scale-90"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
});
