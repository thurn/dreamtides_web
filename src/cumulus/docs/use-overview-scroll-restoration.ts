import { useLayoutEffect, useRef } from "react";
import type { CumulusRoute } from "./route";

const OVERVIEW_SCROLL_STORAGE_KEY = "cumulus:overview-scroll-y";

function readStoredOverviewScroll(): number {
  try {
    const storedValue = window.sessionStorage.getItem(
      OVERVIEW_SCROLL_STORAGE_KEY,
    );
    if (storedValue === null) return 0;

    const scrollY = Number(storedValue);
    return Number.isFinite(scrollY) && scrollY >= 0 ? scrollY : 0;
  } catch {
    return 0;
  }
}

function storeOverviewScroll(scrollY: number): void {
  try {
    window.sessionStorage.setItem(
      OVERVIEW_SCROLL_STORAGE_KEY,
      String(scrollY),
    );
  } catch {
    // Scroll restoration is a convenience; storage restrictions should not
    // prevent the documentation site from rendering or navigating.
  }
}

/**
 * Keeps the tall overview gallery anchored across hash navigation and full
 * document reloads, including Vite reloads triggered by source changes.
 */
export function useOverviewScrollRestoration(route: CumulusRoute): void {
  const overviewScrollRef = useRef(readStoredOverviewScroll());
  const routeId = "id" in route ? route.id : null;

  useLayoutEffect(() => {
    if (route.view !== "overview") {
      window.scrollTo(0, 0);
      return undefined;
    }

    window.scrollTo(0, overviewScrollRef.current);

    const persistCurrentScroll = () => {
      const scrollY = Number.isFinite(window.scrollY)
        ? Math.max(0, window.scrollY)
        : 0;
      overviewScrollRef.current = scrollY;
      storeOverviewScroll(scrollY);
    };

    window.addEventListener("scroll", persistCurrentScroll, { passive: true });
    window.addEventListener("pagehide", persistCurrentScroll);
    return () => {
      persistCurrentScroll();
      window.removeEventListener("scroll", persistCurrentScroll);
      window.removeEventListener("pagehide", persistCurrentScroll);
    };
  }, [route.view, routeId]);
}
