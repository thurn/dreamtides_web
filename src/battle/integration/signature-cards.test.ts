import { describe, expect, it } from "vitest";
import { selectSignatureCards, glossaryTermsIn } from "./signature-cards";
import { GLOSSARY } from "../../data/glossary";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";

/**
 * Distinct, single-word, letter-only glossary keywords, taken from the live
 * glossary so the test never hardcodes term spellings (which are subject to
 * change). Two distinct keywords are all the relative-ranking assertions need.
 */
function plainGlossaryTerms(): string[] {
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const entry of GLOSSARY) {
    if (/^[A-Za-z]+$/.test(entry.term) && !seen.has(entry.term)) {
      seen.add(entry.term);
      terms.push(entry.term);
    }
  }
  return terms;
}

function makeCard(
  overrides: Partial<CardData> & { cardNumber: number; renderedText: string },
): CardData {
  return {
    name: asCardName(`Card ${String(overrides.cardNumber)}`),
    id: asCardId(`card-${String(overrides.cardNumber)}`),
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    imageNumber: 0,
    artOwned: false,
    ...overrides,
  };
}

describe("glossaryTermsIn", () => {
  it("collects the glossary keywords referenced by a run of text", () => {
    const [termA, termB] = plainGlossaryTerms();
    const terms = glossaryTermsIn(`When you ${termA}, then ${termB}.`);
    expect(terms.has(termA)).toBe(true);
    expect(terms.has(termB)).toBe(true);
  });

  it("returns an empty set for text with no glossary keywords", () => {
    expect(glossaryTermsIn("A quiet field at evening.").size).toBe(0);
  });
});

describe("selectSignatureCards", () => {
  it("prefers cards sharing the ability's keyword over cards that do not", () => {
    const [termA, termB] = plainGlossaryTerms();
    const abilityText = `Once per turn, when you ${termA} an ally, draw a card.`;

    const onTheme = makeCard({
      cardNumber: 1,
      renderedText: `When you ${termA} an ally, this gains spark.`,
    });
    const offTheme = makeCard({
      cardNumber: 2,
      renderedText: `${termB} a card from your hand.`,
    });

    const picks = selectSignatureCards({
      abilityText,
      candidates: [offTheme, onTheme],
      count: 1,
    });

    expect(picks).toHaveLength(1);
    expect(picks[0]?.cardId).toBe(onTheme.id);
    expect(picks[0]?.matchedTerms).toContain(termA);
    expect(picks[0]?.score).toBeGreaterThan(0);
  });

  it("never selects starter cards", () => {
    const [termA] = plainGlossaryTerms();
    const abilityText = `When you ${termA}, gain an advantage.`;
    const starter = makeCard({
      cardNumber: 1,
      isStarter: true,
      rarity: "Starter",
      renderedText: `When you ${termA}, draw a card.`,
    });
    const nonStarter = makeCard({
      cardNumber: 2,
      renderedText: "A plain card with no shared keyword.",
    });

    const picks = selectSignatureCards({
      abilityText,
      candidates: [starter, nonStarter],
      count: 3,
    });

    expect(picks.map((pick) => pick.cardId)).not.toContain(starter.id);
    expect(picks.map((pick) => pick.cardId)).toContain(nonStarter.id);
  });

  it("deduplicates repeated cards and caps the result at the requested count", () => {
    const [termA] = plainGlossaryTerms();
    const card = makeCard({
      cardNumber: 1,
      renderedText: `When you ${termA}, gain spark.`,
    });
    const other = makeCard({ cardNumber: 2, renderedText: "Nothing relevant." });
    const another = makeCard({ cardNumber: 3, renderedText: "Also nothing." });

    const picks = selectSignatureCards({
      abilityText: `${termA} an ally.`,
      // `card` appears three times; the signature set must not repeat it.
      candidates: [card, card, card, other, another],
      count: 2,
    });

    expect(picks).toHaveLength(2);
    const ids = picks.map((pick) => pick.cardId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe(card.id);
  });

  it("falls back to the deck's marquee cards when no keyword is shared", () => {
    // An ability with no glossary keyword: every score is zero, so the
    // tie-breakers (rarity, then energy cost, then spark) decide the order.
    const legendaryBomb = makeCard({
      cardNumber: 1,
      rarity: "Legendary",
      energyCost: 6,
      spark: 6,
      renderedText: "A singular threat.",
    });
    const cheapCard = makeCard({
      cardNumber: 2,
      energyCost: 1,
      spark: 1,
      renderedText: "A small card.",
    });

    const picks = selectSignatureCards({
      abilityText: "A calm and wordless presence.",
      candidates: [cheapCard, legendaryBomb],
      count: 1,
    });

    expect(picks[0]?.cardId).toBe(legendaryBomb.id);
    expect(picks[0]?.matchedTerms).toEqual([]);
  });

  it("is deterministic for the same deck and ability", () => {
    const [termA, termB] = plainGlossaryTerms();
    const candidates = [
      makeCard({ cardNumber: 1, renderedText: `${termA} now.` }),
      makeCard({ cardNumber: 2, renderedText: `${termB} now.` }),
      makeCard({ cardNumber: 3, renderedText: `${termA} and ${termB}.` }),
    ];
    const args = {
      abilityText: `${termA} repeatedly.`,
      candidates,
      count: 2,
    };
    const first = selectSignatureCards(args).map((pick) => pick.cardId);
    const second = selectSignatureCards(args).map((pick) => pick.cardId);
    expect(first).toEqual(second);
  });
});
