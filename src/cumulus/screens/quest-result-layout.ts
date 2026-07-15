import { token } from "../primitives/tokens";
import { MENU_BUTTON_PX, MENU_EDGE_INSET_MOBILE_PX } from "./chrome-geometry";

/** Shared narrow-stage measure for terminal quest result screens. */
export const QUEST_RESULT_CONTENT_MAX_WIDTH_PX = 440;

/** Clears the mobile menu and the physical top safe area. */
export const QUEST_RESULT_TOP_CHROME_CLEARANCE =
  `calc(max(var(--safe-area-inset-top), ${token("--safe-top")}, ` +
  `calc(max(var(--safe-area-inset-top), ${String(MENU_EDGE_INSET_MOBILE_PX)}px) + ${String(MENU_BUTTON_PX)}px)) + ${token("--space-5")})`;

/** Keeps the terminal action above the physical bottom safe area. */
export const QUEST_RESULT_BOTTOM_SAFE_PADDING =
  `calc(max(var(--safe-area-inset-bottom), ${token("--safe-bottom")}) + ${token("--space-6")})`;

/** Deep chrome falloff shared by the victory and failure atmospheres. */
export const QUEST_RESULT_CHROME_GRADIENT =
  `linear-gradient(180deg, ${token("--surface-chrome-strong")} 0%, ${token("--bg-app")} 72%)`;
