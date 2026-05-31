import { createAvatar } from "@dicebear/core";
import { identicon } from "@dicebear/collection";
import type { CardData } from "../types/cards";

/** Returns the URL path for a card's image, keyed by its image number. */
export function cardImageUrl(imageNumber: number): string {
  return `/cards/${String(imageNumber)}.webp`;
}

/**
 * Whether a card has an assigned art image. Card sources that have not had art
 * keyed yet (e.g. `cards_v2.toml`) leave `image-number` blank, which arrives
 * here as an empty string, `null`, or a non-positive value. Such cards fall
 * back to a generated identicon rather than a missing-image placeholder.
 */
export function hasAssignedImage(imageNumber: CardData["imageNumber"]): boolean {
  const value = Number(imageNumber);
  return Number.isFinite(value) && value > 0;
}

// Memoize identicons by seed: `createAvatar` is deterministic per seed, so a
// grid that re-renders frequently (the card editor) avoids regenerating the
// same SVG data URI on every pass.
const identiconCache = new Map<string, string>();

/**
 * Returns a deterministic "identicon" style avatar as an SVG data URI, used as
 * the art fallback for cards without an assigned image. The seed should be a
 * stable per-card identifier so the same card always renders the same glyph.
 */
export function cardIdenticonUri(seed: string): string {
  const cached = identiconCache.get(seed);
  if (cached !== undefined) {
    return cached;
  }
  const uri = createAvatar(identicon, {
    seed,
    size: 128,
    backgroundColor: ["1a1025"],
    backgroundType: ["solid"],
  }).toDataUri();
  identiconCache.set(seed, uri);
  return uri;
}

export function isStarterCard(card: Pick<CardData, "isStarter">): boolean {
  return card.isStarter;
}

/**
 * Fetches card-data.json and returns a Map keyed by card number.
 * The JSON file is served from the public directory at /card-data.json.
 */
export async function loadCardDatabase(): Promise<Map<number, CardData>> {
  const response = await fetch("/card-data.json");
  if (!response.ok) {
    throw new Error(
      `Failed to load card data: ${String(response.status)} ${response.statusText}`,
    );
  }
  const cards = (await response.json()) as CardData[];
  const database = new Map<number, CardData>();
  for (const card of cards) {
    database.set(card.cardNumber, card);
  }
  return database;
}
