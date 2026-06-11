import { describe, expect, it } from "vitest";
import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import type { CardData } from "../../types/cards";
import { dreamsignHasDeckCoverage, dreamsignMatchScore } from "./dreamsignMatch";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeCard(
  id: string,
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return {
    id,
    cardNumber,
    name: `Card-${id}`,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 2,
    spark: null,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: false,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<DreamsignProfile> = {}): DreamsignProfile {
  return {
    id: "profile-uuid",
    subtypes: [],
    cardTypes: [],
    costBands: [],
    keywords: [],
    quality: 2,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Scoring model
// ---------------------------------------------------------------------------
// Each feature's coverage = min(1, matchingDeckCards / 3); the profile score is
// the mean coverage across its features, times the quality weight
// (quality 1 -> 1.2, quality 2 -> 1.0, quality 3 -> 0.8). A featureless or
// undefined profile scores FEATURELESS_COVERAGE (0.4) * quality weight.

describe("dreamsignMatchScore — featureless profile", () => {
  it("featureless quality-2 profile scores 0.4 * 1.0 = 0.4", () => {
    const profile = makeProfile({ quality: 2, subtypes: [], cardTypes: [], costBands: [], keywords: [] });
    const deck: CardData[] = [];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.4);
  });

  it("featureless quality-1 profile scores 0.4 * 1.2 = 0.48", () => {
    const profile = makeProfile({ quality: 1, subtypes: [], cardTypes: [], costBands: [], keywords: [] });
    const deck: CardData[] = [];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.48);
  });

  it("featureless quality-3 profile scores 0.4 * 0.8 = 0.32", () => {
    const profile = makeProfile({ quality: 3, subtypes: [], cardTypes: [], costBands: [], keywords: [] });
    const deck: CardData[] = [];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.32);
  });
});

describe("dreamsignMatchScore — undefined profile", () => {
  it("undefined profile (featureless quality-2) scores 0.4", () => {
    const deck: CardData[] = [];
    expect(dreamsignMatchScore(undefined, deck)).toBeCloseTo(0.4);
  });

  it("undefined profile with deck cards still scores 0.4", () => {
    const deck = [makeCard("c1", 1), makeCard("c2", 2)];
    expect(dreamsignMatchScore(undefined, deck)).toBeCloseTo(0.4);
  });
});

describe("dreamsignMatchScore — single feature, full coverage", () => {
  it("one subtype feature, 3 matching cards => 1.0 * qualityWeight", () => {
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
      makeCard("c3", 3, { subtype: "Warrior" }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.0);
  });

  it("one subtype feature, quality 1, 3 matching => 1.0 * 1.2", () => {
    const profile = makeProfile({ quality: 1, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
      makeCard("c3", 3, { subtype: "Warrior" }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.2);
  });

  it("one subtype feature, quality 3, 3 matching => 1.0 * 0.8", () => {
    const profile = makeProfile({ quality: 3, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
      makeCard("c3", 3, { subtype: "Warrior" }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.8);
  });
});

describe("dreamsignMatchScore — graded coverage", () => {
  it("0 matching cards => 0 coverage => score 0 (never suited)", () => {
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Outsider" }),
      makeCard("c2", 2, { subtype: "Outsider" }),
    ];
    // The deck has no Warriors, so a Warrior dreamsign is anti-fit.
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0);
  });

  it("2 matching cards => partial coverage (2/3), below a full match", () => {
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
      makeCard("c3", 3, { subtype: "Outsider" }),
    ];
    const score = dreamsignMatchScore(profile, deck);
    expect(score).toBeCloseTo(2 / 3);
    expect(score).toBeLessThan(1.0);
  });

  it("3 matching cards => full coverage (1.0)", () => {
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
      makeCard("c3", 3, { subtype: "Warrior" }),
      makeCard("c4", 4, { subtype: "Outsider" }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.0);
  });
});

describe("dreamsignMatchScore — multiple features", () => {
  it("2 features, one fully covered and one absent => mean coverage 0.5", () => {
    // subtypes=["Warrior"] (3 matching => coverage 1.0),
    // cardTypes=["Event"] (0 matching => coverage 0) => mean 0.5
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"], cardTypes: ["Event"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior", cardType: "Character" }),
      makeCard("c2", 2, { subtype: "Warrior", cardType: "Character" }),
      makeCard("c3", 3, { subtype: "Warrior", cardType: "Character" }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.5);
  });

  it("2 features, both fully covered => score = 1.0 * qualityWeight", () => {
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"], cardTypes: ["Character"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior", cardType: "Character" }),
      makeCard("c2", 2, { subtype: "Warrior", cardType: "Character" }),
      makeCard("c3", 3, { subtype: "Warrior", cardType: "Character" }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.0);
  });
});

describe("dreamsignMatchScore — cost band features", () => {
  it("cheap feature fully covered by 3 cheap cards (energyCost <= 1)", () => {
    const profile = makeProfile({ quality: 2, costBands: ["cheap"] });
    const deck = [
      makeCard("c1", 1, { energyCost: 1 }),
      makeCard("c2", 2, { energyCost: 0 }),
      makeCard("c3", 3, { energyCost: 1 }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.0);
  });

  it("big feature partially covered by 2 big cards (2/3)", () => {
    const profile = makeProfile({ quality: 2, costBands: ["big"] });
    const deck = [
      makeCard("c1", 1, { energyCost: 4 }),
      makeCard("c2", 2, { energyCost: 5 }),
      makeCard("c3", 3, { energyCost: 2 }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(2 / 3);
  });
});

describe("dreamsignHasDeckCoverage — genuine deck fit only", () => {
  const warriorDeck = [
    makeCard("c1", 1, { subtype: "Warrior" }),
    makeCard("c2", 2, { subtype: "Warrior" }),
  ];

  it("a profiled sign whose feature the deck matches has coverage", () => {
    const profile = makeProfile({ subtypes: ["Warrior"] });
    expect(dreamsignHasDeckCoverage(profile, warriorDeck)).toBe(true);
  });

  it("a profiled off-deck sign (zero coverage) has no coverage", () => {
    const profile = makeProfile({ subtypes: ["Outsider"] });
    expect(dreamsignHasDeckCoverage(profile, warriorDeck)).toBe(false);
  });

  it("a featureless sign is generic, not deck coverage, even though it scores > 0", () => {
    const profile = makeProfile({ quality: 1 });
    // It still earns a positive match score (the generic-blessing fallback)...
    expect(dreamsignMatchScore(profile, warriorDeck)).toBeGreaterThan(0);
    // ...but it does not count as genuinely suited to the deck.
    expect(dreamsignHasDeckCoverage(profile, warriorDeck)).toBe(false);
  });

  it("an undefined profile has no coverage", () => {
    expect(dreamsignHasDeckCoverage(undefined, warriorDeck)).toBe(false);
  });

  it("a multi-feature sign with one matched feature has coverage", () => {
    const profile = makeProfile({ subtypes: ["Warrior"], cardTypes: ["Event"] });
    expect(dreamsignHasDeckCoverage(profile, warriorDeck)).toBe(true);
  });
});

describe("dreamsignMatchScore — keyword features", () => {
  it("reclaim keyword feature covered by 3 cards with reclaimCost", () => {
    const profile = makeProfile({ quality: 2, keywords: ["reclaim"] });
    const deck = [
      makeCard("c1", 1, { reclaimCost: 1 }),
      makeCard("c2", 2, { reclaimCost: 2 }),
      makeCard("c3", 3, { reclaimCost: 1 }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.0);
  });

  it("fast keyword feature covered by 3 fast cards", () => {
    const profile = makeProfile({ quality: 2, keywords: ["fast"] });
    const deck = [
      makeCard("c1", 1, { isFast: true }),
      makeCard("c2", 2, { isFast: true }),
      makeCard("c3", 3, { isFast: true }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.0);
  });
});
