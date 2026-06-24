import { describe, it, expect } from "vitest";
import type { CardData } from "../types/cards";
import type { GeneratedPool } from "../draft/pool";
import {
  buildIdIndex,
  buildLegendaryCardNumbers,
  resolvePool,
} from "./cards-v2-database";
import { asCardId, asCardName } from "../types/card-identity";

/** The synthetic card id a `makeCard` record carries for a given card number. */
function idFor(cardNumber: number): string {
  return `id-${String(cardNumber)}`;
}

/**
 * Minimal card record factory. Only the fields `buildIdIndex` /
 * `buildLegendaryCardNumbers` read (id, cardNumber, rarity) matter here; the
 * rest carry placeholder values so the tests do not depend on production card
 * data.
 */
function makeCard(overrides: Partial<CardData> & {
  name: string;
  cardNumber: number;
}): CardData {
  return {
    id: asCardId(idFor(overrides.cardNumber)),
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

/**
 * Build a pool keyed by card id ({@link CardId}). Keys are the synthetic card
 * ids `makeCard` assigns, so the pool resolves through the id index exactly as a
 * real variant's id-keyed output does.
 */
function makePool(copiesByCardNumber: Record<number, number>): GeneratedPool {
  const counts = new Map(
    Object.entries(copiesByCardNumber).map(([cardNumber, copies]) => [
      asCardId(idFor(Number(cardNumber))),
      copies,
    ]),
  );
  let size = 0;
  for (const copies of counts.values()) size += copies;
  return {
    identity: "u",
    themes: [],
    counts,
    seed: 1,
    size,
    variant: "tides4",
  };
}

describe("buildLegendaryCardNumbers", () => {
  it("collects exactly the card numbers whose rarity is Legendary", () => {
    const db = new Map<number, CardData>([
      [1, makeCard({ name: asCardName("Ordinary"), cardNumber: 1 })],
      [2, makeCard({ name: asCardName("Hero"), cardNumber: 2, rarity: "Legendary" })],
      [3, makeCard({ name: asCardName("Starter"), cardNumber: 3, rarity: "Starter" })],
      [4, makeCard({ name: asCardName("Champion"), cardNumber: 4, rarity: "Legendary" })],
    ]);
    const legendary = buildLegendaryCardNumbers(db);
    expect(legendary).toEqual(new Set([2, 4]));
  });
});

describe("resolvePool legendary cap", () => {
  const db = new Map<number, CardData>([
    [10, makeCard({ name: asCardName("Common"), cardNumber: 10 })],
    [11, makeCard({ name: asCardName("Legend"), cardNumber: 11, rarity: "Legendary" })],
  ]);
  const idIndex = buildIdIndex(db);
  const legendaryCardNumbers = buildLegendaryCardNumbers(db);

  it("caps a legendary card at one copy even when the pool asks for two", () => {
    const resolved = resolvePool(
      makePool({ 10: 2, 11: 2 }),
      idIndex,
      legendaryCardNumbers,
    );
    expect(resolved.draftPoolCopiesByCard["10"]).toBe(2);
    expect(resolved.draftPoolCopiesByCard["11"]).toBe(1);
    expect(resolved.cappedLegendaryCardNumbers).toEqual([11]);
  });

  it("leaves a single-copy legendary untouched and reports no cap", () => {
    const resolved = resolvePool(
      makePool({ 11: 1 }),
      idIndex,
      legendaryCardNumbers,
    );
    expect(resolved.draftPoolCopiesByCard["11"]).toBe(1);
    expect(resolved.cappedLegendaryCardNumbers).toEqual([]);
  });

  it("applies the standard two-copy cap when no legendary set is supplied", () => {
    const resolved = resolvePool(makePool({ 11: 2 }), idIndex);
    expect(resolved.draftPoolCopiesByCard["11"]).toBe(2);
    expect(resolved.cappedLegendaryCardNumbers).toEqual([]);
  });
});
