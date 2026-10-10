import { token } from "../primitives/tokens";
import { menuTriggerClearance } from "../primitives/chrome-geometry";

/** Shared narrow-stage measure for terminal journey result screens. */
export const JOURNEY_RESULT_CONTENT_MAX_WIDTH_PX = 440;

/** Clears the mobile menu and the physical top safe area. */
export const JOURNEY_RESULT_TOP_CHROME_CLEARANCE = menuTriggerClearance({
  isDesktop: false,
  gap: token("--space-m"),
});

/** Keeps the terminal action above the physical bottom safe area. */
export const JOURNEY_RESULT_BOTTOM_SAFE_PADDING =
  `calc(max(var(--safe-area-inset-bottom), ${token("--safe-bottom")}) + ${token("--space-l")})`;

/** Deep chrome falloff shared by the victory and failure atmospheres. */
export const JOURNEY_RESULT_CHROME_GRADIENT =
  `linear-gradient(180deg, ${token("--surface-chrome-strong")} 0%, ${token("--bg-app")} 72%)`;
