// @vitest-environment node
//
// Unit tests for the pure helpers of the replay deck-fit eval harness. Every
// test uses a small hand-built corpus and name->number index -- no real assets
// -- so each assertion exercises one understandable property of the JS scoring
// mirror, the way scripts/buildaround-support-experiment.test.mjs does for the
// support metric.

import { describe, expect, it } from "vitest";
import {
  buildFitModel,
  rankTop4,
  rankPopularity,
  isHit,
  randomHitProbability,
  minMaxNormalize,
  sampleRecords,
} from "./draft-replay-experiment.mjs";

// Permissive tuning so tiny hand-built decks survive corpus hygiene and every
// card carries idf weight (the shipping defaults filter <16-card decks and rare
// cards, which would erase these miniature corpora). The blend weights are left
// at the shipping values so the tests describe real ranking behaviour.
const TUNING = {
  alpha: 1.0,
  beta: 0.9,
  gamma: 0.25,
  K: 50,
  idfPower: 1,
  minDf: 1,
  maxDfFrac: 1,
  minDeckSize: 1,
  maxDeckSize: 100,
};

// Assign every distinct name a stable card number from a deterministic index.
function numberIndexFor(names) {
  const index = new Map();
  let next = 1;
  for (const name of names) if (!index.has(name)) index.set(name, next++);
  return index;
}

describe("minMaxNormalize", () => {
  it("maps to [0,1] with the min at 0 and the max at 1", () => {
    expect(minMaxNormalize([2, 4, 6])).toEqual([0, 0.5, 1]);
  });
  it("returns all zeros for a constant array (no discriminating power)", () => {
    expect(minMaxNormalize([3, 3, 3])).toEqual([0, 0, 0]);
    expect(minMaxNormalize([])).toEqual([]);
  });
});

describe("rankTop4", () => {
  it("is deterministic: identical inputs give identical output", () => {
    const corpus = [
      ["a", "b", "c", "d"],
      ["a", "b", "e"],
      ["c", "d", "f"],
      ["a", "c", "g"],
    ];
    const numberOf = numberIndexFor(["a", "b", "c", "d", "e", "f", "g"]);
    const model = buildFitModel(corpus, TUNING);
    const pack = ["b", "c", "d", "e"];
    const first = rankTop4(pack, ["a"], model, TUNING, numberOf, 2);
    for (let i = 0; i < 5; i += 1) {
      expect(rankTop4(pack, ["a"], model, TUNING, numberOf, 2)).toEqual(first);
    }
  });

  it("returns the whole deduped pack sorted by card number when it is <= offer", () => {
    const corpus = [
      ["a", "b", "c", "d"],
      ["a", "e"],
    ];
    const numberOf = numberIndexFor(["a", "b", "c", "d", "e"]);
    const model = buildFitModel(corpus, TUNING);
    // Pack of 3 with offerSize 4: every candidate returned, sorted by number,
    // regardless of the deck. Pack given out of order to prove the sort.
    const offer = rankTop4(["c", "a", "b"], ["e"], model, TUNING, numberOf, 4);
    expect(offer).toEqual(["a", "b", "c"]);
    // Deck-independence: an empty deck yields the same whole-pack result.
    expect(rankTop4(["c", "a", "b"], [], model, TUNING, numberOf, 4)).toEqual(
      offer,
    );
  });

  it("dedupes a duplicated pack name into a single candidate", () => {
    const corpus = [
      ["a", "b", "c"],
      ["a", "d"],
    ];
    const numberOf = numberIndexFor(["a", "b", "c", "d"]);
    const model = buildFitModel(corpus, TUNING);
    // Pack lists "a" twice (3 entries, 2 distinct). Distinct candidates = 2 <=
    // offerSize 2, so the deduped pack is returned whole, sorted by number.
    const offer = rankTop4(["a", "a", "b"], ["c"], model, TUNING, numberOf, 2);
    expect(offer).toEqual(["a", "b"]);
    expect(offer).toHaveLength(2);
  });

  it("breaks fit ties by the lower card number", () => {
    // x and y never appear in the corpus, so every term is 0 for both: they tie
    // on fit and the tie-break (card number asc) orders them. "a" co-occurs with
    // deck card "b", so it takes the top slot, leaving x (5) over y (6).
    const corpus = [
      ["a", "b", "c"],
      ["a", "b", "d"],
    ];
    const numberOf = numberIndexFor(["a", "b", "c", "d", "x", "y"]);
    const model = buildFitModel(corpus, TUNING);
    const offer = rankTop4(["y", "x", "a"], ["b"], model, TUNING, numberOf, 2);
    expect(offer).toEqual(["a", "x"]);
  });

  it("ranks by prior when the deck is empty (pick 1)", () => {
    // "pop" appears in every deck; "rare" in one. With no deck the neighbour and
    // co-occurrence terms are 0, so the normalized prior decides: the most-played
    // pack card is offered first.
    const corpus = [
      ["pop", "x1"],
      ["pop", "x2"],
      ["pop", "x3"],
      ["rare", "x4"],
    ];
    const numberOf = numberIndexFor(["pop", "rare", "x1", "x2", "x3", "x4"]);
    const model = buildFitModel(corpus, TUNING);
    const offer = rankTop4(["rare", "pop"], [], model, TUNING, numberOf, 1);
    expect(offer).toEqual(["pop"]);
  });

  it("is sensitive to leave-one-out: dropping decks flips a candidate's rank", () => {
    // Deck holds "anchor". The base corpus pairs anchor with q (twice) and with
    // p (once), so q wins. Removing the two anchor+q decks erases q's
    // partnership while anchor+p remains -- flipping the winner to p.
    const withQ = [
      ["anchor", "q", "m1"],
      ["anchor", "q", "m2"],
      ["anchor", "p", "m3"],
      ["filler1", "filler2", "filler3"],
    ];
    const withoutQ = [
      ["anchor", "p", "m3"],
      ["filler1", "filler2", "filler3"],
      // Keep p and q present elsewhere so the change is purely about anchor's
      // partnerships, not card existence.
      ["p", "q", "m4"],
    ];
    const numberOf = numberIndexFor([
      "anchor",
      "p",
      "q",
      "m1",
      "m2",
      "m3",
      "m4",
      "filler1",
      "filler2",
      "filler3",
    ]);
    const modelWith = buildFitModel(withQ, TUNING);
    const modelWithout = buildFitModel(withoutQ, TUNING);
    const offerWith = rankTop4(["p", "q"], ["anchor"], modelWith, TUNING, numberOf, 1);
    const offerWithout = rankTop4(
      ["p", "q"],
      ["anchor"],
      modelWithout,
      TUNING,
      numberOf,
      1,
    );
    expect(offerWith).toEqual(["q"]);
    expect(offerWithout).toEqual(["p"]);
  });
});

describe("rankPopularity", () => {
  it("ranks by global play-rate, ignoring the deck", () => {
    const corpus = [
      ["pop", "x1"],
      ["pop", "x2"],
      ["mid", "x3"],
      ["mid", "rare"],
    ];
    const numberOf = numberIndexFor(["pop", "mid", "rare", "x1", "x2", "x3"]);
    const model = buildFitModel(corpus, TUNING);
    // pop df 2, mid df 2, rare df 1. pop and mid tie -> card-number tie-break
    // puts pop (1) before mid (2); rare (df 1) ranks last.
    const offer = rankPopularity(["rare", "mid", "pop"], model.prior, numberOf, 2);
    expect(offer).toEqual(["pop", "mid"]);
    // A different deck makes no difference -- popularity is deck-independent.
    expect(rankPopularity(["rare", "mid", "pop"], model.prior, numberOf, 2)).toEqual(
      offer,
    );
  });
});

describe("isHit", () => {
  it("hits when ANY picked card is in the offer (multi-card pick)", () => {
    expect(isHit(["a", "b", "c", "d"], ["z", "c"])).toBe(true);
    expect(isHit(["a", "b", "c", "d"], ["x", "y"])).toBe(false);
    // Single-card pick: the ordinary case.
    expect(isHit(["a", "b", "c", "d"], ["a"])).toBe(true);
    expect(isHit(["a", "b", "c", "d"], ["e"])).toBe(false);
    // An empty pick can never hit.
    expect(isHit(["a", "b"], [])).toBe(false);
  });
  it("accepts a Set offer as well as an array", () => {
    expect(isHit(new Set(["a", "b"]), ["b"])).toBe(true);
    expect(isHit(new Set(["a", "b"]), ["c"])).toBe(false);
  });
});

describe("randomHitProbability", () => {
  it("reduces to offerSize/packSize for a single-card pick", () => {
    // 1 picked card, pack 8, offer 4: 1 - C(7,4)/C(8,4) = 1 - 35/70 = 0.5 = 4/8.
    expect(randomHitProbability(8, 1, 4)).toBeCloseTo(0.5, 12);
    expect(randomHitProbability(12, 1, 4)).toBeCloseTo(4 / 12, 12);
  });
  it("is higher when the human took several cards from the pack", () => {
    // 2 picked cards in a pack of 8, offer 4: 1 - C(6,4)/C(8,4) = 1 - 15/70.
    expect(randomHitProbability(8, 2, 4)).toBeCloseTo(1 - 15 / 70, 12);
    expect(randomHitProbability(8, 2, 4)).toBeGreaterThan(
      randomHitProbability(8, 1, 4),
    );
  });
  it("is 1 when the whole pack fits in the offer or all-miss is impossible", () => {
    expect(randomHitProbability(4, 1, 4)).toBe(1); // pack <= offer
    expect(randomHitProbability(3, 1, 4)).toBe(1);
    // 6 picked cards in a pack of 8, offer 4: only 2 non-picked -> any size-4
    // subset must include a picked card.
    expect(randomHitProbability(8, 6, 4)).toBe(1);
  });
  it("is 0 when no picked card is actually in the pack", () => {
    expect(randomHitProbability(8, 0, 4)).toBe(0);
  });
});

describe("leave-one-out behaviour (synthetic recall)", () => {
  // A tiny corpus of "decks" plus one simulated player deck. When the simulated
  // deck is LEFT IN the model, the heuristic recalls the held-out card from the
  // pack with certainty; when it is REMOVED, recall drops. This is the property
  // the full LOO eval relies on -- a record must not score against its own deck.
  const SIM_DECK = ["anchor", "partner", "s1", "s2", "s3"];
  // Many copies of the simulated deck so it dominates the neighbour vote and the
  // co-occurrence between anchor and partner is unambiguous.
  function corpusWithSim(includeSim) {
    const base = [
      // Decks that contain "anchor" but pair it with "decoy", never "partner".
      ["anchor", "decoy", "b1", "b2"],
      ["anchor", "decoy", "b3", "b4"],
      ["anchor", "decoy", "b5", "b6"],
      // Unrelated filler so the model is non-trivial.
      ["f1", "f2", "f3", "f4"],
      ["f5", "f6", "f7", "f8"],
    ];
    if (includeSim) {
      for (let i = 0; i < 4; i += 1) base.push([...SIM_DECK]);
    }
    return base;
  }
  const numberOf = numberIndexFor([
    "anchor",
    "partner",
    "decoy",
    "s1",
    "s2",
    "s3",
    "b1",
    "b2",
    "b3",
    "b4",
    "b5",
    "b6",
    "f1",
    "f2",
    "f3",
    "f4",
    "f5",
    "f6",
    "f7",
    "f8",
  ]);
  // The player holds "anchor"; the pack offers partner vs decoy plus distractors.
  const deck = ["anchor"];
  const pack = ["partner", "decoy", "f1", "f5", "b1"];

  it("recalls the held-out partner when the matching deck is IN the corpus", () => {
    const model = buildFitModel(corpusWithSim(true), TUNING);
    const offer = rankTop4(pack, deck, model, TUNING, numberOf, 1);
    expect(offer).toEqual(["partner"]);
  });

  it("fails to recall the partner once the matching deck is REMOVED", () => {
    const model = buildFitModel(corpusWithSim(false), TUNING);
    const offer = rankTop4(pack, deck, model, TUNING, numberOf, 1);
    // Without the simulated deck, anchor only ever paired with decoy, so the
    // heuristic now prefers decoy -- it no longer surfaces partner.
    expect(offer).not.toEqual(["partner"]);
    expect(offer).toEqual(["decoy"]);
  });
});

describe("sampleRecords", () => {
  const records = Array.from({ length: 20 }, (_, i) => ({ id: i }));
  it("returns all records when n is 0 or >= length", () => {
    expect(sampleRecords(records, 0, 1)).toBe(records);
    expect(sampleRecords(records, 20, 1)).toBe(records);
    expect(sampleRecords(records, 50, 1)).toBe(records);
  });
  it("is deterministic for a fixed seed and respects the sample size", () => {
    const a = sampleRecords(records, 5, 42);
    const b = sampleRecords(records, 5, 42);
    expect(a).toHaveLength(5);
    expect(a.map((r) => r.id)).toEqual(b.map((r) => r.id));
  });
  it("returns a corpus-order (ascending id) subset", () => {
    const s = sampleRecords(records, 6, 7).map((r) => r.id);
    expect([...s].sort((x, y) => x - y)).toEqual(s);
  });
  it("draws different subsets for different seeds", () => {
    const a = sampleRecords(records, 5, 1).map((r) => r.id);
    const b = sampleRecords(records, 5, 999).map((r) => r.id);
    expect(a).not.toEqual(b);
  });
});
