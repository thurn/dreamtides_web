import { describe, it, expect } from "vitest";
import type { CardData } from "../types/cards";
import type { GeneratedPool } from "../draft/pool";
import { buildIdIndex, resolvePool } from "./cards-v2-database";
import { parseCardName } from "../types/card-identity";
import { testDreamAvatarId, testCardId } from "../types/test-identities";

/** The synthetic card id a `makeCard` record carries for a given card number. */
function idFor(cardNumber: number): string {
  return `id-${String(cardNumber)}`;
}

/**
 * Minimal card record factory. Only the fields used by the UUID index and cap
 * fixtures matter here; the rest are stable placeholders.
 */
function makeCard(
  overrides: Partial<CardData> & {
    name: string;
    cardNumber: number;
  },
): CardData {
  return {
    id: testCardId(idFor(overrides.cardNumber)),
    cardType: "Character",
    subtype: "Monster",
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
      testCardId(idFor(Number(cardNumber))),
      copies,
    ]),
  );
  let size = 0;
  for (const copies of counts.values()) size += copies;
  return {
    counts,
    seed: 1,
    size,
    variant: "tides4",
    tideDeckIds: [],
    tides4Provenance: {
      dreamAvatarId: testDreamAvatarId("test-avatar"),
      signatureless: false,
      borrowedArchetypeName: null,
      dealSize: size,
      cap: 2,
      maxFacets: 0,
      facetDrawnCount: 0,
      facetAvailableCount: 0,
      tides: [],
      cardProvenanceById: {},
    },
  };
}

describe("resolvePool copy caps", () => {
  const db = new Map<number, CardData>([
    [10, makeCard({ name: parseCardName("Common"), cardNumber: 10 })],
    [
      11,
      makeCard({
        name: parseCardName("Special"),
        cardNumber: 11,
        rarity: "Special",
      }),
    ],
  ]);
  const idIndex = buildIdIndex(db);
  const rarityCopyCaps = new Map([[11, 1]]);

  it("caps a configured rarity at one copy even when the pool asks for two", () => {
    const resolved = resolvePool(
      makePool({ 10: 2, 11: 2 }),
      idIndex,
      2,
      rarityCopyCaps,
    );
    expect(resolved.draftPoolCopiesByCard["10"]).toBe(2);
    expect(resolved.draftPoolCopiesByCard["11"]).toBe(1);
    expect(resolved.cappedCardNumbers).toEqual([11]);
  });

  it("leaves a single-copy rarity-capped card untouched and reports no cap", () => {
    const resolved = resolvePool(
      makePool({ 11: 1 }),
      idIndex,
      2,
      rarityCopyCaps,
    );
    expect(resolved.draftPoolCopiesByCard["11"]).toBe(1);
    expect(resolved.cappedCardNumbers).toEqual([]);
  });

  it("applies the standard two-copy cap when no rarity override is supplied", () => {
    const resolved = resolvePool(makePool({ 11: 2 }), idIndex);
    expect(resolved.draftPoolCopiesByCard["11"]).toBe(2);
    expect(resolved.cappedCardNumbers).toEqual([]);
  });
});
