// useIsDesktop — the one wide-viewport detector shared across Cumulus screens.
//
// A screen renders its desktop idiom (denser, larger controls; side-by-side
// layouts) at or above DESKTOP_MIN_WIDTH, and its mobile idiom below it. Both
// the Dreamcaller-select screen (carousel vs triptych) and the dreamscape
// screen (wayside vs grand site nodes + HUD) key their layout off this single
// breakpoint so the two screens flip to desktop at the same width.

import { useEffect, useState } from "react";

/** How wide the viewport must be to render a screen's desktop idiom. Below
 * this a screen is its mobile layout; at or above it, its desktop layout. */
export const DESKTOP_MIN_WIDTH = 900;

const DESKTOP_QUERY = `(min-width: ${String(DESKTOP_MIN_WIDTH)}px)`;

/** True when the viewport is wide enough for a screen's desktop layout. Live
 * via matchMedia so rotating a tablet or resizing a window re-evaluates,
 * mirroring InfoCard's `useFinePointer` idiom. */
export function useIsDesktop(): boolean {
  const [desktop, setDesktop] = useState<boolean>(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia(DESKTOP_QUERY);
    const onChange = (): void => setDesktop(query.matches);
    onChange();
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return desktop;
}
