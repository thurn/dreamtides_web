import type { CardData } from "../types/cards";
import { parseCardName } from "../types/card-identity";
import { economyFixture } from "../testing/economy-fixture";
import { testCardId } from "../types/test-identities";

export const ECONOMY = economyFixture();

export function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: parseCardName("Test Card"),
    id: testCardId("test-id"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "Test text",
    imageNumber: 1,
    artOwned: false,
    ...overrides,
  };
}

export function makeDatabase(cards: CardData[]): Map<number, CardData> {
  const db = new Map<number, CardData>();
  for (const card of cards) {
    db.set(card.cardNumber, card);
  }
  return db;
}
