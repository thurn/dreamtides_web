// deck-button-family — the paired button vocabulary for the mobile deck viewer.
//
// The deck viewer's top band carries four buttons of two shapes: the corner
// icon buttons (the elevated dreamscape menu on the left, the close control on
// the right) and the inline filter/sort controls. A "family" is one material
// worn by BOTH shapes at once, so the four buttons read as a set — aesthetically
// matched, not identical. Each family names a corner-button surface and the
// `ControlTreatment` its filter/sort controls wear, drawn from the SAME
// underlying recipe so the corner square and the inline control cannot drift
// apart:
//
//   - `glass`   — liquid-glass panes: the corner squares and the controls share
//                 the one frosted-glass recipe (`glassTrack`), refracting the
//                 scene behind. The calm, cohesive default.
//   - `flat`    — solid raised fills with a hairline edge: modern, high-contrast
//                 chrome, corners and controls on the same `--surface-raised`.
//   - `outline` — hairline-outlined shapes over the art, no fill: the lightest
//                 family, corners and controls both ghosted onto the scene.
//   - `sprite`  — the beveled gray RPG button sprite worn by every button, the
//                 most tactile, game-object family (matches the primary button).
//
// The exploration switcher in `MobileDeckViewer` flips the family live; both the
// deck viewer and the App-owned menu button (while elevated over the overlay)
// read `useDeckButtonFamily()` so the whole set restyles together.

import type { CSSProperties } from "react";
import { useSyncExternalStore } from "react";
import type { ControlTreatment } from "../components/controls/control-treatment";
import {
  glassTrack,
  spriteButton,
} from "../components/controls/control-treatment";
import { token } from "../primitives/tokens";

/** The closed set of harmonious button families the deck viewer can wear. */
export type DeckButtonFamily = "glass" | "flat" | "outline" | "sprite";

/** Every family, in switcher display order. */
export const DECK_BUTTON_FAMILIES: readonly DeckButtonFamily[] = [
  "glass",
  "flat",
  "outline",
  "sprite",
] as const;

/** The family production renders (the switcher previews the rest). */
export const DEFAULT_DECK_BUTTON_FAMILY: DeckButtonFamily = "glass";

/** Human labels for the family switcher segments. */
export const DECK_BUTTON_FAMILY_LABELS: Record<DeckButtonFamily, string> = {
  glass: "Glass",
  flat: "Flat",
  outline: "Outline",
  sprite: "Sprite",
};

/**
 * The `ControlTreatment` the filter/sort controls wear for a family — the
 * inline half of the pairing. Each family maps to the treatment built from the
 * same material as its corner surface, so the two shapes stay in step.
 */
export function familyControlTreatment(
  family: DeckButtonFamily,
): ControlTreatment {
  return family;
}

/**
 * The corner icon-button surface for a family — the material worn by the close
 * control and, while elevated, the dreamscape menu button. Fully specifies the
 * surface (fill, border, radius, elevation) so the caller supplies only layout
 * (size, centering, glyph color); `glass` and `sprite` reuse the exact control
 * recipes so the corner square is the same material as its inline sibling.
 *
 * The corner buttons are square, so a fully-round radius (`--radius-pill`) makes
 * them circles — reading as "fully round" alongside the pill-shaped filter/sort
 * controls (a fixed `--radius-control` looks near-pill on the short dropdown but
 * only gently rounded on the taller square, so the two would not match). `sprite`
 * keeps its beveled metal silhouette: its 9-patch frame is the shape, and a
 * border-radius cannot round a border-image.
 */
export function cornerButtonChrome(family: DeckButtonFamily): CSSProperties {
  switch (family) {
    case "glass":
      return { ...glassTrack(), borderRadius: token("--radius-pill") };
    case "flat":
      return {
        background: token("--surface-raised"),
        border: `1px solid ${token("--border-soft")}`,
        borderRadius: token("--radius-pill"),
        boxShadow: token("--shadow-sm"),
      };
    case "outline":
      return {
        background: "transparent",
        border: `1px solid ${token("--border-soft")}`,
        borderRadius: token("--radius-pill"),
      };
    case "sprite":
      return spriteButton();
  }
}

// --- Live family store -------------------------------------------------------
//
// A tiny external store so the family selected by the deck viewer's exploration
// switcher is also seen by the App-owned menu button, which renders in a
// separate tree. The switcher writes; both surfaces subscribe.

let currentFamily: DeckButtonFamily = DEFAULT_DECK_BUTTON_FAMILY;
const familyListeners = new Set<() => void>();

function subscribeFamily(listener: () => void): () => void {
  familyListeners.add(listener);
  return () => familyListeners.delete(listener);
}

/** Set the active button family and notify every subscribed surface. */
export function setDeckButtonFamily(family: DeckButtonFamily): void {
  if (family === currentFamily) return;
  currentFamily = family;
  for (const listener of familyListeners) listener();
}

/** Subscribe a component to the active button family. */
export function useDeckButtonFamily(): DeckButtonFamily {
  return useSyncExternalStore(
    subscribeFamily,
    () => currentFamily,
    () => DEFAULT_DECK_BUTTON_FAMILY,
  );
}
