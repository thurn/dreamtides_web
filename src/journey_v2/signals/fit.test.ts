import { describe, expect, it } from "vitest";
import { buildFitModel } from "../../draft/replay/fit-model";
import { fitScores, fitLooByEntry, centrality } from "./fit";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type { MerchantDeckCard } from "../types";

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/** Build a minimal CardData from a name + number + optional spark. */
function makeCard(
  id: string,
  cardNumber: number,
  name: string,
  spark: number | null = null,
): CardData {
  return {
    id: asCardId(id),
    cardNumber,
    name: asCardName(name),
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 2,
    spark,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: false,
  };
}

/** Build a minimal MerchantDeckCard. */
function makeDeckCard(card: CardData, entryId: string): MerchantDeckCard {
  return {
    objectType: "deckCard",
    entryId,
    cardUuid: card.id,
    cardNumber: card.cardNumber,
    card,
    deckEntry: {
      entryId,
      cardNumber: card.cardNumber,
      transfiguration: null,
      isBane: false,
    },
    displayName: card.name,
  };
}

// ---------------------------------------------------------------------------
// Synthetic corpus: cards A/B strongly co-occur, C is a loner.
// We also add card D which has df < minDf (appears in only 1 deck, below minDf=2).
// ---------------------------------------------------------------------------

// Card IDs and numbers
const CARD_A = makeCard("uuid-a", 1, "CardA");
const CARD_B = makeCard("uuid-b", 2, "CardB");
const CARD_C = makeCard("uuid-c", 3, "CardC");
const CARD_D = makeCard("uuid-d", 4, "CardD"); // will be below minDf

// Build a fit model where A+B always appear together; C never appears with them.
// CardD appears in only 1 deck (below minDf=2).
function buildTestFitModel() {
  // Corpus design:
  // - n=10 total decks (so maxDf = 0.6*10 = 6)
  // - A+B appear together in 6 decks (df=6, exactly at the boundary — still valid
  //   because the check is d > maxDf, i.e. strictly greater than 6)
  // - C appears alone in 2 decks (df=2 >= minDf=2, zero co-occurrence with A/B)
  // - D appears alone in 1 deck (df=1 < minDf=2 → excluded, idf=0)
  // - 1 filler-only deck to reach 10 total
  const decks: string[][] = [];

  // 6 decks: A and B together + fillers (minDeckSize=16 requires 16 distinct cards)
  for (let i = 0; i < 6; i += 1) {
    const filler = Array.from({ length: 15 }, (_, j) => `filler-${i}-${j}`);
    decks.push(["CardA", "CardB", ...filler]);
  }
  // 2 decks: C only + fillers; C never co-occurs with A or B
  for (let i = 0; i < 2; i += 1) {
    const filler = Array.from({ length: 15 }, (_, j) => `filler-c${i}-${j}`);
    decks.push(["CardC", ...filler]);
  }
  // 1 deck: D + fillers — D has df=1 < minDf=2 → idf=0, excluded from LOO
  decks.push(["CardD", ...Array.from({ length: 15 }, (_, j) => `filler-d-${j}`)]);
  // 1 filler-only deck to reach n=10
  decks.push(Array.from({ length: 16 }, (_, j) => `filler-x-${j}`));

  const nameIndex = new Map<string, number>([
    ["CardA", 1],
    ["CardB", 2],
    ["CardC", 3],
    ["CardD", 4],
  ]);

  return buildFitModel(decks, nameIndex, {
    alpha: 1.0,
    beta: 0.9,
    gamma: 0.25,
    K: 50,
    idfPower: 1,
    minDf: 2,
    maxDfFrac: 0.6,
    minDeckSize: 16,
    maxDeckSize: 34,
  });
}

// ---------------------------------------------------------------------------
// fitScores tests
// ---------------------------------------------------------------------------

describe("fitScores", () => {
  it("returns a UUID-keyed map for known candidates", () => {
    const model = buildTestFitModel();
    const deck = [CARD_A];
    const candidates = [CARD_B, CARD_C];
    const scores = fitScores(candidates, deck, model);
    expect(scores.has("uuid-b")).toBe(true);
    expect(scores.has("uuid-c")).toBe(true);
  });

  it("returns defined fit scores for candidates", () => {
    const model = buildTestFitModel();
    const deck = [CARD_A];
    const candidates = [CARD_B, CARD_C];
    const scores = fitScores(candidates, deck, model);
    const scoreB = scores.get("uuid-b");
    const scoreC = scores.get("uuid-c");
    expect(scoreB).toBeDefined();
    expect(scoreC).toBeDefined();
  });

  it("on empty deck returns prior-driven scores with zero cooccur/neighborCf", () => {
    const model = buildTestFitModel();
    const scores = fitScores([CARD_A, CARD_B, CARD_C], [], model);
    for (const [, score] of scores) {
      expect(score.cooccur).toBe(0);
      expect(score.neighborCf).toBe(0);
    }
  });
});

// ---------------------------------------------------------------------------
// fitLooByEntry tests — the main misfit/loner bug class
// ---------------------------------------------------------------------------

describe("fitLooByEntry", () => {
  it("loner card has the lowest score", () => {
    const model = buildTestFitModel();

    // Deck: A (strong pair) + B (strong pair) + C (loner)
    const deckCards = [
      makeDeckCard(CARD_A, "entry-a"),
      makeDeckCard(CARD_B, "entry-b"),
      makeDeckCard(CARD_C, "entry-c"),
    ];

    const loo = fitLooByEntry(deckCards, model);

    // All three should be present (A, B, C all have df >= minDf=2)
    expect(loo.has("entry-a")).toBe(true);
    expect(loo.has("entry-b")).toBe(true);
    expect(loo.has("entry-c")).toBe(true);

    const scoreA = loo.get("entry-a")!;
    const scoreB = loo.get("entry-b")!;
    const scoreC = loo.get("entry-c")!;

    // C is the loner: its leave-one-out fit should be the lowest
    expect(scoreC).toBeLessThan(scoreA);
    expect(scoreC).toBeLessThan(scoreB);
  });

  it("card below minDf is absent from the map", () => {
    const model = buildTestFitModel();

    // Include card D which has df=1 < minDf=2
    const deckCards = [
      makeDeckCard(CARD_A, "entry-a"),
      makeDeckCard(CARD_B, "entry-b"),
      makeDeckCard(CARD_D, "entry-d"), // below minDf
    ];

    const loo = fitLooByEntry(deckCards, model);

    // D should be absent from the map (no corpus signal)
    expect(loo.has("entry-d")).toBe(false);

    // A and B should still be present
    expect(loo.has("entry-a")).toBe(true);
    expect(loo.has("entry-b")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// centrality tests — fallback path bug class
// ---------------------------------------------------------------------------

describe("centrality", () => {
  it("fallback with no model returns 0.25 for spark < 3", () => {
    const card = makeCard("uuid-test", 99, "TestCard", 1);
    const result = centrality(card, [], undefined);
    expect(result).toBe(0.25);
  });

  it("fallback with no model returns 0.4 for spark >= 3", () => {
    const card = makeCard("uuid-test", 99, "TestCard", 3);
    const result = centrality(card, [], undefined);
    expect(result).toBeCloseTo(0.4);
  });

  it("fallback returns 0.4 for spark = 4", () => {
    const card = makeCard("uuid-test", 99, "TestCard", 4);
    const result = centrality(card, [], undefined);
    expect(result).toBeCloseTo(0.4);
  });

  it("fallback returns 0.25 for spark = 2", () => {
    const card = makeCard("uuid-test", 99, "TestCard", 2);
    const result = centrality(card, [], undefined);
    expect(result).toBe(0.25);
  });

  it("fallback for null spark (no spark) returns 0.25", () => {
    const card = makeCard("uuid-test", 99, "TestCard", null);
    const result = centrality(card, [], undefined);
    expect(result).toBe(0.25);
  });

  it("does not crash when model is undefined (returns a number in [0,1])", () => {
    const card = makeCard("uuid-test", 99, "TestCard", 3);
    const result = centrality(card, [CARD_A, CARD_B], undefined);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });

  it("returns clamped value in [0,1] when model is provided", () => {
    const model = buildTestFitModel();
    const result = centrality(CARD_A, [CARD_B], model);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});
