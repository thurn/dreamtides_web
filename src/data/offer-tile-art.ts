/** Fixed card-art fields used by symbolic Dream Augury offer compositions. */
export const OFFER_TILE_BACKGROUND_IMAGE_NUMBERS = {
  "dreamsign-gift": 386654065,
  "dreamsign-draft": 420863587,
  "add-site": 334049261,
} as const;

export type OfferTileBackgroundKind =
  keyof typeof OFFER_TILE_BACKGROUND_IMAGE_NUMBERS;
