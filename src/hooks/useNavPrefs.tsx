import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Supported navigation bar positions.
 *
 * - "bottom": docked pill anchored to the bottom-center of the screen (the
 *   original/default GitPush look).
 * - "floating-bottom": the same pill, but draggable anywhere on screen and
 *   remembers wherever the user drops it.
 * - "left" / "right": a vertical rail docked to the edge of the screen.
 *   Only rendered on tablet/desktop-sized viewports — on phones GitPush
 *   automatically falls back to the bottom pill so navigation never eats
 *   into precious horizontal space.
 */
export type NavPosition = "bottom" | "floating-bottom" | "left" | "right";

export type NavSize = "sm" | "md" | "lg";

export interface FloatingOffset {
  x: number;
  y: number;
}

export interface NavPrefsState {
  position: NavPosition;
  size: NavSize;
  autoHide: boolean;
  collapsed: boolean;
  floatingOffset: FloatingOffset | null;
}

interface NavPrefsContextValue extends NavPrefsState {
  setPosition: (position: NavPosition) => void;
  setSize: (size: NavSize) => void;
  setAutoHide: (autoHide: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  setFloatingOffset: (offset: FloatingOffset | null) => void;
  reset: () => void;
}

const STORAGE_KEY = "gitpush:nav-prefs";
// Predates the customizable nav bar — a standalone flag for the old
// collapse/expand chevron. Migrated into the new blob below so returning
// users don't lose the one preference they'd already set.
const LEGACY_COLLAPSED_KEY = "gitpush:dock-collapsed";

export const DEFAULT_NAV_PREFS: NavPrefsState = {
  position: "bottom",
  size: "md",
  autoHide: false,
  collapsed: false,
  floatingOffset: null,
};

function isNavPosition(value: unknown): value is NavPosition {
  return value === "bottom" || value === "floating-bottom" || value === "left" || value === "right";
}

function isNavSize(value: unknown): value is NavSize {
  return value === "sm" || value === "md" || value === "lg";
}

function loadStoredPrefs(): NavPrefsState {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<NavPrefsState>;
      return {
        position: isNavPosition(parsed.position) ? parsed.position : DEFAULT_NAV_PREFS.position,
        size: isNavSize(parsed.size) ? parsed.size : DEFAULT_NAV_PREFS.size,
        autoHide: typeof parsed.autoHide === "boolean" ? parsed.autoHide : DEFAULT_NAV_PREFS.autoHide,
        collapsed: typeof parsed.collapsed === "boolean" ? parsed.collapsed : DEFAULT_NAV_PREFS.collapsed,
        floatingOffset:
          parsed.floatingOffset &&
          typeof parsed.floatingOffset.x === "number" &&
          typeof parsed.floatingOffset.y === "number"
            ? { x: parsed.floatingOffset.x, y: parsed.floatingOffset.y }
            : null,
      };
    }

    const legacyCollapsed = window.localStorage.getItem(LEGACY_COLLAPSED_KEY);
    if (legacyCollapsed !== null) {
      window.localStorage.removeItem(LEGACY_COLLAPSED_KEY);
      return { ...DEFAULT_NAV_PREFS, collapsed: legacyCollapsed === "1" };
    }
  } catch {
    // localStorage may be unavailable (private mode, etc.) — fall back to defaults.
  }
  return DEFAULT_NAV_PREFS;
}

function persistPrefs(state: NavPrefsState) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage failures — preferences simply won't persist this session.
  }
}

const NavPrefsContext = createContext<NavPrefsContextValue | null>(null);

export function NavPrefsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<NavPrefsState>(DEFAULT_NAV_PREFS);

  // Preferences are read from localStorage after mount only, so the very
  // first client render always matches the server-rendered markup (avoids
  // hydration mismatches) — the same pattern the dock already used for its
  // collapse flag.
  useEffect(() => {
    setState(loadStoredPrefs());
  }, []);

  const update = useCallback((patch: Partial<NavPrefsState>) => {
    setState((prev) => {
      const next = { ...prev, ...patch };
      persistPrefs(next);
      return next;
    });
  }, []);

  const value = useMemo<NavPrefsContextValue>(
    () => ({
      ...state,
      setPosition: (position) => update({ position }),
      setSize: (size) => update({ size }),
      setAutoHide: (autoHide) => update({ autoHide }),
      setCollapsed: (collapsed) => update({ collapsed }),
      setFloatingOffset: (floatingOffset) => update({ floatingOffset }),
      reset: () => {
        setState(DEFAULT_NAV_PREFS);
        persistPrefs(DEFAULT_NAV_PREFS);
      },
    }),
    [state, update],
  );

  return <NavPrefsContext.Provider value={value}>{children}</NavPrefsContext.Provider>;
}

export function useNavPrefs() {
  const ctx = useContext(NavPrefsContext);
  if (!ctx) throw new Error("useNavPrefs must be used within a NavPrefsProvider");
  return ctx;
}
