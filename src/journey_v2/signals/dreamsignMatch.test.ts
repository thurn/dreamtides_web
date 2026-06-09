import { describe, expect, it } from "vitest";
import type { DreamsignProfile } from "../../data/dreamsign-profiles";
import type { CardData } from "../../types/cards";
import { dreamsignMatchScore } from "./dreamsignMatch";

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
// Quality weight constants
// ---------------------------------------------------------------------------
// quality 1 -> 1.2, quality 2 -> 1.0, quality 3 -> 0.8

describe("dreamsignMatchScore — featureless profile", () => {
  it("featureless quality-2 profile scores 0.5 * 1.0 = 0.5", () => {
    const profile = makeProfile({ quality: 2, subtypes: [], cardTypes: [], costBands: [], keywords: [] });
    const deck: CardData[] = [];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.5);
  });

  it("featureless quality-1 profile scores 0.5 * 1.2 = 0.6", () => {
    const profile = makeProfile({ quality: 1, subtypes: [], cardTypes: [], costBands: [], keywords: [] });
    const deck: CardData[] = [];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.6);
  });

  it("featureless quality-3 profile scores 0.5 * 0.8 = 0.4", () => {
    const profile = makeProfile({ quality: 3, subtypes: [], cardTypes: [], costBands: [], keywords: [] });
    const deck: CardData[] = [];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.4);
  });
});

describe("dreamsignMatchScore — undefined profile", () => {
  it("undefined profile (featureless quality-2) scores 0.5", () => {
    const deck: CardData[] = [];
    expect(dreamsignMatchScore(undefined, deck)).toBeCloseTo(0.5);
  });

  it("undefined profile with deck cards still scores 0.5", () => {
    const deck = [makeCard("c1", 1), makeCard("c2", 2)];
    expect(dreamsignMatchScore(undefined, deck)).toBeCloseTo(0.5);
  });
});

describe("dreamsignMatchScore — single satisfied feature", () => {
  it("profile with one subtype feature, 3 matching cards => 1.0 * qualityWeight", () => {
    // 1 feature, 1 satisfied => satisfiedFraction = 1.0
    // score = (0.5 + 0.5*1.0) * 1.0 = 1.0
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
      makeCard("c3", 3, { subtype: "Warrior" }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.0);
  });

  it("profile with one subtype feature, quality 1, 3 matching => 1.0 * 1.2", () => {
    const profile = makeProfile({ quality: 1, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
      makeCard("c3", 3, { subtype: "Warrior" }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.2);
  });

  it("profile with one subtype feature, quality 3, 3 matching => 1.0 * 0.8", () => {
    const profile = makeProfile({ quality: 3, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
      makeCard("c3", 3, { subtype: "Warrior" }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.8);
  });
});

describe("dreamsignMatchScore — 2 vs 3 card boundary (off-by-one bug class)", () => {
  it("2 matching cards for subtype feature => unsatisfied (score < 1.0)", () => {
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
      makeCard("c3", 3, { subtype: "Outsider" }), // not matching
    ];
    // 0 features satisfied out of 1 => satisfiedFraction = 0
    // score = (0.5 + 0.5*0) * 1.0 = 0.5
    const score = dreamsignMatchScore(profile, deck);
    expect(score).toBeCloseTo(0.5);
  });

  it("3 matching cards for subtype feature => satisfied (score = 1.0)", () => {
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
      makeCard("c3", 3, { subtype: "Warrior" }),
      makeCard("c4", 4, { subtype: "Outsider" }),
    ];
    // 1 feature satisfied out of 1 => satisfiedFraction = 1.0
    // score = (0.5 + 0.5*1.0) * 1.0 = 1.0
    const score = dreamsignMatchScore(profile, deck);
    expect(score).toBeCloseTo(1.0);
  });

  it("2 cards is NOT enough — boundary confirmed at exactly 3", () => {
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"] });
    // Only 2 warriors in deck
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior" }),
      makeCard("c2", 2, { subtype: "Warrior" }),
    ];
    const score = dreamsignMatchScore(profile, deck);
    // Not satisfied => 0.5 (featureless baseline)
    expect(score).toBeCloseTo(0.5);
    expect(score).toBeLessThan(1.0);
  });
});

describe("dreamsignMatchScore — multiple features", () => {
  it("2 features, 1 satisfied => satisfiedFraction 0.5", () => {
    // features: subtypes=["Warrior"], cardTypes=["Event"]
    // deck: 3 Warriors but 0 Events => 1/2 satisfied
    // score = (0.5 + 0.5*0.5) * 1.0 = 0.75
    const profile = makeProfile({ quality: 2, subtypes: ["Warrior"], cardTypes: ["Event"] });
    const deck = [
      makeCard("c1", 1, { subtype: "Warrior", cardType: "Character" }),
      makeCard("c2", 2, { subtype: "Warrior", cardType: "Character" }),
      makeCard("c3", 3, { subtype: "Warrior", cardType: "Character" }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.75);
  });

  it("2 features, both satisfied => score = 1.0 * qualityWeight", () => {
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
  it("cheap feature satisfied by 3 cheap cards (energyCost <= 1)", () => {
    const profile = makeProfile({ quality: 2, costBands: ["cheap"] });
    const deck = [
      makeCard("c1", 1, { energyCost: 1 }),
      makeCard("c2", 2, { energyCost: 0 }),
      makeCard("c3", 3, { energyCost: 1 }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.0);
  });

  it("big feature unsatisfied by only 2 big cards", () => {
    const profile = makeProfile({ quality: 2, costBands: ["big"] });
    const deck = [
      makeCard("c1", 1, { energyCost: 4 }),
      makeCard("c2", 2, { energyCost: 5 }),
      makeCard("c3", 3, { energyCost: 2 }),
    ];
    // only 2 big cards => unsatisfied
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(0.5);
  });
});

describe("dreamsignMatchScore — keyword features", () => {
  it("reclaim keyword feature satisfied by 3 cards with reclaimCost", () => {
    const profile = makeProfile({ quality: 2, keywords: ["reclaim"] });
    const deck = [
      makeCard("c1", 1, { reclaimCost: 1 }),
      makeCard("c2", 2, { reclaimCost: 2 }),
      makeCard("c3", 3, { reclaimCost: 1 }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.0);
  });

  it("fast keyword feature satisfied by 3 fast cards", () => {
    const profile = makeProfile({ quality: 2, keywords: ["fast"] });
    const deck = [
      makeCard("c1", 1, { isFast: true }),
      makeCard("c2", 2, { isFast: true }),
      makeCard("c3", 3, { isFast: true }),
    ];
    expect(dreamsignMatchScore(profile, deck)).toBeCloseTo(1.0);
  });
});
