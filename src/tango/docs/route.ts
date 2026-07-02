// Tiny hash router for the /tango doc site. Internal navigation between the
// overview TOC, a component's demo page, and a component's full-screen
// mockup all lives behind `window.location.hash` — no react-router, no
// server rewrites (see docs/superpowers/plans/2026-07-02-tango-design-system.md).

import { useEffect, useState } from "react";

export type TangoRoute =
  | { view: "overview" }
  | { view: "component"; id: string }
  | { view: "mockup"; id: string };

/**
 * Parse a `window.location.hash` value (or an equivalent hash string with or
 * without the leading `#`) into a {@link TangoRoute}.
 *
 * Accepted shapes:
 *   - "", "#", "#/"            -> overview
 *   - "#/<id>"                 -> component <id>
 *   - "#/<id>/mockup"          -> mockup <id>
 *   - "#/<id>/<anything else>" -> component <id> (unknown segment ignored
 *     rather than crashing or being mistaken for "mockup")
 *
 * ids are trimmed and lowercased so differently-cased links to the same
 * component resolve to one canonical route.
 */
export function parseTangoRoute(hash: string): TangoRoute {
  const withoutHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const segments = withoutHash
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return { view: "overview" };
  }

  const [id, second] = segments;
  if (second === "mockup") {
    return { view: "mockup", id };
  }
  return { view: "component", id };
}

/**
 * Subscribes to `hashchange` and returns the currently parsed
 * {@link TangoRoute}, re-rendering the caller whenever the hash changes.
 */
export function useTangoRoute(): TangoRoute {
  const [route, setRoute] = useState<TangoRoute>(() =>
    parseTangoRoute(window.location.hash),
  );

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseTangoRoute(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return route;
}
