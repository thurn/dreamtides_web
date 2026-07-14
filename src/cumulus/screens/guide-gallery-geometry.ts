// Shared mobile geometry for a character band above a floating gallery panel.

import { token } from "../primitives/tokens";
import { MENU_EDGE_INSET_MOBILE_PX } from "./chrome-geometry";

export const GUIDE_GALLERY_MOBILE_GUIDE_HEIGHT =
  "clamp(170px, 28dvh, 240px)";

export const GUIDE_GALLERY_MOBILE_GRID_ROWS = `${GUIDE_GALLERY_MOBILE_GUIDE_HEIGHT} minmax(0, 1fr)`;

export const GUIDE_GALLERY_MOBILE_PANEL_WIDTH = `calc(100vw - (${token("--space-4")} * 2))`;

export const GUIDE_GALLERY_MOBILE_GUIDE_LEFT = `max(var(--safe-area-inset-left), ${String(MENU_EDGE_INSET_MOBILE_PX)}px)`;

export const GUIDE_GALLERY_MOBILE_GUIDE_BOTTOM = `calc(-1 * ${token("--space-8")})`;

export const GUIDE_GALLERY_MOBILE_GUIDE_WIDTH = "58vw";
