import { useEffect, useState } from "react";

/**
 * Tracks the actual visible viewport height and how much of it a mobile
 * on-screen keyboard is currently covering, using the VisualViewport API.
 *
 * Why not just `100dvh`: `dvh` is *supposed* to track the visual viewport
 * (shrinking when a keyboard opens), but keyboard-awareness for `dvh` is
 * inconsistently implemented across mobile browsers and WebViews — some
 * shrink it correctly, some don't shrink it at all, and some shrink it
 * with a noticeable lag. When it doesn't shrink, a fixed-height container
 * sized with `dvh` keeps its pre-keyboard height, so whatever's anchored
 * to its bottom — the last visible line in a code editor, an input's
 * caret — ends up rendered underneath the keyboard instead of above it.
 *
 * `window.visualViewport`, by contrast, is a lower-level, purpose-built
 * API that reliably reports the *actual* visible area on every mobile
 * browser that matters here, independent of whatever `dvh` is doing. Using
 * it directly sidesteps the inconsistency instead of trying to detect it.
 */
export function useKeyboardInset() {
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [keyboardInset, setKeyboardInset] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    function update() {
      if (!vv) return;
      setViewportHeight(vv.height);
      // window.innerHeight (the layout viewport) doesn't shrink for an
      // on-screen keyboard — only the visual viewport does — so the gap
      // between them is exactly the keyboard's height. A small threshold
      // filters out noise from browser chrome show/hide and sub-pixel
      // rounding rather than genuine keyboard state changes.
      const gap = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardInset(gap > 80 ? Math.round(gap) : 0);
    }

    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);

  return { viewportHeight, keyboardInset, keyboardOpen: keyboardInset > 0 };
}
