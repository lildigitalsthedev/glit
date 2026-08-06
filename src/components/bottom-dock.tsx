import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent } from "react";
import { ChevronUp, ChevronDown, LayoutGrid, Code2, History, Settings, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNavPrefs, type NavPosition, type NavSize, type NavAnimation, type FloatingOffset } from "@/hooks/useNavPrefs";

const NAV = [
  { to: "/app", label: "Repos", icon: LayoutGrid },
  { to: "/workspace", label: "Workspace", icon: Code2 },
  { to: "/activity", label: "Activity", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

// Reserved viewport space (bottom-safe area + dock height + margin) and the
// side-rail width, both mirrored via CSS variables so any page — including
// the workspace's fixed-height three-pane layout — can subtract the right
// amount of space and never sit underneath the nav.
const BOTTOM_SPACE: Record<NavSize, { expanded: string; collapsed: string }> = {
  sm: { expanded: "5.5rem", collapsed: "3rem" },
  md: { expanded: "6.5rem", collapsed: "3.5rem" },
  lg: { expanded: "7.5rem", collapsed: "4rem" },
};
const RAIL_WIDTH: Record<NavSize, string> = {
  sm: "5rem",
  md: "6rem",
  lg: "7rem",
};

// Pixel margin kept between the floating dock and the edge of the viewport
// while dragging, and the threshold (px) of movement before a pointer-down
// counts as a drag rather than a tap (so nav links keep working normally).
const DRAG_MARGIN = 16;
const DRAG_THRESHOLD = 5;

// The dock lays its items out in a 4-column grid (one column per nav item)
// so every item gets an exactly equal-width, equal-shape cell no matter how
// long its label is — "Workspace" and "Repos" now occupy identical boxes.
const DOCK_SIZE: Record<NavSize, { icon: string; padY: string; text: string; minTouch: string }> = {
  sm: { icon: "size-3.5", padY: "py-2", text: "text-[8px]", minTouch: "min-h-[2.5rem]" },
  md: { icon: "size-4", padY: "py-2.5 sm:py-2", text: "text-[9px]", minTouch: "min-h-[2.75rem]" },
  lg: { icon: "size-5", padY: "py-3", text: "text-[10px]", minTouch: "min-h-[3.25rem]" },
};

// The rail gives every item the same fixed width (rather than min-width) so
// all four buttons render as identical, equally-sized shapes stacked
// vertically.
const RAIL_SIZE: Record<NavSize, { icon: string; width: string; padY: string; text: string; minTouch: string }> = {
  sm: { icon: "size-4", width: "w-16", padY: "py-2", text: "text-[8px]", minTouch: "min-h-[2.5rem]" },
  md: { icon: "size-[1.15rem]", width: "w-20", padY: "py-2.5", text: "text-[9px]", minTouch: "min-h-[2.75rem]" },
  lg: { icon: "size-5", width: "w-24", padY: "py-3", text: "text-[10px]", minTouch: "min-h-[3.25rem]" },
};

function clampFloatingOffset(offset: FloatingOffset, width: number, height: number): FloatingOffset {
  const maxX = Math.max(0, (window.innerWidth - width) / 2 - DRAG_MARGIN);
  const minY = -(window.innerHeight - height - DRAG_MARGIN * 2);
  const maxY = DRAG_MARGIN;
  return {
    x: Math.min(maxX, Math.max(-maxX, offset.x)),
    y: Math.min(maxY, Math.max(minY, offset.y)),
  };
}

function snapFloatingOffset(offset: FloatingOffset, width: number): FloatingOffset {
  const maxX = Math.max(0, (window.innerWidth - width) / 2 - DRAG_MARGIN);
  const candidates = [-maxX, 0, maxX];
  const snappedX = candidates.reduce((closest, candidate) =>
    Math.abs(candidate - offset.x) < Math.abs(closest - offset.x) ? candidate : closest,
  );
  return { x: snappedX, y: offset.y };
}

/** Blinking terminal-cursor glyph rendered next to the active label. Purely decorative. Only used when the "Blink" nav animation is selected. */
function BlinkCursor({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block w-[2px] animate-[blink_1.1s_steps(1)_infinite] bg-primary", className)}
    />
  );
}

/** Icon transition classes for the active nav item, driven by the user's chosen nav animation. Inactive items just get a hover scale bump. */
function activeIconClass(active: boolean, animation: NavAnimation, translate?: string) {
  if (!active) return "transition-transform duration-200 group-hover:scale-105";
  const lift = translate ? `${translate} ` : "";
  if (animation === "glow") {
    return `${lift}animate-[nav-glow_1.8s_ease-in-out_infinite]`;
  }
  // "blink" and "none" both render a static (non-animated) icon glow — the
  // blink style gets its motion from the cursor glyph next to the label instead.
  return `${lift}transition-transform duration-200 drop-shadow-[0_0_6px_currentColor]`;
}

export function BottomDock() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const { position, size, autoHide, collapsed, floatingOffset, activeAnimation, setCollapsed, setFloatingOffset } =
    useNavPrefs();

  useEffect(() => setMounted(true), []);

  // Left/right rails are desktop & tablet only — phones always get the
  // bottom dock regardless of the saved preference.
  const effectivePosition: NavPosition =
    mounted && isMobile && (position === "left" || position === "right") ? "bottom" : position;
  const isRail = effectivePosition === "left" || effectivePosition === "right";
  const isFloating = effectivePosition === "floating-bottom";

  // Reserve the right amount of layout space for whichever position/size is
  // active, so page content never renders underneath the nav.
  useEffect(() => {
    const root = document.documentElement.style;
    if (isRail) {
      root.setProperty("--dock-space", "0px");
      root.setProperty("--dock-inset-left", effectivePosition === "left" ? RAIL_WIDTH[size] : "0px");
      root.setProperty("--dock-inset-right", effectivePosition === "right" ? RAIL_WIDTH[size] : "0px");
    } else {
      root.setProperty("--dock-space", collapsed ? BOTTOM_SPACE[size].collapsed : BOTTOM_SPACE[size].expanded);
      root.setProperty("--dock-inset-left", "0px");
      root.setProperty("--dock-inset-right", "0px");
    }
    return () => {
      root.removeProperty("--dock-space");
      root.removeProperty("--dock-inset-left");
      root.removeProperty("--dock-inset-right");
    };
  }, [isRail, effectivePosition, size, collapsed]);

  // Auto-hide: fade the nav after a few seconds of inactivity, and bring it
  // right back on any scroll or tap/click/keypress anywhere on the page.
  //
  // The wake handler is batched onto a single rAF per frame instead of
  // running once per raw 'scroll' event (which on mobile can fire dozens of
  // times a second). Left unthrottled, that burst of synchronous state
  // updates competes with the browser's own scroll/chrome-resize work and
  // is what makes the dock appear to "snap" into place a beat after the
  // scroll gesture has already stopped, instead of tracking smoothly.
  const [faded, setFaded] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!autoHide) {
      setFaded(false);
      return;
    }
    let framePending = false;
    function wake() {
      if (framePending) return;
      framePending = true;
      requestAnimationFrame(() => {
        framePending = false;
        setFaded(false);
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setFaded(true), 3000);
      });
    }
    wake();
    const events: Array<keyof WindowEventMap> = ["scroll", "touchstart", "pointerdown", "keydown"];
    events.forEach((evt) => window.addEventListener(evt, wake, { passive: true }));
    return () => {
      events.forEach((evt) => window.removeEventListener(evt, wake));
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [autoHide]);

  // Drag-to-reposition, floating mode only.
  const dockRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startX: number;
    startY: number;
    startOffsetX: number;
    startOffsetY: number;
    dragging: boolean;
  } | null>(null);
  const [dragOffset, setDragOffset] = useState<FloatingOffset | null>(floatingOffset);
  const [isDragging, setIsDragging] = useState(false);
  const suppressClickRef = useRef(false);

  useEffect(() => setDragOffset(floatingOffset), [floatingOffset]);

  function handlePointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (!isFloating) return;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      startOffsetX: dragOffset?.x ?? 0,
      startOffsetY: dragOffset?.y ?? 0,
      dragging: false,
    };
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (!drag || !isFloating) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.dragging = true;
    setIsDragging(true);
    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = clampFloatingOffset({ x: drag.startOffsetX + dx, y: drag.startOffsetY + dy }, rect.width, rect.height);
    setDragOffset(next);
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    setIsDragging(false);
    if (!drag?.dragging) return;
    suppressClickRef.current = true;
    setTimeout(() => {
      suppressClickRef.current = false;
    }, 250);
    const rect = dockRef.current?.getBoundingClientRect();
    if (!rect || !dragOffset) return;
    const snapped = snapFloatingOffset(dragOffset, rect.width);
    setDragOffset(snapped);
    setFloatingOffset(snapped);
  }

  function handleClickCapture(e: ReactMouseEvent) {
    if (suppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }

  const opacityClass = faded ? "opacity-30" : "opacity-100";

  if (isRail) {
    const sizing = RAIL_SIZE[size];
    const accentSide = effectivePosition === "left" ? "right-0" : "left-0";
    return (
      <div
        className={cn(
          "pointer-events-none fixed inset-y-0 z-50 flex items-center py-4 transform-gpu will-change-transform",
          effectivePosition === "left" ? "left-0 pl-3" : "right-0 pr-3",
        )}
      >
        <nav
          aria-label="Primary"
          className={cn(
            "pointer-events-auto flex transform-gpu flex-col items-stretch gap-0.5 rounded-lg border border-border/80 bg-card/95 p-1 shadow-2xl shadow-black/50 backdrop-blur-xl transition-all duration-300 will-change-transform",
            mounted ? `${opacityClass} translate-x-0` : "translate-x-4 opacity-0",
          )}
        >
          {NAV.map((item) => {
            const active = pathname === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "group relative flex flex-col items-center justify-center gap-1 rounded-md font-mono uppercase tracking-wider transition-colors duration-150",
                  sizing.width,
                  sizing.padY,
                  sizing.text,
                  sizing.minTouch,
                  active ? "text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
                )}
              >
                <span
                  className={cn(
                    "absolute top-1.5 bottom-1.5 w-[2px] rounded-full bg-primary transition-all duration-200",
                    accentSide,
                    active ? "opacity-100" : "opacity-0",
                  )}
                  aria-hidden="true"
                />
                <item.icon className={cn(sizing.icon, activeIconClass(active, activeAnimation))} />
                <span className="flex max-w-full items-center gap-0.5 truncate font-semibold">
                  {item.label}
                  {active && activeAnimation === "blink" && <BlinkCursor className="h-2.5" />}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>
    );
  }

  const sizing = DOCK_SIZE[size];

  const dockNav = (
    <nav
      aria-label="Primary"
      className={cn(
        "grid grid-cols-4 items-stretch divide-x divide-border/60 rounded-lg border border-border/80 bg-card/95 shadow-2xl shadow-black/50 backdrop-blur-xl",
        isFloating && "shadow-black/60",
      )}
    >
      {NAV.map((item) => {
        const active = pathname === item.to;
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex w-full flex-col items-center justify-center gap-1 font-mono uppercase tracking-wider transition-colors duration-150",
              sizing.padY,
              sizing.text,
              sizing.minTouch,
              active ? "text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
            )}
          >
            <span
              className={cn(
                "absolute inset-x-2 top-0 h-[2px] rounded-full bg-primary transition-all duration-200",
                active ? "opacity-100" : "opacity-0",
              )}
              aria-hidden="true"
            />
            <item.icon className={cn(sizing.icon, activeIconClass(active, activeAnimation, "-translate-y-0.5"))} />
            <span className="flex max-w-full items-center gap-0.5 truncate font-semibold">
              {item.label}
              {active && activeAnimation === "blink" && <BlinkCursor className="h-2.5" />}
            </span>
          </Link>
        );
      })}
    </nav>
  );

  if (isFloating) {
    return (
      <div className="pointer-events-none fixed inset-0 z-50 will-change-transform">
        <div
          ref={dockRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onClickCapture={handleClickCapture}
          className={cn(
            "pointer-events-auto absolute bottom-0 left-1/2 flex touch-none flex-col items-center [backface-visibility:hidden]",
            mounted ? opacityClass : "opacity-0",
            isDragging ? "duration-0" : "transition-[transform,opacity] duration-300",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          style={{
            transform: `translate(-50%, 0) translate3d(${dragOffset?.x ?? 0}px, ${dragOffset?.y ?? 0}px, 0)`,
            paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          }}
        >
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              aria-label="Show navigation"
              className="flex size-9 animate-in items-center justify-center rounded-md border border-border/80 bg-card/95 text-foreground shadow-lg shadow-black/50 backdrop-blur-xl duration-200 fade-in zoom-in-95 hover:bg-white/5 active:scale-95"
            >
              <ChevronUp className="size-4" />
            </button>
          ) : (
            <div className="relative animate-in duration-300 fade-in slide-in-from-bottom-3">
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label="Collapse navigation"
                className="absolute -top-3 left-1/2 flex h-4 w-8 -translate-x-1/2 items-center justify-center rounded-t-md border border-b-0 border-border/80 bg-card/95 text-muted-foreground backdrop-blur-xl transition-colors duration-150 hover:text-foreground active:scale-95"
              >
                <Minus className="size-3" />
              </button>
              {dockNav}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 transform-gpu will-change-transform"
      style={{ paddingBottom: "max(1rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className={cn(
          "pointer-events-auto flex flex-col items-center transition-opacity duration-300 [backface-visibility:hidden]",
          mounted ? opacityClass : "opacity-0",
        )}
      >
        {collapsed ? (
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            aria-label="Show navigation"
            className="flex size-9 animate-in items-center justify-center rounded-md border border-border/80 bg-card/95 text-foreground shadow-lg shadow-black/50 backdrop-blur-xl duration-200 fade-in zoom-in-95 hover:bg-white/5 active:scale-95"
          >
            <ChevronUp className="size-4" />
          </button>
        ) : (
          <div className="relative animate-in duration-300 fade-in slide-in-from-bottom-3">
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              aria-label="Collapse navigation"
              className="absolute -top-3 left-1/2 flex h-4 w-8 -translate-x-1/2 items-center justify-center rounded-t-md border border-b-0 border-border/80 bg-card/95 text-muted-foreground backdrop-blur-xl transition-colors duration-150 hover:text-foreground active:scale-95"
            >
              <ChevronDown className="size-3" />
            </button>
            {dockNav}
          </div>
        )}
      </div>
    </div>
  );
}
