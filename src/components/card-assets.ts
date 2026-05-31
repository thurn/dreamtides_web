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

/** Returns the parchment frame overlay URL for a card type. */
export function cardFrameUrl(cardType: CardType): string {
  return cardType === "Event" ? CARD_FRAME_EVENT_URL : CARD_FRAME_CHARACTER_URL;
}
