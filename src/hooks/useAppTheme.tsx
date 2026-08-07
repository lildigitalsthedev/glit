import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { getPreferences, updatePreferences } from "@/lib/workspace.functions";
import {
  type AppTheme,
  applyAccentColor,
  applyAppTheme,
  readStoredAccentColor,
  readStoredAppTheme,
  writeStoredAccentColor,
  writeStoredAppTheme,
} from "@/lib/theme";

interface AppThemeContextValue {
  /** The raw setting: "light" | "dark" | "system". */
  appTheme: AppTheme;
  /** What's actually rendered right now (system resolved to light/dark). */
  resolvedTheme: "light" | "dark";
  /** Hex string, or null when using the built-in default cyan accent. */
  accentColor: string | null;
  setAppTheme: (theme: AppTheme) => void;
  setAccentColor: (hex: string | null) => void;
}

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)").matches
    : true;
}

/**
 * Owns the app-wide appearance setting (Light/Dark/System) and accent
 * color. Source of truth is localStorage for instant, no-round-trip
 * updates (see the blocking script in __root.tsx for the pre-hydration
 * equivalent); when the user is signed in, changes are also persisted to
 * `user_preferences` so they follow the account across devices. On first
 * login on a fresh device (nothing in localStorage yet), the server value
 * is applied instead of the hardcoded default.
 */
export function AppThemeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const getPrefsFn = useServerFn(getPreferences);
  const updatePrefsFn = useServerFn(updatePreferences);

  const [appTheme, setAppThemeState] = useState<AppTheme>(readStoredAppTheme);
  const [accentColor, setAccentColorState] = useState<string | null>(readStoredAccentColor);
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">(() =>
    appTheme === "system" ? (systemPrefersDark() ? "dark" : "light") : appTheme,
  );

  // Re-apply whenever the setting changes (also covers the very first
  // client render, in case the pre-hydration script above didn't run for
  // some reason, e.g. scripts disabled).
  useEffect(() => {
    applyAppTheme(appTheme);
    setResolvedTheme(appTheme === "system" ? (systemPrefersDark() ? "dark" : "light") : appTheme);
  }, [appTheme]);

  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

  // Track the OS setting live while "System" is selected.
  useEffect(() => {
    if (appTheme !== "system" || typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      applyAppTheme("system");
      setResolvedTheme(systemPrefersDark() ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [appTheme]);

  // Once signed in, pull server-saved preferences — but only apply them if
  // this device has nothing stored locally yet, so an existing local choice
  // (including on a shared/guest device) is never silently overwritten.
  const hydratedForUser = useRef<string | null>(null);
  useEffect(() => {
    if (!user?.id || hydratedForUser.current === user.id) return;
    hydratedForUser.current = user.id;
    const hasLocalTheme = typeof window !== "undefined" && window.localStorage.getItem("gitpush:app-theme");
    const hasLocalAccent = typeof window !== "undefined" && window.localStorage.getItem("gitpush:accent-color");
    if (hasLocalTheme && hasLocalAccent) return;
    void getPrefsFn().then((prefs) => {
      if (!hasLocalTheme && (prefs.theme === "light" || prefs.theme === "dark" || prefs.theme === "system")) {
        setAppThemeState(prefs.theme);
        writeStoredAppTheme(prefs.theme);
      }
      if (!hasLocalAccent && prefs.accentColor) {
        setAccentColorState(prefs.accentColor);
        writeStoredAccentColor(prefs.accentColor);
      }
    });
  }, [user?.id, getPrefsFn]);

  const persist = useCallback(
    (patch: { theme?: AppTheme; accentColor?: string | null }) => {
      if (!user?.id) return;
      void updatePrefsFn({ data: patch }).then(() => queryClient.invalidateQueries({ queryKey: ["prefs"] }));
    },
    [user?.id, updatePrefsFn, queryClient],
  );

  const setAppTheme = useCallback(
    (theme: AppTheme) => {
      setAppThemeState(theme);
      writeStoredAppTheme(theme);
      persist({ theme });
    },
    [persist],
  );

  const setAccentColor = useCallback(
    (hex: string | null) => {
      setAccentColorState(hex);
      writeStoredAccentColor(hex);
      persist({ accentColor: hex });
    },
    [persist],
  );

  const value = useMemo<AppThemeContextValue>(
    () => ({ appTheme, resolvedTheme, accentColor, setAppTheme, setAccentColor }),
    [appTheme, resolvedTheme, accentColor, setAppTheme, setAccentColor],
  );

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme() {
  const ctx = useContext(AppThemeContext);
  if (!ctx) throw new Error("useAppTheme must be used within an AppThemeProvider");
  return ctx;
}
