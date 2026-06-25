import { describe, expect, it } from "vitest";

import type { CardData } from "./types/cards";
import type { DeckEntry } from "./types/quest";
import { asCardId, asCardName } from "./types/card-identity";
import {
  applyCardKeywordModification,
  applyCardStatOverride,
  resolveDeckEntryCard,
} from "./card-type-change";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Test Event"),
    id: asCardId("test-event"),
    cardNumber: 1,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

describe("applyCardKeywordModification", () => {
  it("adds visible Reclaim text to effective card data", () => {
    const card = makeCard();

    expect(applyCardKeywordModification(card, { reclaim: 2 })).toMatchObject({
      renderedText: "Draw a card.\n\nReclaim 2●",
    });
  });

  it("keeps Reclaim text stable when applying the same modifier repeatedly", () => {
    const card = makeCard();

    const once = applyCardKeywordModification(card, { reclaim: 2 });
    const twice = applyCardKeywordModification(once, { reclaim: 2 });

    expect(twice.renderedText).toBe("Draw a card.\n\nReclaim 2●");
  });
});

function makeDeckEntry(overrides: Partial<DeckEntry> = {}): DeckEntry {
  return {
    entryId: "entry-1",
    cardNumber: 1,
    transfiguration: null,
    isBane: false,
    ...overrides,
  };
}

describe("applyCardStatOverride", () => {
  it("partial override leaves the other stat intact: only-spark keeps energyCost", () => {
    const card = makeCard({ energyCost: 5, spark: 2 });

    const result = applyCardStatOverride(card, { spark: 9 });

    expect(result.spark).toBe(9);
    expect(result.energyCost).toBe(5);
  });

  it("partial override leaves the other stat intact: only-energyCost keeps spark", () => {
    const card = makeCard({ energyCost: 5, spark: 2 });

    const result = applyCardStatOverride(card, { energyCost: 0 });

    expect(result.energyCost).toBe(0);
    expect(result.spark).toBe(2);
  });

  it("partial override leaves the other stat intact: null/undefined/empty override is a no-op", () => {
    const card = makeCard({ energyCost: 5, spark: 2 });

    expect(applyCardStatOverride(card, null)).toBe(card);
    expect(applyCardStatOverride(card, undefined)).toBe(card);
    expect(applyCardStatOverride(card, {})).toMatchObject({
      energyCost: 5,
      spark: 2,
    });
  });
});

describe("resolveDeckEntryCard", () => {
  it("override wins over transfiguration-derived stats: Empowered halves cost but override takes precedence", () => {
    const card = makeCard({ energyCost: 8 });
    const entry = makeDeckEntry({
      transfiguration: "Empowered",
      statOverride: { energyCost: 3 },
    });

    // Empowered alone would halve 8 -> 4; the override wins with 3.
    const result = resolveDeckEntryCard(card, entry);

    expect(result.energyCost).toBe(3);
  });

  it("resolveDeckEntryCard composes all layers: transfiguration, typeChange, keyword, and statOverride together", () => {
    const card = makeCard({
      cardType: "Event",
      subtype: "",
      energyCost: 6,
      isFast: false,
      renderedText: "Draw a card.",
    });
    const entry = makeDeckEntry({
      transfiguration: "Empowered",
      typeChange: {
        predicateId: "predicate-1",
        cardType: "Character",
        subtype: "Spirit",
        label: "Becomes a Spirit",
      },
      keywordModification: { fast: true, reclaim: 2 },
      statOverride: { spark: 7 },
    });

    const result = resolveDeckEntryCard(card, entry);

    // typeChange layer
    expect(result.cardType).toBe("Character");
    expect(result.subtype).toBe("Spirit");
    // keyword layer
    expect(result.isFast).toBe(true);
    expect(result.reclaimCost).toBe(2);
    expect(result.renderedText).toContain("Reclaim 2●");
    // statOverride layer (spark only; energyCost still transfiguration-derived 3)
    expect(result.spark).toBe(7);
    expect(result.energyCost).toBe(3);
  });
});
