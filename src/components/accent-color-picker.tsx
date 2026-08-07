import { useCallback, useEffect, useRef, useState } from "react";
import { isValidHex, normalizeHex } from "@/lib/theme";
import { cn } from "@/lib/utils";

interface Hsv {
  h: number; // 0-360
  s: number; // 0-1
  v: number; // 0-1
}

function hexToHsv(hex: string): Hsv {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function hsvToHex({ h, s, v }: Hsv): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}

/**
 * A fully interactive HSV color picker: a saturation/value square (drag to
 * pick the shade) plus a hue slider, backed by plain CSS gradients and
 * pointer events — no charting/canvas library needed. Reports changes as
 * hex strings via `onChange`, fired continuously while dragging so the
 * accent applies live.
 */
export function AccentColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [hsv, setHsv] = useState<Hsv>(() => hexToHsv(normalizeHex(value) ?? "#22d3ee"));
  const [hexInput, setHexInput] = useState(value);
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const draggingSv = useRef(false);
  const draggingHue = useRef(false);

  // Keep in sync if the value changes from outside (e.g. a preset click).
  useEffect(() => {
    const normalized = normalizeHex(value);
    if (normalized) {
      setHsv(hexToHsv(normalized));
      setHexInput(normalized);
    }
  }, [value]);

  const commit = useCallback(
    (next: Hsv) => {
      setHsv(next);
      const hex = hsvToHex(next);
      setHexInput(hex);
      onChange(hex);
    },
    [onChange],
  );

  function updateFromSvPointer(clientX: number, clientY: number) {
    const el = svRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const s = clamp01((clientX - rect.left) / rect.width);
    const v = clamp01(1 - (clientY - rect.top) / rect.height);
    commit({ ...hsv, s, v });
  }

  function updateFromHuePointer(clientX: number) {
    const el = hueRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const h = clamp01((clientX - rect.left) / rect.width) * 360;
    commit({ ...hsv, h });
  }

  function handleHexInput(raw: string) {
    setHexInput(raw);
    const normalized = normalizeHex(raw);
    if (normalized) {
      setHsv(hexToHsv(normalized));
      onChange(normalized);
    }
  }

  const currentHex = hsvToHex(hsv);
  const hueHex = hsvToHex({ h: hsv.h, s: 1, v: 1 });

  return (
    <div className="space-y-3">
      {/* Saturation / Value square */}
      <div
        ref={svRef}
        role="slider"
        aria-label="Saturation and brightness"
        aria-valuenow={Math.round(hsv.s * 100)}
        tabIndex={0}
        className="relative h-40 w-full touch-none rounded-md border border-border select-none sm:h-48"
        style={{ backgroundColor: hueHex }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingSv.current = true;
          updateFromSvPointer(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (draggingSv.current) updateFromSvPointer(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          draggingSv.current = false;
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 0.1 : 0.02;
          if (e.key === "ArrowRight") commit({ ...hsv, s: clamp01(hsv.s + step) });
          if (e.key === "ArrowLeft") commit({ ...hsv, s: clamp01(hsv.s - step) });
          if (e.key === "ArrowUp") commit({ ...hsv, v: clamp01(hsv.v + step) });
          if (e.key === "ArrowDown") commit({ ...hsv, v: clamp01(hsv.v - step) });
        }}
      >
        <div className="pointer-events-none absolute inset-0 rounded-md bg-linear-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-0 rounded-md bg-linear-to-t from-black to-transparent" />
        <div
          className="pointer-events-none absolute size-4 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{
            left: `${hsv.s * 100}%`,
            bottom: `${hsv.v * 100}%`,
            backgroundColor: currentHex,
          }}
        />
      </div>

      {/* Hue slider */}
      <div
        ref={hueRef}
        role="slider"
        aria-label="Hue"
        aria-valuenow={Math.round(hsv.h)}
        aria-valuemin={0}
        aria-valuemax={360}
        tabIndex={0}
        className="relative h-4 w-full touch-none rounded-full border border-border select-none"
        style={{
          background:
            "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
        }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingHue.current = true;
          updateFromHuePointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (draggingHue.current) updateFromHuePointer(e.clientX);
        }}
        onPointerUp={() => {
          draggingHue.current = false;
        }}
        onKeyDown={(e) => {
          const step = e.shiftKey ? 15 : 2;
          if (e.key === "ArrowRight") commit({ ...hsv, h: (hsv.h + step) % 360 });
          if (e.key === "ArrowLeft") commit({ ...hsv, h: (hsv.h - step + 360) % 360 });
        }}
      >
        <div
          className="pointer-events-none absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
          style={{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueHex }}
        />
      </div>

      {/* Hex input + live swatch */}
      <div className="flex items-center gap-2">
        <div
          className="size-8 shrink-0 rounded-md border border-border"
          style={{ backgroundColor: isValidHex(currentHex) ? currentHex : undefined }}
        />
        <input
          value={hexInput}
          onChange={(e) => handleHexInput(e.target.value)}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          maxLength={7}
          className={cn(
            "h-8 w-28 rounded-md border border-border bg-background px-2 font-mono text-xs uppercase text-foreground outline-none",
            "focus:border-primary focus:ring-1 focus:ring-primary",
          )}
          placeholder="#3b82f6"
        />
      </div>
    </div>
  );
}
