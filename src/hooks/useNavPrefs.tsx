import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/**
 * Supported navigation bar positions.
 *
 * - "bottom": docked pill anchored to the bottom-center of the screen (the
 *   default on phones).
 * - "floating-bottom": the same pill, but draggable anywhere on screen and
 *   remembers wherever the user drops it.
 * - "left" / "right": a vertical rail docked to the edge of the screen.
 * - "minimal": no pill at all — just the bare icons and labels floating
 *   directly over the page at the bottom-center, individually tappable,
 *   with no shared background/border/blur behind them.
 */
export type NavPosition = "bottom" | "floating-bottom" | "left" | "right" | "minimal";

export type NavSize = "sm" | "md" | "lg";

/**
 * The animation style applied to the active nav item.
 *
 * - "glow": the active icon pulses with a soft glow (the default).
 * - "blink": a blinking terminal-cursor glyph renders next to the active
 *   label (the original, more attention-grabbing style).
 * - "none": the active item gets a static highlight with no animation at
 *   all — the calmest option.
 */
export type NavAnimation = "glow" | "blink" | "none";

export interface FloatingOffset {
  x: number;
  y: number;
}

/** Stable identifiers for the four nav items — used to key per-item icon overrides, independent of route path or label. */
export type NavItemKey = "repos" | "workspace" | "activity" | "settings";
export const NAV_ITEM_KEYS: readonly NavItemKey[] = ["repos", "workspace", "activity", "settings"] as const;

export interface NavPrefsState {
  position: NavPosition;
  size: NavSize;
  autoHide: boolean;
  collapsed: boolean;
  floatingOffset: FloatingOffset | null;
  activeAnimation: NavAnimation;
  /**
   * Per-item icon overrides, keyed by `NavItemKey`. Values are string keys
   * into a small bundled icon registry (see `ICON_CHOICES` in
   * bottom-dock.tsx) — never uploaded image data, so this costs nothing in
   * database or storage space and works entirely offline like the rest of
   * these preferences. An item with no entry here just uses its default
   * icon.
   */
  icons: Partial<Record<NavItemKey, string>>;
}

interface NavPrefsContextValue extends NavPrefsState {
  setPosition: (position: NavPosition) => void;
  setSize: (size: NavSize) => void;
  setAutoHide: (autoHide: boolean) => void;
  setCollapsed: (collapsed: boolean) => void;
  setFloatingOffset: (offset: FloatingOffset | null) => void;
  setActiveAnimation: (animation: NavAnimation) => void;
  /** Sets (or, passing `null`, clears back to default) the icon override for one nav item. */
  setIcon: (key: NavItemKey, iconKey: string | null) => void;
  reset: () => void;
  /**
   * Transient, session-only override that hides the dock and reclaims its
   * reserved space entirely — used while a mobile on-screen keyboard is
   * open (see `useKeyboardInset`), so the keyboard and the nav never
   * compete for the same sliver of screen. Deliberately kept out of
   * `NavPrefsState`/localStorage: it reflects the keyboard's current
   * state, not a preference, and must never persist across sessions or
   * leak into the user's actual saved nav settings.
   */
  keyboardHidden: boolean;
  setKeyboardHidden: (hidden: boolean) => void;
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
  activeAnimation: "glow",
  icons: {},
};

function isNavPosition(value: unknown): value is NavPosition {
  return (
    value === "bottom" ||
    value === "floating-bottom" ||
    value === "left" ||
    value === "right" ||
    value === "minimal"
  );
}

function isNavSize(value: unknown): value is NavSize {
  return value === "sm" || value === "md" || value === "lg";
}

function isNavAnimation(value: unknown): value is NavAnimation {
  return value === "glow" || value === "blink" || value === "none";
}

function sanitizeIcons(value: unknown): Partial<Record<NavItemKey, string>> {
  if (!value || typeof value !== "object") return {};
  const result: Partial<Record<NavItemKey, string>> = {};
  for (const key of NAV_ITEM_KEYS) {
    const raw = (value as Record<string, unknown>)[key];
    if (typeof raw === "string" && raw.length > 0 && raw.length < 64) result[key] = raw;
  }
  return result;
}

// Tablet/desktop-sized viewports default to a persistent side rail (an
// actual "side pane", the way a native desktop app would look) rather than
// the bottom pill — the bottom dock is the phone-appropriate default and is
// what brand-new tablet/desktop visitors would otherwise be stuck with until
// they found this setting themselves. Anyone who explicitly picks a
// position afterwards (including switching back to "bottom") has that
// stored and always wins over this initial guess.
const DESKTOP_BREAKPOINT = 768;
function deviceDefaultPosition(): NavPosition {
  return window.innerWidth >= DESKTOP_BREAKPOINT ? "left" : "bottom";
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
        activeAnimation: isNavAnimation(parsed.activeAnimation)
          ? parsed.activeAnimation
          : DEFAULT_NAV_PREFS.activeAnimation,
        icons: sanitizeIcons(parsed.icons),
      };
    }

    const legacyCollapsed = window.localStorage.getItem(LEGACY_COLLAPSED_KEY);
    if (legacyCollapsed !== null) {
      window.localStorage.removeItem(LEGACY_COLLAPSED_KEY);
      // A pre-existing user from before the rail existed — respect their old
      // collapse flag, but still only default to "bottom" since that's all
      // that existed back then; they can move to a rail from settings.
      return { ...DEFAULT_NAV_PREFS, collapsed: legacyCollapsed === "1" };
    }

    // Genuinely first-run — no prefs of any kind stored yet. Pick the
    // position a native app on this size of screen would use.
    return { ...DEFAULT_NAV_PREFS, position: deviceDefaultPosition() };
  } catch {
    // localStorage may be unavailable (private mode, etc.) — fall back to
    // the same device-aware guess rather than always "bottom".
    try {
      return { ...DEFAULT_NAV_PREFS, position: deviceDefaultPosition() };
    } catch {
      return DEFAULT_NAV_PREFS;
    }
  }
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
  const [keyboardHidden, setKeyboardHidden] = useState(false);

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

  // Written as its own functional setState (rather than routed through
  // `update`) so the merge into `icons` always starts from the freshest
  // state, not whatever `state.icons` happened to be in the render
  // closure this callback was created in.
  const setIcon = useCallback((key: NavItemKey, iconKey: string | null) => {
    setState((prev) => {
      const nextIcons = { ...prev.icons };
      if (iconKey) nextIcons[key] = iconKey;
      else delete nextIcons[key];
      const next = { ...prev, icons: nextIcons };
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
      setActiveAnimation: (activeAnimation) => update({ activeAnimation }),
      setIcon,
      reset: () => {
        const next = { ...DEFAULT_NAV_PREFS, position: deviceDefaultPosition() };
        setState(next);
        persistPrefs(next);
      },
      keyboardHidden,
      setKeyboardHidden,
    }),
    [state, update, setIcon, keyboardHidden],
  );

  return <NavPrefsContext.Provider value={value}>{children}</NavPrefsContext.Provider>;
}

export function useNavPrefs() {
  const ctx = useContext(NavPrefsContext);
  if (!ctx) throw new Error("useNavPrefs must be used within a NavPrefsProvider");
  return ctx;
}
