import type { CardData } from "../types/cards";
import { assetUrl } from "../runtime/asset-url";

/** Returns the URL for a card's image, keyed by its image number. */
export function cardImageUrl(imageNumber: number): string {
  return assetUrl(`/cards/${String(imageNumber)}.webp`);
}

/**
 * Whether a card has an assigned art image. Card sources that have not had art
 * keyed yet leave the image number unset, which arrives
 * here as an empty string, `null`, or a non-positive value. Such cards render
 * their surface's missing-art treatment.
 */
export function hasAssignedImage(imageNumber: CardData["imageNumber"]): boolean {
  const value = Number(imageNumber);
  return Number.isFinite(value) && value > 0;
}
