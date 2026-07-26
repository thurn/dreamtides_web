// useIsDesktop — the one wide-viewport detector shared across Cumulus screens.
//
// A screen renders its desktop idiom (denser, larger controls; side-by-side
// layouts) at or above DESKTOP_MIN_WIDTH, and its mobile idiom below it. Both
// the DreamAvatar-select screen (carousel vs triptych) and the dreamscape
// screen (wayside vs grand site nodes + HUD) key their layout off this single
// breakpoint so the two screens flip to desktop at the same width.

import { useEffect, useState } from "react";

/** How wide the viewport must be to render a screen's desktop idiom. Below
 * this a screen is its mobile layout; at or above it, its desktop layout. */
export const DESKTOP_MIN_WIDTH = 900;

/** True when the viewport is wide enough for a screen's desktop layout. Live
 * via matchMedia so rotating a tablet or resizing a window re-evaluates,
 * mirroring InfoCard's `useFinePointer` idiom. */
export function useIsDesktop(minWidth = DESKTOP_MIN_WIDTH): boolean {
  const queryText = `(min-width: ${String(minWidth)}px)`;
  const [desktop, setDesktop] = useState<boolean>(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(queryText).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(queryText);
    const onChange = (): void => setDesktop(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [queryText]);

  return desktop;
}
