import type { CardData } from "../types/cards";

/** Returns the URL path for a card's image, keyed by its image number. */
export function cardImageUrl(imageNumber: number): string {
  return `/cards/${String(imageNumber)}.webp`;
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
