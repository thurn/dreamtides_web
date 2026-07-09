// chrome-geometry — the shared dreamscape-menu chrome geometry, read by the
// menu (DreamscapeQuestMenu) and by screens that must clear it (DraftScreen's
// top-band clearance math). It lives in src/tango/ so a src/tango screen can
// import it without reaching into src/components (no-external-ui-imports); the
// menu, which may import from src/tango, is the other consumer.

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

/**
 * The persistent HUD's visible bottom gap, added after the real device safe
 * area. `--space-2` is the small scene-art sliver shared by every Tango screen.
 */
export const QUEST_STATUS_BAR_BOTTOM_INSET =
  "calc(var(--safe-area-inset-bottom) + var(--space-2))";

/** The operation screens add inside their own `calc()` content clearances. */
export const QUEST_STATUS_BAR_CLEARANCE_OP =
  "var(--hud-h) + var(--safe-area-inset-bottom) + var(--space-2)";
