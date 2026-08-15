// Tiny hash router for the /cumulus doc site. Internal navigation between the
// overview TOC, a component's demo page, and a component's full-screen
// mockup all lives behind `window.location.hash` — no react-router, no
// server rewrites (see docs/superpowers/plans/2026-07-02-cumulus-design-system.md).

import { useEffect, useState } from "react";
import { getComponent, type CumulusComponentId } from "./registry";
import { getUISystem, type CumulusUISystemId } from "./systems/registry";

export type CumulusRoute =
  | { view: "overview" }
  | { view: "system"; id: CumulusUISystemId }
  | { view: "component"; id: CumulusComponentId }
  | { view: "mockup"; id: CumulusComponentId };

/**
 * Parse a `window.location.hash` value (or an equivalent hash string with or
 * without the leading `#`) into a {@link CumulusRoute}.
 *
 * Accepted shapes:
 *   - "", "#", "#/"            -> overview
 *   - "#/systems/<id>"          -> UI system <id>
 *   - "#/<id>"                 -> component <id>
 *   - "#/<id>/mockup"          -> mockup <id>
 *   - "#/<id>/<anything else>" -> component <id> (unknown segment ignored
 *     rather than crashing or being mistaken for "mockup")
 *
 * ids are trimmed and lowercased so differently-cased links to the same
 * component resolve to one canonical route.
 */
export function parseCumulusRoute(hash: string): CumulusRoute {
  const withoutHash = hash.startsWith("#") ? hash.slice(1) : hash;
  const segments = withoutHash
    .split("/")
    .map((segment) => segment.trim().toLowerCase())
    .filter((segment) => segment.length > 0);

  if (segments.length === 0) {
    return { view: "overview" };
  }

  const [id, second] = segments;
  if (id === "systems" && second !== undefined) {
    const system = getUISystem(second);
    return system === undefined
      ? { view: "overview" }
      : { view: "system", id: system.id };
  }
  const component = getComponent(id);
  if (component === undefined) return { view: "overview" };
  if (second === "mockup") {
    return { view: "mockup", id: component.id };
  }
  return { view: "component", id: component.id };
}

/**
 * Subscribes to `hashchange` and returns the currently parsed
 * {@link CumulusRoute}, re-rendering the caller whenever the hash changes.
 */
export function useCumulusRoute(): CumulusRoute {
  const [route, setRoute] = useState<CumulusRoute>(() =>
    parseCumulusRoute(window.location.hash),
  );

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseCumulusRoute(window.location.hash));
    };
    window.addEventListener("hashchange", onHashChange);
    return () => {
      window.removeEventListener("hashchange", onHashChange);
    };
  }, []);

  return route;
}
