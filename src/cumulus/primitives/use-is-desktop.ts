// useIsDesktop — shared reactive wide-viewport detection for Cumulus surfaces.
// Screens use the default breakpoint or pass a layout-specific minimum.

import { useEffect, useState } from "react";

/** Default width for a Cumulus desktop idiom. */
export const DESKTOP_MIN_WIDTH = 900;

/** True when the viewport meets the requested layout threshold. */
export function useIsDesktop(minWidth = DESKTOP_MIN_WIDTH): boolean {
  const queryText = `(min-width: ${String(minWidth)}px)`;
  const [desktop, setDesktop] = useState<boolean>(() =>
    typeof window === "undefined" || typeof window.matchMedia !== "function"
      ? false
      : window.matchMedia(queryText).matches,
  );

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
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
