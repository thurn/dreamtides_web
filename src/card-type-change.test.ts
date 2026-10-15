import { describe, expect, it } from "vitest";

import type { CardData } from "./types/cards";
import type { DeckEntry } from "./types/journey";
import { parseCardName } from "./types/card-identity";
import {
  applyCardKeywordModification,
  applyCardSparkBonus,
  applyCardStatOverride,
  resolveDeckEntryCard,
} from "./card-type-change";
import { transfigurationFixture } from "./testing/transfiguration-fixture";
import { parseDeckEntryId } from "./types/identifiers";
import { parseCardTypeChangePredicateId } from "./types/identifiers";
import { testCardId } from "./types/test-identities";
import { TRANSFIGURE_MARK_END, TRANSFIGURE_MARK_START } from "./runtime/transfigure-markers";

const transfigurationData = transfigurationFixture();

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: parseCardName("Test Event"),
    id: testCardId("test-event"),
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

  it("treats zero-cost Reclaim as an explicit playable keyword", () => {
    const card = makeCard();

    expect(applyCardKeywordModification(card, { setReclaim: 0 })).toMatchObject(
      {
        reclaimCost: 0,
        renderedText: "Draw a card.\n\nReclaim 0●",
      },
    );
  });

  it("keeps Reclaim text stable when applying the same modifier repeatedly", () => {
    const card = makeCard();

    const once = applyCardKeywordModification(card, { reclaim: 2 });
    const twice = applyCardKeywordModification(once, { reclaim: 2 });

    expect(twice.renderedText).toBe("Draw a card.\n\nReclaim 2●");
  });

  it("reduces numeric energy costs without changing variable cost labels", () => {
    const card = makeCard({ energyCost: 3, energyCosts: ["3", "X"] });

    const reduced = applyCardKeywordModification(card, {
      energyCostReduction: 1,
    });

    expect(reduced.energyCost).toBe(2);
    expect(reduced.energyCosts).toEqual(["2", "X"]);
  });
});

function makeDeckEntry(overrides: Partial<DeckEntry> = {}): DeckEntry {
  return {
    entryId: parseDeckEntryId("entry-1"),
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
    expect(applyCardStatOverride(card, {})).toBe(card);
  });
});

describe("applyCardSparkBonus", () => {
  it("adds a persistent bonus without manufacturing spark for a null stat", () => {
    const character = makeCard({ cardType: "Character", spark: 2 });
    const event = makeCard({ cardType: "Event", spark: null });

    expect(applyCardSparkBonus(character, 1).spark).toBe(3);
    expect(applyCardSparkBonus(event, 1)).toBe(event);
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
    const result = resolveDeckEntryCard(transfigurationData, card, entry);

    expect(result.energyCost).toBe(3);
  });

  it("resolveDeckEntryCard composes transfiguration, type, keyword, spark bonus, and override layers", () => {
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
        predicateId: parseCardTypeChangePredicateId("predicate-1"),
        cardType: "Character",
        subtype: "Spirit Animal",
        label: "Becomes a Spirit",
      },
      keywordModification: { fast: true, reclaim: 2, energyCostReduction: 1 },
      sparkBonus: 2,
      statOverride: { spark: 7 },
    });

    const result = resolveDeckEntryCard(transfigurationData, card, entry);

    // typeChange layer
    expect(result.cardType).toBe("Character");
    expect(result.subtype).toBe("Spirit Animal");
    // keyword layer
    expect(result.isFast).toBe(true);
    expect(result.reclaimCost).toBe(2);
    expect(result.renderedText).toContain("Reclaim 2●");
    // the absolute debug override is applied after the additive spark bonus
    expect(result.spark).toBe(7);
    // The persistent reduction applies to the transfiguration-derived cost.
    expect(result.energyCost).toBe(2);
  });

  it("applies an additive spark bonus after a transfiguration", () => {
    const card = makeCard({ cardType: "Character", energyCost: 4, spark: 2 });
    const entry = makeDeckEntry({
      transfiguration: "Kindled",
      sparkBonus: 1,
    });

    expect(resolveDeckEntryCard(transfigurationData, card, entry).spark).toBe(
      5,
    );
  });
});


describe("effective Reclaim declaration contracts", () => {
  const declarations = [
    "Reclaim", "Reclaim 9●", "Reclaim – 9●, Banish 3 cards from your void",
    "Reclaim – Abandon a character", "Reclaim – Discard X cards",
  ];
  const mark = (text: string): string => TRANSFIGURE_MARK_START + text + TRANSFIGURE_MARK_END;
  const effective = (text: string, price = 1): CardData =>
    applyCardKeywordModification(makeCard({ renderedText: text }), { setReclaim: price });
  const declaration = (price = 1): string => effective("", price).renderedText.trim();

  it.each(declarations)("converges complete %s declarations while preserving their neighbors", (old) => {
    for (const [prefix, suffix] of [
      ["", ""],
      ["A synthetic neighbor. ", ". Another synthetic neighbor."],
      ["A synthetic neighbor.\n\n", ".\n\nA following ability."],
    ]) {
      const source = prefix + old + suffix;
      const card = makeCard({ renderedText: source });
      const before = structuredClone(card);
      const actual = applyCardKeywordModification(card, { setReclaim: 1 });
      expect(actual.renderedText).toBe(effective(prefix + declaration() + suffix).renderedText);
      expect(actual.renderedText.startsWith(prefix)).toBe(true);
      expect(actual.renderedText.endsWith(suffix)).toBe(true);
      expect(actual.reclaimCost).toBe(1);
      expect(actual.energyCost).toBe(card.energyCost);
      expect(card).toEqual(before);
      expect(effective(actual.renderedText).renderedText).toBe(actual.renderedText);
      expect(effective(effective(source, 4).renderedText).renderedText).toBe(actual.renderedText);
    }
  });

  it("preserves keyword-list separators and prose references without treating them as declarations", () => {
    const prefix = "When you reclaim this character, it gains a counter.\n\nAwakened, ";
    const suffix = "\n\nReclaim abilities cost you less. Cards you reclaim travel.";
    const actual = effective(prefix + declarations[1] + suffix);
    expect(actual.renderedText).toBe(effective(prefix + declaration() + suffix).renderedText);
    expect(actual.renderedText.startsWith(prefix)).toBe(true);
    expect(actual.renderedText.endsWith(suffix)).toBe(true);
    const prose = "A character may gain Reclaim 9●. When you reclaim this character, draw.";
    expect(effective(prose).renderedText.startsWith(prose)).toBe(true);
  });

  it("keeps zero override priority and a single declaration across repeated grants", () => {
    const source = makeCard({ renderedText: declarations[2] + ". Reclaim." });
    const result = applyCardKeywordModification(source, { setReclaim: 0, reclaim: 8 });
    expect(result).toEqual(applyCardKeywordModification(source, { setReclaim: 0 }));
    expect(result.reclaimCost).toBe(0);
    expect(result.renderedText.split(declaration(0)).length - 1).toBe(1);
    expect(result.renderedText.trimEnd()).toBe(effective(declaration(0) + ".", 0).renderedText);
    expect(effective(result.renderedText, 0).renderedText).toBe(result.renderedText);
  });

  it.each(declarations)("preserves whole-clause and neighboring marks for %s", (old) => {
    const prefix = mark("A marked neighbor.") + " ";
    const suffix = " An unmarked neighbor. " + mark("Another marked neighbor.");
    const actual = effective(prefix + mark(old + ".") + suffix).renderedText;
    const expected = effective(prefix + mark(declaration() + ".") + suffix).renderedText;
    expect(actual).toBe(expected);
    expect(actual.startsWith(prefix)).toBe(true);
    expect(actual.endsWith(suffix)).toBe(true);
    expect(effective(actual).renderedText).toBe(actual);
  });

  it("preserves separately marked payment and outside highlight state", () => {
    const prefix = "A preceding ability. ";
    const suffix = ". An unmarked sentence. " + mark("A marked sentence.");
    const old = "Reclaim " + mark("9●") + suffix;
    const canonical = declaration();
    const split = canonical.indexOf(" ");
    const expected = prefix + canonical.slice(0, split + 1) + mark(canonical.slice(split + 1)) + suffix;
    expect(effective(prefix + old).renderedText).toBe(expected);
  });

  it("agrees across legacy and chronological Enduring records without mutating printed inputs", () => {
    const card = makeCard({ renderedText: "A synthetic event." });
    const legacy = makeDeckEntry({ transfiguration: "Enduring", keywordModification: { setReclaim: 1 } });
    const history = { ...legacy, transfigurationApplications: [{ form: "Enduring" as const }] };
    const before = structuredClone({ card, legacy, history });
    const first = resolveDeckEntryCard(transfigurationData, card, legacy);
    const second = resolveDeckEntryCard(transfigurationData, card, history);
    expect(second.renderedText).toBe(first.renderedText);
    expect(second.reclaimCost).toBe(first.reclaimCost);
    expect(second.energyCost).toBe(first.energyCost);
    expect(first.renderedText.split(declaration()).length - 1).toBe(1);
    expect(first.reclaimCost).toBe(1);
    expect({ card, legacy, history }).toEqual(before);
  });
});
