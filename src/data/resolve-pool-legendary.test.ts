import { describe, it, expect } from "vitest";
import type { CardData } from "../types/cards";
import type { GeneratedPool } from "../draft/pool";
import {
  buildLegendaryCardNumbers,
  buildNameIndex,
  resolvePool,
} from "./cards-v2-database";

/**
 * Minimal card record factory. Only the fields `buildNameIndex` /
 * `buildLegendaryCardNumbers` read (name, cardNumber, rarity) matter here; the
 * rest carry placeholder values so the tests do not depend on production card
 * data.
 */
function makeCard(overrides: Partial<CardData> & {
  name: string;
  cardNumber: number;
}): CardData {
  return {
    id: `id-${String(overrides.cardNumber)}`,
    cardType: "Character",
    subtype: "Beast",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function makePool(counts: Record<string, number>): GeneratedPool {
  return {
    identity: "u",
    themes: [],
    counts: new Map(Object.entries(counts)),
    seed: 1,
    size: Object.values(counts).reduce((a, b) => a + b, 0),
    variant: "tides4",
  };
}

describe("buildLegendaryCardNumbers", () => {
  it("collects exactly the card numbers whose rarity is Legendary", () => {
    const db = new Map<number, CardData>([
      [1, makeCard({ name: "Ordinary", cardNumber: 1 })],
      [2, makeCard({ name: "Hero", cardNumber: 2, rarity: "Legendary" })],
      [3, makeCard({ name: "Starter", cardNumber: 3, rarity: "Starter" })],
      [4, makeCard({ name: "Champion", cardNumber: 4, rarity: "Legendary" })],
    ]);
    const legendary = buildLegendaryCardNumbers(db);
    expect(legendary).toEqual(new Set([2, 4]));
  });
});

describe("resolvePool legendary cap", () => {
  const db = new Map<number, CardData>([
    [10, makeCard({ name: "Common", cardNumber: 10 })],
    [11, makeCard({ name: "Legend", cardNumber: 11, rarity: "Legendary" })],
  ]);
  const nameIndex = buildNameIndex(db);
  const legendaryCardNumbers = buildLegendaryCardNumbers(db);

  it("caps a legendary card at one copy even when the pool asks for two", () => {
    const resolved = resolvePool(
      makePool({ Common: 2, Legend: 2 }),
      nameIndex,
      legendaryCardNumbers,
    );
    expect(resolved.draftPoolCopiesByCard["10"]).toBe(2);
    expect(resolved.draftPoolCopiesByCard["11"]).toBe(1);
    expect(resolved.cappedLegendaryCardNumbers).toEqual([11]);
  });

  it("leaves a single-copy legendary untouched and reports no cap", () => {
    const resolved = resolvePool(
      makePool({ Legend: 1 }),
      nameIndex,
      legendaryCardNumbers,
    );
    expect(resolved.draftPoolCopiesByCard["11"]).toBe(1);
    expect(resolved.cappedLegendaryCardNumbers).toEqual([]);
  });

  it("applies the standard two-copy cap when no legendary set is supplied", () => {
    const resolved = resolvePool(makePool({ Legend: 2 }), nameIndex);
    expect(resolved.draftPoolCopiesByCard["11"]).toBe(2);
    expect(resolved.cappedLegendaryCardNumbers).toEqual([]);
  });
});
