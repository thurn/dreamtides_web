// chrome-geometry — the shared dreamscape-menu chrome geometry, read by the
// menu (DreamscapeJourneyMenu) and by surfaces that must clear it through
// menuTriggerClearance (the draft top band, the journey result screens, the
// deck gallery, and the journey chrome's error fallback). It lives in
// src/cumulus/ so a src/cumulus screen can import it without reaching into
// src/components (no-external-ui-imports); the menu, which may import from
// src/cumulus, is the other consumer.

import { token } from "./tokens";

/**
 * The menu trigger disc's diameter. Both platforms wear the same compact
 * circular glass IconButton (`md`, a 48px disc that clears the 44px touch
 * floor); a screen reserving room below the menu clears this height.
 */
export const MENU_BUTTON_PX = 48;

/**
 * The mobile corner inset that keeps the menu disc clear of the screen corner.
 * A screen clearing the menu adds this to the safe-area inset to find the disc's
 * top edge.
 */
export const MENU_EDGE_INSET_MOBILE_PX = 18;

/**
 * The desktop corner inset for the same menu disc. Desktop has no device cutout
 * helping the corner breathe, so the trigger sits a little farther in.
 */
export const MENU_EDGE_INSET_DESKTOP_PX = 22;

function menuEdgeInsetPx(isDesktop: boolean): number {
  return isDesktop ? MENU_EDGE_INSET_DESKTOP_PX : MENU_EDGE_INSET_MOBILE_PX;
}

/**
 * The top edge just below the journey menu's trigger disc, as a CSS length
 * expression: the disc sits at `top: max(safe-inset-top, edgeInset)` with
 * height MENU_BUTTON_PX, and the edge never rises above the top safe area
 * (`--safe-area-inset-top`, `--safe-top`). `isDesktop` picks the platform's
 * edge inset; `gap` adds a spacing token below the disc.
 */
export function menuTriggerClearance({
  isDesktop,
  gap,
}: {
  readonly isDesktop: boolean;
  readonly gap?: string;
}): string {
  const clearance =
    `max(var(--safe-area-inset-top), ${token("--safe-top")}, ` +
    `calc(max(var(--safe-area-inset-top), ${String(menuEdgeInsetPx(isDesktop))}px) + ${String(MENU_BUTTON_PX)}px))`;
  return gap === undefined ? clearance : `calc(${clearance} + ${gap})`;
}

/** The shared top edge for debug reroll controls on journey scene art. */
export const DEBUG_REROLL_TOP = `calc(max(var(--safe-area-inset-top), ${token("--safe-top")}) + ${token("--space-m")})`;

/** Positions a debug reroll beside desktop menu chrome or opposite it on mobile. */
export function debugRerollCornerStyle(isDesktop: boolean): {
  top: string;
  right: string;
} {
  const edgeInset = menuEdgeInsetPx(isDesktop);
  return {
    top: `max(var(--safe-area-inset-top), ${String(edgeInset)}px)`,
    right: isDesktop
      ? `calc(max(var(--safe-area-inset-right), ${String(edgeInset)}px) + ${String(MENU_BUTTON_PX)}px + ${token("--space-xs")})`
      : `max(var(--safe-area-inset-right), ${String(edgeInset)}px)`,
  };
}
