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
 * Geometry of the writable regions within the frame PNG, expressed as
 * fractions of the frame box. Derived by sampling the parchment (tan) pixels
 * in `card_frame.png` row by row. The parchment is a downward-narrowing
 * trapezoid — the side drapes angle inward, so it is widest near the top
 * (x∈[6.5%,93.9%] at y=30%) and narrowest at the bottom (x∈[16.7%,84.0%] at
 * y=90%). The rules region is therefore inset to a rectangle that stays inside
 * the parchment for every one of its rows, so rules text never spills onto the
 * dark drapes.
 *
 * The dark drape valance where the name / type sit spans y∈[11%,27%]; the
 * name row baseline is anchored just above the parchment's top edge (~25%).
 */
export const FRAME_LAYOUT = {
  /** Left / right inset of the rules-text rectangle (fraction of frame width). */
  rulesSidePadding: 0.17,
  /** Top of the rules-text region (fraction of frame height). */
  rulesTop: 0.31,
  /** Bottom inset of the rules-text region (fraction of frame height). */
  rulesBottom: 0.12,
  /** Left / right inset of the name / type row (fraction of frame width). */
  nameSidePadding: 0.12,
  /**
   * Bottom edge of the name / type row, as a fraction from the frame top. Sits
   * just above the parchment so the shared text baseline (with the row's
   * line-height of 1, the baseline lands a fraction of an em above this line)
   * rests on the dark drape band.
   */
  nameRowBottom: 0.255,
} as const;

/** Returns the parchment frame overlay URL for a card type. */
export function cardFrameUrl(cardType: CardType): string {
  return cardType === "Event" ? CARD_FRAME_EVENT_URL : CARD_FRAME_CHARACTER_URL;
}
