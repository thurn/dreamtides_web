// Unit tests for the record-replay fit model. Every test uses a small,
// hand-built corpus and name index — no real assets are loaded — so each
// assertion exercises a specific, understandable property of the scoring.

import { describe, expect, it } from "vitest";

import {
  buildFitModel,
  computeReplayOffer,
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

describe("computeReplayOffer", () => {
  it("is deterministic: identical inputs give identical output", () => {
    const corpus = [
      ["a", "b", "c", "d"],
      ["a", "b", "e"],
      ["c", "d", "f"],
      ["a", "c", "g"],
    ];
    const index = nameIndexFor(["a", "b", "c", "d", "e", "f", "g"]);
    const model = buildFitModel(corpus, index, TUNING);

    const pack = nums(index, "b", "c", "d", "e");
    const deck = nums(index, "a");
    const first = computeReplayOffer(pack, deck, [], model, 2);
    for (let i = 0; i < 5; i += 1) {
      expect(computeReplayOffer(pack, deck, [], model, 2)).toEqual(first);
    }
  });

  it("breaks fit ties by the lower card number", () => {
    // Two candidates with no corpus presence at all: every term is 0 for both,
    // so they tie on fit and the tie-break (card number asc) decides the order.
    const corpus = [
      ["a", "b", "c"],
      ["a", "b", "d"],
    ];
    const index = nameIndexFor(["a", "b", "c", "d", "x", "y"]);
    const model = buildFitModel(corpus, index, TUNING);
    // x -> 5, y -> 6. Present in pack but never in the corpus, so both score 0.
    const pack = nums(index, "y", "x", "a");
    // Use offerSize 2 so scoring runs (3 candidates > 2) and "a" (the only
    // corpus card) takes the top slot, leaving x/y to contend the second.
    const offer = computeReplayOffer(pack, nums(index, "b"), [], model, 2);
    expect(offer).toHaveLength(2);
    // a scores highest (co-occurs with deck card b); x (5) beats y (6) on the
    // tie-break for the remaining slot.
    expect(offer).toEqual(nums(index, "a", "x"));
  });

  it("returns the whole pack sorted by card number when it fits in the offer", () => {
    const corpus = [
      ["a", "b", "c", "d"],
      ["a", "e"],
    ];
    const index = nameIndexFor(["a", "b", "c", "d", "e"]);
    const model = buildFitModel(corpus, index, TUNING);
    // Pack of 3 with offerSize 4: every candidate returned, sorted by number,
    // regardless of the deck. Pack given out of order to prove the sort.
    const pack = nums(index, "c", "a", "b");
    const offer = computeReplayOffer(pack, nums(index, "e"), [], model, 4);
    expect(offer).toEqual(nums(index, "a", "b", "c"));
    // Deck-independence: a different (even empty) deck yields the same result.
    expect(computeReplayOffer(pack, [], [], model, 4)).toEqual(offer);
  });

  it("ranks by prior when the deck and signatures are empty (pick 1)", () => {
    // "pop" appears in every deck; "rare" in one. With no deck context the
    // neighbour and co-occurrence terms are 0, so the normalized prior decides:
    // the most-played pack card is offered first.
    const corpus = [
      ["pop", "x1"],
      ["pop", "x2"],
      ["pop", "x3"],
      ["rare", "x4"],
    ];
    const index = nameIndexFor(["pop", "rare", "x1", "x2", "x3", "x4"]);
    const model = buildFitModel(corpus, index, TUNING);
    const pack = nums(index, "rare", "pop");
    const offer = computeReplayOffer(pack, [], [], model, 1);
    expect(offer).toEqual(nums(index, "pop"));
  });

  it("lets signatures steer the offer (signature co-occurs with a candidate)", () => {
    // "sigA" co-occurs only with "p", "sigB" only with "q". With an empty
    // picked deck, folding a signature in should surface the candidate that
    // historically partners that signature.
    const corpus = [
      ["sigA", "p", "z1"],
      ["sigA", "p", "z2"],
      ["sigB", "q", "z3"],
      ["sigB", "q", "z4"],
    ];
    const index = nameIndexFor([
      "sigA",
      "sigB",
      "p",
      "q",
      "z1",
      "z2",
      "z3",
      "z4",
    ]);
    const model = buildFitModel(corpus, index, TUNING);
    const pack = nums(index, "p", "q");

    const withA = computeReplayOffer(pack, [], nums(index, "sigA"), model, 1);
    const withB = computeReplayOffer(pack, [], nums(index, "sigB"), model, 1);
    expect(withA).toEqual(nums(index, "p"));
    expect(withB).toEqual(nums(index, "q"));
    expect(withA).not.toEqual(withB);
  });

  it("is sensitive to leave-one-out: dropping a deck flips a candidate's rank", () => {
    // Deck holds "anchor". Candidates "p" and "q". The base corpus pairs anchor
    // with q (twice) and with p (once), so q wins. Removing the two anchor+q
    // decks erases q's partnership and adds nothing for it, while anchor+p
    // remains — flipping the winner to p.
    const withQ = [
      ["anchor", "q", "m1"],
      ["anchor", "q", "m2"],
      ["anchor", "p", "m3"],
      ["filler1", "filler2", "filler3"],
    ];
    const withoutQ = [
      ["anchor", "p", "m3"],
      ["filler1", "filler2", "filler3"],
      // Keep p and q each present elsewhere so both stay in the model and the
      // change is purely about anchor's partnerships, not card existence.
      ["p", "q", "m4"],
    ];
    const allNames = [
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
    ];
    const index = nameIndexFor(allNames);
    const pack = nums(index, "p", "q");
    const deck = nums(index, "anchor");

    const modelWith = buildFitModel(withQ, index, TUNING);
    const modelWithout = buildFitModel(withoutQ, index, TUNING);
    const offerWith = computeReplayOffer(pack, deck, [], modelWith, 1);
    const offerWithout = computeReplayOffer(pack, deck, [], modelWithout, 1);

    expect(offerWith).toEqual(nums(index, "q"));
    expect(offerWithout).toEqual(nums(index, "p"));
    expect(offerWith).not.toEqual(offerWithout);
  });

  it("treats a duplicate name in the pack as a single candidate", () => {
    const corpus = [
      ["a", "b", "c"],
      ["a", "d"],
    ];
    const index = nameIndexFor(["a", "b", "c", "d"]);
    const model = buildFitModel(corpus, index, TUNING);
    const aNum = index.get("a") as number;
    const bNum = index.get("b") as number;
    const cNum = index.get("c") as number;
    // Pack lists "a" twice (3 entries, 2 distinct). Distinct candidates = 2,
    // which is <= offerSize 2, so it returns the whole deduped pack sorted.
    const pack = [aNum, aNum, bNum];
    const offer = computeReplayOffer(pack, [cNum], [], model, 2);
    expect(offer).toEqual([aNum, bNum].sort((x, y) => x - y));
    expect(offer).toHaveLength(2);
  });

  it("ignores pack numbers with no name and never crashes on unknown cards", () => {
    const corpus = [
      ["a", "b", "c"],
      ["a", "b", "d"],
    ];
    const index = nameIndexFor(["a", "b", "c", "d"]);
    const model = buildFitModel(corpus, index, TUNING);
    // 999 has no name and is dropped; the remaining 3 distinct names with
    // offerSize 2 force scoring without throwing.
    const pack = [...nums(index, "a", "b", "c"), 999];
    const offer = computeReplayOffer(pack, nums(index, "d"), [], model, 2);
    expect(offer).toHaveLength(2);
    expect(offer).not.toContain(999);
  });

  // PIN TEST — captures the exact output of computeReplayOffer on a fixed
  // fixture so a refactor cannot silently change replay-draft behaviour.
  // This corpus/pack/deck triple is fully synthetic and exercises all three
  // scoring terms (neighborCF, cooccur, prior) because the deck is non-empty
  // and the pack is larger than offerSize.
  it("pin: computeReplayOffer output is byte-identical before and after refactor", () => {
    // Corpus: 6 decks, each 3 distinct cards.  The layout is deliberate:
    //   - "deckA" cards (a,b,c) cluster together in the first 3 decks.
    //   - "deckB" cards (d,e,f) cluster together in the last 3.
    //   - "g" appears across clusters as a staple (high prior).
    const pinCorpus = [
      ["a", "b", "c", "g"],
      ["a", "b", "c", "g"],
      ["a", "b", "c", "g"],
      ["d", "e", "f", "g"],
      ["d", "e", "f", "g"],
      ["d", "e", "f", "g"],
    ];
    const pinIndex = nameIndexFor(["a", "b", "c", "d", "e", "f", "g"]);
    const pinModel = buildFitModel(pinCorpus, pinIndex, TUNING);

    // Pack: all 7 cards; deck is "a" + "b" — should score cluster-A cards high.
    const pinPack = nums(pinIndex, "a", "b", "c", "d", "e", "f", "g");
    const pinDeck = nums(pinIndex, "a", "b");
    const pinOffer = computeReplayOffer(pinPack, pinDeck, [], pinModel, 3);

    // Capture the concrete expected output. "c" (cluster-A partner) should rank
    // above "d","e","f" (cluster-B); "g" (staple, idf-zeroed) ranks last among
    // the competing cards — but because we only ask for 3 slots the staple is
    // excluded. The order is deterministic and driven purely by the scoring.
    //
    // This is the PINNED value — do not change it without intentionally
    // re-deriving it.
    expect(pinOffer).toEqual([
      pinIndex.get("c") as number, // best fit: strong cluster-A cooccur
      pinIndex.get("a") as number, // already-in-deck card (treated as candidate)
      pinIndex.get("b") as number, // already-in-deck card (treated as candidate)
    ]);
  });
});

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

  it("is consistent with computeReplayOffer ranking (refactor safety)", () => {
    // The same corpus and inputs used to compute scoreCandidatesForDeck should
    // yield the same relative ordering as computeReplayOffer, because
    // computeReplayOffer is re-expressed on top of scoreCandidatesForDeck.
    const pack = scNums("a", "b", "c", "d", "e");
    const deck = scNums("a");
    const offer = computeReplayOffer(pack, deck, [], SC_MODEL, 3);

    const result = scoreCandidatesForDeck(pack, deck, SC_MODEL);
    // The top-3 card numbers from scoreCandidatesForDeck (ranked by .fit desc,
    // tie-break card number asc) must match the computeReplayOffer output.
    const ranked = [...result.entries()]
      .sort(([numA, sA], [numB, sB]) => (sB.fit - sA.fit) || (numA - numB))
      .slice(0, 3)
      .map(([num]) => num);

    expect(ranked).toEqual(offer);
  });
});
