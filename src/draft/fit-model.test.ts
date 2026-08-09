// Unit tests for the shared corpus fit model. Every test uses a small,
// hand-built corpus and name index — no real assets are loaded — so each
// assertion exercises a specific, understandable property of the scoring.

import { describe, expect, it } from "vitest";

import {
  buildFitModel,
  DEFAULT_FIT_TUNING,
  scoreCandidatesForDeck,
  type FitTuning,
} from "./fit-model.ts";

// Permissive tuning so tiny hand-built decks survive corpus hygiene and every
// card carries idf weight (the real defaults filter <16-card decks and rare
// cards, which would erase these miniature corpora). Term blend is left at the
// defaults so the tests describe the shipping behaviour.
const TUNING: FitTuning = {
  ...DEFAULT_FIT_TUNING,
  minDeckSize: 1,
  maxDeckSize: 100,
  minDf: 1,
  maxDfFrac: 1,
};

// Assign every name a stable card number from a deterministic index.
function nameIndexFor(names: readonly string[]): Map<string, number> {
  const index = new Map<string, number>();
  let next = 1;
  for (const name of names) if (!index.has(name)) index.set(name, next++);
  return index;
}

function nums(index: Map<string, number>, ...names: string[]): number[] {
  return names.map((n) => {
    const num = index.get(n);
    if (num === undefined) throw new Error(`unknown name ${n}`);
    return num;
  });
}


// --- scoreCandidatesForDeck tests -----------------------------------------

// Build a reusable fixture corpus for scoreCandidatesForDeck tests.
// Cards a/b/c cluster together, d/e/f cluster together.
const SC_CORPUS = [
  ["a", "b", "c"],
  ["a", "b", "c"],
  ["a", "b", "c"],
  ["d", "e", "f"],
  ["d", "e", "f"],
];
const SC_INDEX = nameIndexFor(["a", "b", "c", "d", "e", "f", "z"]);
function scNums(...names: string[]): number[] {
  return nums(SC_INDEX, ...names);
}
const SC_MODEL = buildFitModel(SC_CORPUS, SC_INDEX, TUNING);

describe("scoreCandidatesForDeck", () => {
  it("empty deck: returns prior-driven scores with zero cooccur and neighborCf", () => {
    const candidates = scNums("a", "b", "c", "d");
    const result = scoreCandidatesForDeck(candidates, [], SC_MODEL);

    expect(result.size).toBe(4);

    for (const num of candidates) {
      const score = result.get(num);
      expect(score).toBeDefined();
      // neighborCF and cooccur must be zero when the deck is empty
      expect(score!.neighborCf).toBe(0);
      expect(score!.cooccur).toBe(0);
      // prior must be non-negative (zero is allowed for unknown cards)
      expect(score!.prior).toBeGreaterThanOrEqual(0);
    }

    // "z" is not a candidate — it must not appear in the result
    const zNum = SC_INDEX.get("z") as number;
    expect(result.has(zNum)).toBe(false);
  });

  it("empty deck: all cards have fit == normalized blended prior-only score", () => {
    // With an empty deck the only varying signal is the prior.  All cards in
    // SC_CORPUS have the same prior (each appears in 3/5 of the decks that
    // contain them), so after normalization the prior is 0 for all (constant
    // range) and fit = 0 for all.  Use "z" (never in corpus) to create a
    // prior difference: z has prior 0, cluster-A cards have prior > 0.
    const candidatesWithZ = scNums("a", "z");
    const result = scoreCandidatesForDeck(candidatesWithZ, [], SC_MODEL);

    const scoreA = result.get(SC_INDEX.get("a") as number)!;
    const scoreZ = result.get(SC_INDEX.get("z") as number)!;

    // Both have zero neighborCf and cooccur
    expect(scoreA.neighborCf).toBe(0);
    expect(scoreZ.neighborCf).toBe(0);
    expect(scoreA.cooccur).toBe(0);
    expect(scoreZ.cooccur).toBe(0);

    // "a" has a higher prior than "z" (which is never in corpus)
    expect(scoreA.prior).toBeGreaterThan(scoreZ.prior);
    // "a" scores higher fit than "z" because its prior is higher
    expect(scoreA.fit).toBeGreaterThan(scoreZ.fit);
  });

  it("populated deck: cooccur is nonzero for corpus-partner candidates", () => {
    // Deck contains "a" — "b" and "c" co-occur with "a" in the corpus.
    const candidates = scNums("b", "c", "d");
    const deckCards = scNums("a");
    const result = scoreCandidatesForDeck(candidates, deckCards, SC_MODEL);

    const scoreB = result.get(SC_INDEX.get("b") as number)!;
    const scoreC = result.get(SC_INDEX.get("c") as number)!;
    const scoreD = result.get(SC_INDEX.get("d") as number)!;

    // b and c co-occur with a; d does not
    expect(scoreB.cooccur).toBeGreaterThan(0);
    expect(scoreC.cooccur).toBeGreaterThan(0);
    expect(scoreD.cooccur).toBe(0);
  });

  it("populated deck: neighborCf is nonzero for same-cluster candidates", () => {
    // Deck contains "a" — the neighbors are the 3 cluster-A decks.
    // "b" and "c" appear in those neighbors; "d","e","f" do not.
    const candidates = scNums("b", "c", "d");
    const deckCards = scNums("a");
    const result = scoreCandidatesForDeck(candidates, deckCards, SC_MODEL);

    const scoreB = result.get(SC_INDEX.get("b") as number)!;
    const scoreD = result.get(SC_INDEX.get("d") as number)!;

    expect(scoreB.neighborCf).toBeGreaterThan(0);
    expect(scoreD.neighborCf).toBe(0);
  });

  it("returns a Map keyed by candidate card number covering exactly the given candidates", () => {
    const candidates = scNums("a", "b", "d");
    const result = scoreCandidatesForDeck(candidates, scNums("c"), SC_MODEL);

    expect(result.size).toBe(3);
    for (const num of candidates) {
      expect(result.has(num)).toBe(true);
    }
    // Card "e" was not a candidate — must not appear
    expect(result.has(SC_INDEX.get("e") as number)).toBe(false);
  });

});
