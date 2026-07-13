// chrome-geometry — the shared dreamscape-menu chrome geometry, read by the
// menu (DreamscapeQuestMenu) and by screens that must clear it (DraftScreen's
// top-band clearance math). It lives in src/cumulus/ so a src/cumulus screen can
// import it without reaching into src/components (no-external-ui-imports); the
// menu, which may import from src/cumulus, is the other consumer.

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
