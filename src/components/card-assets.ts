import type { CardType } from "../types/cards";

/**
 * Public URLs for the card chrome art. The PNGs are symlinked into
 * `public/card-frame/` by `scripts/setup-assets.mjs` (and kept out of version
 * control); Vite serves them from the site root. Centralized here so every
 * surface references the same path and the orb/frame art cannot drift apart.
 */
export const ENERGY_ORB_URL = "/card-frame/energy_cost_background.png";
export const SPARK_ORB_URL = "/card-frame/spark_background.png";
export const CARD_FRAME_CHARACTER_URL = "/card-frame/card_frame.png";
export const CARD_FRAME_EVENT_URL = "/card-frame/card_frame_event.png";

/** Native aspect ratio (width / height) of a card's art image. */
export const CARD_ART_ASPECT_RATIO = 0.87;

/** Native aspect ratio (width / height) of the parchment frame overlay PNG. */
export const CARD_FRAME_ASPECT_RATIO = 742 / 386;

/**
 * Insets of the writable parchment region within the frame PNG, expressed as
 * fractions of the frame box. Derived by sampling the parchment (tan) pixels
 * in `card_frame.png`: the dense parchment area spans x∈[11%,89%], y∈[27%,97%],
 * and the dark drape valance where the name / type sit spans y∈[8%,27%]. Text
 * layers stay inside these bounds so rules text never overlaps the dark drape
 * regions of the art.
 */
export const FRAME_LAYOUT = {
  /** Left / right padding for every text layer (fraction of frame width). */
  sidePadding: 0.12,
  /** Top of the name / type baseline row (fraction of frame height). */
  nameRowTop: 0.07,
  /** Bottom of the name / type baseline row — the parchment top edge. */
  nameRowBottom: 0.27,
  /** Top of the rules-text region (fraction of frame height). */
  rulesTop: 0.3,
  /** Bottom margin of the rules-text region (fraction of frame height). */
  rulesBottom: 0.06,
} as const;

/** Returns the parchment frame overlay URL for a card type. */
export function cardFrameUrl(cardType: CardType): string {
  return cardType === "Event" ? CARD_FRAME_EVENT_URL : CARD_FRAME_CHARACTER_URL;
}
