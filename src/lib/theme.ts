/**
 * Appearance + code-editor customization.
 *
 * Design:
 * - App theme (light/dark/system) toggles the `.dark` class on <html>,
 *   which every existing color token in styles.css already keys off via
 *   the `@custom-variant dark (&:is(.dark *))` rule — nothing new to wire
 *   up there.
 * - Accent color works by overriding a single CSS custom property,
 *   `--primary`, on the document root (plus `--primary-foreground` for
 *   contrast). Every other accent-driven token (`--ring`, `--sidebar-primary`,
 *   `--code-key`, `--chart-1`, and the `--accent-*` family) is defined in
 *   styles.css as a function of `--primary` (either a direct alias or a
 *   `color-mix()`), so overriding just those two properties cascades
 *   through buttons, links, focus rings, selected states, etc. automatically
 *   — no component hardcodes a color.
 * - `null`/unset accent color means "use the built-in default cyan" — the
 *   override is simply not applied, so existing users see zero change.
 *
 * All the DOM-mutating functions here are safe to call from an inline
 * `<script>` in <head> (before React hydrates) as well as from React, which
 * is what avoids a flash of the wrong theme/accent on first paint.
 */

export type AppTheme = "light" | "dark" | "system";

export const APP_THEME_STORAGE_KEY = "gitpush:app-theme";
export const ACCENT_COLOR_STORAGE_KEY = "gitpush:accent-color";

export const DEFAULT_APP_THEME: AppTheme = "dark";

export interface AccentPreset {
  id: string;
  label: string;
  /** Hex color, or null for the built-in default (no CSS override applied). */
  hex: string | null;
}

export const ACCENT_PRESETS: AccentPreset[] = [
  { id: "cyan", label: "Cyan", hex: null },
  { id: "blue", label: "Blue", hex: "#3b82f6" },
  { id: "dark-blue", label: "Dark Blue", hex: "#1d4ed8" },
  { id: "purple", label: "Purple", hex: "#a855f7" },
  { id: "pink", label: "Pink", hex: "#ec4899" },
  { id: "red", label: "Red", hex: "#ef4444" },
  { id: "orange", label: "Orange", hex: "#f97316" },
  { id: "yellow", label: "Yellow", hex: "#eab308" },
  { id: "green", label: "Green", hex: "#22c55e" },
  { id: "teal", label: "Teal", hex: "#14b8a6" },
  { id: "indigo", label: "Indigo", hex: "#6366f1" },
];

export function isValidHex(value: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(value);
}

export function normalizeHex(value: string): string | null {
  let v = value.trim();
  if (!v.startsWith("#")) v = `#${v}`;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    v = `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return isValidHex(v) ? v.toLowerCase() : null;
}

/** WCAG-ish relative luminance from a hex color, used to pick a readable
 * foreground (near-black or near-white) for whatever accent the user
 * chooses, so a light custom color never ends up with unreadable text. */
export function relativeLuminance(hex: string): number {
  const n = normalizeHex(hex);
  if (!n) return 1;
  const r = parseInt(n.slice(1, 3), 16) / 255;
  const g = parseInt(n.slice(3, 5), 16) / 255;
  const b = parseInt(n.slice(5, 7), 16) / 255;
  const linear = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

/** Near-black or near-white foreground, chosen for contrast against `hex`. */
export function contrastForeground(hex: string): string {
  return relativeLuminance(hex) > 0.42 ? "#12121a" : "#fafafa";
}

function resolvedIsDark(theme: AppTheme): boolean {
  if (theme === "system") {
    return typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : true;
  }
  return theme === "dark";
}

/** Applies (or reapplies) the app theme to the document. Safe to call
 * before React mounts. */
export function applyAppTheme(theme: AppTheme) {
  if (typeof document === "undefined") return;
  const dark = resolvedIsDark(theme);
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

/** Applies (or clears, for `null`) the accent color override. Safe to call
 * before React mounts. */
export function applyAccentColor(hex: string | null) {
  if (typeof document === "undefined") return;
  const root = document.documentElement.style;
  const normalized = hex ? normalizeHex(hex) : null;
  if (!normalized) {
    root.removeProperty("--primary");
    root.removeProperty("--primary-foreground");
    return;
  }
  root.setProperty("--primary", normalized);
  root.setProperty("--primary-foreground", contrastForeground(normalized));
}

export function readStoredAppTheme(): AppTheme {
  if (typeof window === "undefined") return DEFAULT_APP_THEME;
  try {
    const raw = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
    if (raw === "light" || raw === "dark" || raw === "system") return raw;
  } catch {
    // ignore
  }
  return DEFAULT_APP_THEME;
}

export function readStoredAccentColor(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ACCENT_COLOR_STORAGE_KEY);
    return raw ? normalizeHex(raw) : null;
  } catch {
    return null;
  }
}

export function writeStoredAppTheme(theme: AppTheme) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
  } catch {
    // Private browsing / quota exceeded — theme just won't persist locally.
  }
}

export function writeStoredAccentColor(hex: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (hex) window.localStorage.setItem(ACCENT_COLOR_STORAGE_KEY, hex);
    else window.localStorage.removeItem(ACCENT_COLOR_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** Inline script source, injected into <head> so the theme and accent color
 * are correct on the very first paint — before React hydrates — instead of
 * flashing the default and then snapping to the stored preference. Kept as
 * a plain string (rather than importing this module) since it has to run
 * standalone in the browser with no bundler involved. */
export const THEME_INIT_SCRIPT = `
(function () {
  try {
    var themeKey = ${JSON.stringify(APP_THEME_STORAGE_KEY)};
    var accentKey = ${JSON.stringify(ACCENT_COLOR_STORAGE_KEY)};
    var theme = localStorage.getItem(themeKey) || "dark";
    var dark = theme === "system"
      ? window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
      : theme !== "light";
    var root = document.documentElement;
    root.classList.toggle("dark", dark);
    root.style.colorScheme = dark ? "dark" : "light";
    var accent = localStorage.getItem(accentKey);
    if (accent && /^#[0-9a-f]{6}$/i.test(accent)) {
      root.style.setProperty("--primary", accent);
      var r = parseInt(accent.slice(1, 3), 16) / 255;
      var g = parseInt(accent.slice(3, 5), 16) / 255;
      var b = parseInt(accent.slice(5, 7), 16) / 255;
      var lin = function (c) { return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      var lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      root.style.setProperty("--primary-foreground", lum > 0.42 ? "#12121a" : "#fafafa");
    }
  } catch (e) {}
})();
`;

// ---------------------------------------------------------------------------
// Code editor customization
// ---------------------------------------------------------------------------

export interface EditorThemeOption {
  id: string;
  label: string;
  /** "light" | "dark" — used to group the Select and to preview a swatch. */
  kind: "light" | "dark";
  /** Monaco base theme to extend ("vs" for light bases, "vs-dark" for dark). */
  base: "vs" | "vs-dark";
  /** Background color, used for a tiny preview swatch in the picker. */
  previewBg: string;
  previewFg: string;
  previewAccent: string;
}

export const EDITOR_THEMES: EditorThemeOption[] = [
  { id: "light", label: "Light", kind: "light", base: "vs", previewBg: "#ffffff", previewFg: "#1f2328", previewAccent: "#0969da" },
  { id: "github-light", label: "GitHub Light", kind: "light", base: "vs", previewBg: "#ffffff", previewFg: "#24292f", previewAccent: "#cf222e" },
  { id: "solarized-light", label: "Solarized Light", kind: "light", base: "vs", previewBg: "#fdf6e3", previewFg: "#657b83", previewAccent: "#268bd2" },
  { id: "dark", label: "Dark", kind: "dark", base: "vs-dark", previewBg: "#1e1e1e", previewFg: "#d4d4d4", previewAccent: "#4ec9b0" },
  { id: "moon-dark", label: "Moon Dark", kind: "dark", base: "vs-dark", previewBg: "#212337", previewFg: "#c8d3f5", previewAccent: "#82aaff" },
  { id: "dracula", label: "Dracula", kind: "dark", base: "vs-dark", previewBg: "#282a36", previewFg: "#f8f8f2", previewAccent: "#ff79c6" },
  { id: "monokai", label: "Monokai", kind: "dark", base: "vs-dark", previewBg: "#272822", previewFg: "#f8f8f2", previewAccent: "#a6e22e" },
  { id: "nord", label: "Nord", kind: "dark", base: "vs-dark", previewBg: "#2e3440", previewFg: "#d8dee9", previewAccent: "#88c0d0" },
  { id: "one-dark", label: "One Dark", kind: "dark", base: "vs-dark", previewBg: "#282c34", previewFg: "#abb2bf", previewAccent: "#61afef" },
  { id: "tokyo-night", label: "Tokyo Night", kind: "dark", base: "vs-dark", previewBg: "#1a1b26", previewFg: "#a9b1d6", previewAccent: "#7aa2f7" },
];

export function editorThemeOption(id: string): EditorThemeOption {
  return EDITOR_THEMES.find((t) => t.id === id) ?? EDITOR_THEMES.find((t) => t.id === "dark")!;
}

/** Monaco's theme name for a given theme id — "light" and "dark" map to
 * Monaco's own built-ins ("vs" / "vs-dark"); everything else is a custom
 * theme defined at editor mount time (see defineCustomEditorThemes). */
export function monacoThemeName(id: string): string {
  if (id === "light") return "vs";
  if (id === "dark") return "vs-dark";
  return `gitpush-${id}`;
}

export interface EditorFontOption {
  id: string;
  label: string;
  /** CSS font-family stack, including a monospace fallback. */
  stack: string;
}

export const EDITOR_FONTS: EditorFontOption[] = [
  { id: "jetbrains-mono", label: "JetBrains Mono", stack: '"JetBrains Mono", ui-monospace, monospace' },
  { id: "fira-code", label: "Fira Code", stack: '"Fira Code", ui-monospace, monospace' },
  { id: "source-code-pro", label: "Source Code Pro", stack: '"Source Code Pro", ui-monospace, monospace' },
  { id: "cascadia-code", label: "Cascadia Code", stack: '"Cascadia Code", ui-monospace, monospace' },
  { id: "system-mono", label: "System Mono", stack: "ui-monospace, Menlo, Consolas, monospace" },
];

export function editorFontStack(id: string): string {
  return EDITOR_FONTS.find((f) => f.id === id)?.stack ?? EDITOR_FONTS[0]!.stack;
}

export const EDITOR_FONT_SIZES = [12, 13, 14, 15, 16, 18];
export const EDITOR_LINE_HEIGHTS: { value: number; label: string }[] = [
  { value: 1.2, label: "Compact" },
  { value: 1.5, label: "Normal" },
  { value: 1.8, label: "Relaxed" },
];

/**
 * Registers the custom Monaco themes (the ones with no built-in Monaco
 * equivalent) on a monaco instance. Idempotent — cheap to call every time
 * the editor mounts. `monaco.editor.defineTheme` accepts a loose color
 * object typed here to avoid pulling in monaco-editor's own types just for
 * this.
 */
export function defineCustomEditorThemes(monaco: {
  editor: { defineTheme: (name: string, theme: Record<string, unknown>) => void };
}) {
  const define = (
    id: string,
    base: "vs" | "vs-dark",
    colors: Record<string, string>,
    rules: { token: string; foreground?: string; fontStyle?: string }[] = [],
  ) => {
    monaco.editor.defineTheme(`gitpush-${id}`, {
      base,
      inherit: true,
      rules,
      colors,
    });
  };

  define(
    "github-light",
    "vs",
    {
      "editor.background": "#ffffff",
      "editor.foreground": "#24292f",
      "editorLineNumber.foreground": "#8c959f",
      "editorLineNumber.activeForeground": "#24292f",
      "editor.selectionBackground": "#0969da33",
      "editorCursor.foreground": "#0969da",
      "editor.lineHighlightBackground": "#f6f8fa",
    },
    [
      { token: "comment", foreground: "6e7781", fontStyle: "italic" },
      { token: "keyword", foreground: "cf222e" },
      { token: "string", foreground: "0a3069" },
      { token: "number", foreground: "0550ae" },
      { token: "type", foreground: "953800" },
    ],
  );

  define(
    "solarized-light",
    "vs",
    {
      "editor.background": "#fdf6e3",
      "editor.foreground": "#657b83",
      "editorLineNumber.foreground": "#93a1a1",
      "editorLineNumber.activeForeground": "#657b83",
      "editor.selectionBackground": "#268bd233",
      "editorCursor.foreground": "#268bd2",
      "editor.lineHighlightBackground": "#eee8d5",
    },
    [
      { token: "comment", foreground: "93a1a1", fontStyle: "italic" },
      { token: "keyword", foreground: "859900" },
      { token: "string", foreground: "2aa198" },
      { token: "number", foreground: "d33682" },
      { token: "type", foreground: "b58900" },
    ],
  );

  define(
    "moon-dark",
    "vs-dark",
    {
      "editor.background": "#212337",
      "editor.foreground": "#c8d3f5",
      "editorLineNumber.foreground": "#4e5079",
      "editorLineNumber.activeForeground": "#c8d3f5",
      "editor.selectionBackground": "#82aaff33",
      "editorCursor.foreground": "#82aaff",
      "editor.lineHighlightBackground": "#2f334d",
    },
    [
      { token: "comment", foreground: "7a88cf", fontStyle: "italic" },
      { token: "keyword", foreground: "c099ff" },
      { token: "string", foreground: "c3e88d" },
      { token: "number", foreground: "ff966c" },
      { token: "type", foreground: "82aaff" },
    ],
  );

  define(
    "dracula",
    "vs-dark",
    {
      "editor.background": "#282a36",
      "editor.foreground": "#f8f8f2",
      "editorLineNumber.foreground": "#6272a4",
      "editorLineNumber.activeForeground": "#f8f8f2",
      "editor.selectionBackground": "#bd93f955",
      "editorCursor.foreground": "#f8f8f0",
      "editor.lineHighlightBackground": "#44475a",
    },
    [
      { token: "comment", foreground: "6272a4", fontStyle: "italic" },
      { token: "keyword", foreground: "ff79c6" },
      { token: "string", foreground: "f1fa8c" },
      { token: "number", foreground: "bd93f9" },
      { token: "type", foreground: "8be9fd" },
    ],
  );

  define(
    "monokai",
    "vs-dark",
    {
      "editor.background": "#272822",
      "editor.foreground": "#f8f8f2",
      "editorLineNumber.foreground": "#75715e",
      "editorLineNumber.activeForeground": "#f8f8f2",
      "editor.selectionBackground": "#49483e",
      "editorCursor.foreground": "#f8f8f0",
      "editor.lineHighlightBackground": "#3e3d32",
    },
    [
      { token: "comment", foreground: "75715e", fontStyle: "italic" },
      { token: "keyword", foreground: "f92672" },
      { token: "string", foreground: "e6db74" },
      { token: "number", foreground: "ae81ff" },
      { token: "type", foreground: "a6e22e" },
    ],
  );

  define(
    "nord",
    "vs-dark",
    {
      "editor.background": "#2e3440",
      "editor.foreground": "#d8dee9",
      "editorLineNumber.foreground": "#4c566a",
      "editorLineNumber.activeForeground": "#d8dee9",
      "editor.selectionBackground": "#434c5e",
      "editorCursor.foreground": "#88c0d0",
      "editor.lineHighlightBackground": "#3b4252",
    },
    [
      { token: "comment", foreground: "616e88", fontStyle: "italic" },
      { token: "keyword", foreground: "81a1c1" },
      { token: "string", foreground: "a3be8c" },
      { token: "number", foreground: "b48ead" },
      { token: "type", foreground: "8fbcbb" },
    ],
  );

  define(
    "one-dark",
    "vs-dark",
    {
      "editor.background": "#282c34",
      "editor.foreground": "#abb2bf",
      "editorLineNumber.foreground": "#495162",
      "editorLineNumber.activeForeground": "#abb2bf",
      "editor.selectionBackground": "#3e4451",
      "editorCursor.foreground": "#528bff",
      "editor.lineHighlightBackground": "#2c313c",
    },
    [
      { token: "comment", foreground: "5c6370", fontStyle: "italic" },
      { token: "keyword", foreground: "c678dd" },
      { token: "string", foreground: "98c379" },
      { token: "number", foreground: "d19a66" },
      { token: "type", foreground: "e5c07b" },
    ],
  );

  define(
    "tokyo-night",
    "vs-dark",
    {
      "editor.background": "#1a1b26",
      "editor.foreground": "#a9b1d6",
      "editorLineNumber.foreground": "#3b4261",
      "editorLineNumber.activeForeground": "#a9b1d6",
      "editor.selectionBackground": "#364a82",
      "editorCursor.foreground": "#7aa2f7",
      "editor.lineHighlightBackground": "#1f2335",
    },
    [
      { token: "comment", foreground: "565f89", fontStyle: "italic" },
      { token: "keyword", foreground: "bb9af7" },
      { token: "string", foreground: "9ece6a" },
      { token: "number", foreground: "ff9e64" },
      { token: "type", foreground: "2ac3de" },
    ],
  );
}
