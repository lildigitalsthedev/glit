import { useEffect, useRef, useState } from "react";

function readStorage<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt JSON, storage disabled, etc. — fall back rather than throw.
    return fallback;
  }
}

function writeStorage<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing / quota exceeded — persistence is a nice-to-have,
    // never something worth crashing the app over.
  }
}

/**
 * Drop-in replacement for `useState` whose value survives unmounting,
 * remounting (e.g. switching tabs and coming back), and full page reloads
 * by mirroring it to `localStorage` under `key`.
 *
 * This is the mechanism behind "context-aware navigation": each screen
 * that wants to remember where the user was (which repo folder is open,
 * which branch, a scroll position, etc.) keys its persisted state by
 * something stable — usually the repo's full name — so switching repos
 * doesn't leak one repo's location into another's.
 *
 * Pass `null` for `key` when there isn't yet a stable identity to persist
 * under (e.g. still waiting on an async repo name to load). The hook
 * behaves like plain in-memory `useState` until a real key is supplied,
 * then starts reading/writing localStorage from that point on.
 */
export function usePersistentState<T>(key: string | null, defaultValue: T) {
  const [value, setValue] = useState<T>(() => (key ? readStorage(key, defaultValue) : defaultValue));
  const keyRef = useRef(key);
  const defaultRef = useRef(defaultValue);
  defaultRef.current = defaultValue;

  // When the key itself changes (e.g. the user opened a different repo),
  // load that key's own persisted value instead of carrying over the
  // previous key's value.
  useEffect(() => {
    if (key !== keyRef.current) {
      keyRef.current = key;
      setValue(key ? readStorage(key, defaultRef.current) : defaultRef.current);
    }
  }, [key]);

  useEffect(() => {
    if (key) writeStorage(key, value);
  }, [key, value]);

  return [value, setValue] as const;
}
