import { describe, expect, it } from "vitest";
import { computeDeckSummary } from "./deck-summary";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import type { DeckEntry } from "../types/quest";

function makeCard(
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return {
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: true,
    ...overrides,
    id: asCardId(overrides.id ?? `card-${String(cardNumber)}`),
    name: asCardName(overrides.name ?? `Card ${String(cardNumber)}`),
  };
}

function makeDeckEntry(cardNumber: number): DeckEntry {
  return {
    entryId: `entry-${String(cardNumber)}`,
    cardNumber,
    transfiguration: null,
    isBane: false,
  };
}

describe("computeDeckSummary", () => {
  it("returns zeroed metrics for an empty deck", () => {
    const summary = computeDeckSummary([], new Map());

    expect(summary.total).toBe(0);
    expect(summary.characterCount).toBe(0);
    expect(summary.eventCount).toBe(0);
    expect(summary.averageEnergyCost).toBeNull();
  });

  it("summarizes types and energy cost", () => {
    const database = new Map<number, CardData>([
      [1, makeCard(1, { isStarter: true, energyCost: 1 })],
      [2, makeCard(2, { energyCost: 3, cardType: "Event" })],
      [3, makeCard(3, { energyCost: null })],
      [4, makeCard(4, { energyCost: 4 })],
    ]);

    const summary = computeDeckSummary(
      [1, 2, 3, 4].map(makeDeckEntry),
      database,
    );

    expect(summary.total).toBe(4);
    expect(summary.characterCount).toBe(3);
    expect(summary.eventCount).toBe(1);
    expect(summary.averageEnergyCost).toBe(2.7);
  });
});
