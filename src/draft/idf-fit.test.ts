import { describe, expect, it } from "vitest";
import {
  buildIdfStats,
  computeAffinity,
  meanAffinity,
  signatureFit,
} from "./idf-fit.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

// 3-deck fixture used by buildIdfStats / signatureFit tests.
// Cards:
//   "a" appears in all 3 decks   → df=3, idf = ln(3/3) = 0
//   "b" appears in 2 decks       → df=2, idf = ln(3/2) ≈ 0.405
//   "c" appears in 1 deck only   → df=1, idf = ln(3/1) ≈ 1.099  (largest)
//   "d" appears in 1 deck only   → df=1, idf = ln(3/1) ≈ 1.099
//   "e" appears in 1 deck only   → df=1, idf = ln(3/1) ≈ 1.099
const deck1 = new Set(["a", "b", "c"]);
const deck2 = new Set(["a", "b", "d"]);
const deck3 = new Set(["a", "e"]);
const THREE_DECKS = [deck1, deck2, deck3] as const;

const N = 3;
const LN_3_OVER_1 = Math.log(N / 1); // ln(3) ≈ 1.099
const LN_3_OVER_2 = Math.log(N / 2); // ln(1.5) ≈ 0.405
// Math.log(N / 3) === 0 (used conceptually but not as a named constant)

// ---------------------------------------------------------------------------
// buildIdfStats
// ---------------------------------------------------------------------------

describe("buildIdfStats", () => {
  it("a card in every deck has idf 0 (df=N → ln(N/N)=0)", () => {
    const corpus = buildIdfStats(THREE_DECKS);
    // "a" is in all 3 decks: ln(3/3) = 0
    expect(corpus.idf.get("a")).toBeCloseTo(0, 10);
  });

  it("a card in exactly one deck has the largest idf", () => {
    const corpus = buildIdfStats(THREE_DECKS);
    // "c", "d", "e" each appear once → idf = ln(3/1) = ln(3)
    // "b" appears twice → idf = ln(3/2)
    // "a" appears thrice → idf = 0
    const idfA = corpus.idf.get("a") ?? -1;
    const idfB = corpus.idf.get("b") ?? -1;
    const idfC = corpus.idf.get("c") ?? -1;
    expect(idfC).toBeCloseTo(LN_3_OVER_1, 10);
    expect(idfC).toBeGreaterThan(idfB);
    expect(idfB).toBeGreaterThan(idfA);
  });

  it("contains the expected number of decks", () => {
    const corpus = buildIdfStats(THREE_DECKS);
    expect(corpus.decks).toHaveLength(3);
  });

  it("deck norms are positive", () => {
    const corpus = buildIdfStats(THREE_DECKS);
    for (const deck of corpus.decks) {
      expect(deck.norm).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// signatureFit
// ---------------------------------------------------------------------------

describe("signatureFit", () => {
  it("returns 0 when probe shares no card with the deck", () => {
    const corpus = buildIdfStats(THREE_DECKS);
    // probe = {"x"} which appears in no corpus deck
    const probe = new Set(["x"]);
    const corpusDeck = corpus.decks[0]; // deck1 = {a, b, c}
    const fit = signatureFit(probe, corpusDeck, corpus);
    expect(fit).toBe(0);
  });

  it("fit strictly increases when a rarer shared card is added vs a more common one", () => {
    const corpus = buildIdfStats(THREE_DECKS);
    // deck1 = {a, b, c}
    // probe with just "b" (df=2) vs probe with just "c" (df=1, rarer)
    const probeCommon = new Set(["b"]);
    const probeRare = new Set(["c"]);
    const corpusDeck = corpus.decks[0]; // deck1 contains both b and c
    const fitCommon = signatureFit(probeCommon, corpusDeck, corpus);
    const fitRare = signatureFit(probeRare, corpusDeck, corpus);
    expect(fitRare).toBeGreaterThan(fitCommon);
  });

  it("adding unique filler cards to a deck weakly lowers its signatureFit", () => {
    // Build a corpus where:
    //   deckA = {p1, p2, f1}             (fewer unique fillers)
    //   deckB = {p1, p2, f2, f3, f4}     (more unique fillers)
    //   deckC = {p1, f5}
    //   deckD = {p2, f6}
    // All filler cards appear in exactly one deck → high idf → each adds to deck.norm.
    // Probe = {p1, p2}.  The shared-idf numerator is identical for deckA and deckB
    // (both contain p1 and p2), but deckB's norm is larger.  Therefore fitB ≤ fitA.
    const dA = new Set(["p1", "p2", "f1"]);
    const dB = new Set(["p1", "p2", "f2", "f3", "f4"]);
    const dC = new Set(["p1", "f5"]);
    const dD = new Set(["p2", "f6"]);
    const corpus = buildIdfStats([dA, dB, dC, dD]);

    const probe = new Set(["p1", "p2"]);
    const fitA = signatureFit(probe, corpus.decks[0], corpus); // dA
    const fitB = signatureFit(probe, corpus.decks[1], corpus); // dB

    // Both fits are positive (the numerator is non-zero).
    expect(fitA).toBeGreaterThan(0);
    expect(fitB).toBeGreaterThan(0);
    // More unique filler → larger norm denominator → lower (or equal) fit.
    expect(fitB).toBeLessThanOrEqual(fitA);
  });

  it("is scale-invariant: two decks with exactly the same cards score equal fit", () => {
    // Build a corpus where two target decks contain EXACTLY the same set of cards
    // so their norms are identical and the numerator over any probe is identical.
    // Corpus:
    //   deckA = {p1, p2, f1}
    //   deckB = {p1, p2, f1}   ← identical to deckA
    //   deckC = {p1, f2}
    //   deckD = {p2, f3}
    // Because deckA and deckB are card-for-card identical, idf weights are the
    // same for both, norms are equal, and signatureFit must return the same value.
    const dA = new Set(["p1", "p2", "f1"]);
    const dB = new Set(["p1", "p2", "f1"]); // same cards as dA
    const dC = new Set(["p1", "f2"]);
    const dD = new Set(["p2", "f3"]);
    const corpus = buildIdfStats([dA, dB, dC, dD]);

    const probe = new Set(["p1", "p2"]);
    const fitA = signatureFit(probe, corpus.decks[0], corpus);
    const fitB = signatureFit(probe, corpus.decks[1], corpus);

    expect(fitA).toBeCloseTo(fitB, 10);
  });

  it("numerator uses idf not idf² (manually verified)", () => {
    // With a probe of one card p1, deck of {p1}, corpus of [{p1}]:
    //   N=1, df(p1)=1, idf(p1)=ln(1/1)=0
    // That gives 0 for any probe that's the only card. Use a 2-deck corpus instead.
    // Corpus: deck1={p1, x}, deck2={x}  → df(p1)=1, df(x)=2, N=2
    //   idf(p1) = ln(2/1) = ln2 ≈ 0.693
    //   idf(x)  = ln(2/2) = 0
    //   deck1.norm = sqrt(idf(p1)² + idf(x)²) = sqrt(ln2²) = ln2
    //   deck2.norm = sqrt(0) → falls back to 1
    //   probe = {p1}, probeNorm = sqrt(idf(p1)²) = ln2
    //   signatureFit(probe, deck1, corpus):
    //     numerator = idf(p1) = ln2  (NOT idf(p1)² = ln2²)
    //     denominator = deck1.norm * probeNorm = ln2 * ln2 = ln2²
    //     result = ln2 / ln2² = 1 / ln2 ≈ 1.4427
    //   If numerator were idf²: result = ln2² / ln2² = 1
    // So result > 1 distinguishes idf from idf² in numerator.
    const d1 = new Set(["p1", "x"]);
    const d2 = new Set(["x"]);
    const corpus = buildIdfStats([d1, d2]);
    const probe = new Set(["p1"]);
    const fit = signatureFit(probe, corpus.decks[0], corpus);
    // idf(p1) = ln(2/1) = ln2, probeNorm = ln2, deck1.norm = ln2
    // numerator = ln2, denominator = ln2 * ln2 → result = 1/ln2 > 1
    expect(fit).toBeGreaterThan(1);
  });
});

// ---------------------------------------------------------------------------
// computeAffinity
// ---------------------------------------------------------------------------

describe("computeAffinity", () => {
  it("every returned value is in [0, 1]", () => {
    const corpus = buildIdfStats(THREE_DECKS);
    const probe = new Set(["c"]); // unique to deck1
    const affinity = computeAffinity(corpus, probe);
    for (const [, v] of affinity) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it("the strongest card is exactly 1", () => {
    const corpus = buildIdfStats(THREE_DECKS);
    const probe = new Set(["c"]); // unique to deck1
    const affinity = computeAffinity(corpus, probe);
    const max = Math.max(...affinity.values());
    expect(max).toBeCloseTo(1, 10);
  });

  it("a card that appears only in decks with zero probe-cosine is absent from the map", () => {
    // probe = {"c"} (only in deck1 = {a,b,c})
    // "e" only appears in deck3 = {a,e}
    // deck3 shares no card with the probe (probe={c}, deck3={a,e}), so idfCosine=0
    // Actually deck3 shares "a" but idf(a)=0, so dot=0 → cosine=0
    // So "e" should be absent from the affinity map (never gets a positive raw score)
    const corpus = buildIdfStats(THREE_DECKS);
    const probe = new Set(["c"]);
    const affinity = computeAffinity(corpus, probe);
    expect(affinity.has("e")).toBe(false);
  });

  it("a non-probe card that co-occurs heavily with probe cards scores higher than one that never co-occurs", () => {
    // probe = {"c"} (only in deck1 = {a,b,c})
    // "b" appears in deck1 and deck2; deck1 has cosine > 0 (shares "c")
    //   → "b" gets raw = cosine(probe, deck1)
    // "e" only appears in deck3; deck3 has cosine ≈ 0 (no shared card with >0 idf)
    //   → "e" is absent from the map (treated as 0)
    // So "b" should score above "e" (which is 0 / absent)
    const corpus = buildIdfStats(THREE_DECKS);
    const probe = new Set(["c"]);
    const affinity = computeAffinity(corpus, probe);
    const bScore = affinity.get("b") ?? 0;
    const eScore = affinity.get("e") ?? 0;
    expect(bScore).toBeGreaterThan(eScore);
  });

  it("returns empty map when probe has no idf>0 cards", () => {
    const corpus = buildIdfStats(THREE_DECKS);
    // "a" has idf=0 (appears in all decks)
    const probe = new Set(["a"]);
    const affinity = computeAffinity(corpus, probe);
    expect(affinity.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// meanAffinity
// ---------------------------------------------------------------------------

describe("meanAffinity", () => {
  it("equals the mean of the deck cards' affinities, treating missing cards as 0", () => {
    const affinityMap = new Map([
      ["c1", 0.8],
      ["c2", 0.4],
      // "c3" is missing → treated as 0
    ]);
    const deck = new Set(["c1", "c2", "c3"]);
    const result = meanAffinity(deck, affinityMap);
    // mean = (0.8 + 0.4 + 0) / 3
    expect(result).toBeCloseTo((0.8 + 0.4 + 0) / 3, 10);
  });

  it("missing cards count toward the denominator (not dropped)", () => {
    const affinityMap = new Map([["c1", 0.9]]);
    const deck = new Set(["c1", "missing1", "missing2"]);
    const result = meanAffinity(deck, affinityMap);
    // Should be 0.9/3 ≈ 0.3, not 0.9/1 = 0.9
    expect(result).toBeCloseTo(0.9 / 3, 10);
    expect(result).toBeLessThan(0.9);
  });

  it("returns 0 for an empty deck", () => {
    const affinityMap = new Map([["c1", 0.5]]);
    const deck = new Set<string>();
    expect(meanAffinity(deck, affinityMap)).toBe(0);
  });

  it("handles a deck where all cards have affinity", () => {
    const affinityMap = new Map([
      ["c1", 1.0],
      ["c2", 0.5],
    ]);
    const deck = new Set(["c1", "c2"]);
    const result = meanAffinity(deck, affinityMap);
    expect(result).toBeCloseTo(0.75, 10);
  });
});

// ---------------------------------------------------------------------------
// Name-collision / UUID identity guardrail
// ---------------------------------------------------------------------------

describe("UUID identity guardrail (distinct keys never conflated)", () => {
  // Two distinct UUIDs "uuid-alpha" and "uuid-beta" — conceptually they share
  // the same display name (e.g. both named "Shadow Blade"), but since this
  // module is generic over opaque strings, we model them purely as two distinct
  // UUID strings. Any implementation that accidentally conflates them (e.g. by
  // lowercasing or name-resolving) would merge the two keys.
  //
  // corpus layout:
  //   deck1 = {uuid-alpha, common}
  //   deck2 = {uuid-beta,  common}
  //   deck3 = {common}
  //   N = 3
  //   df(uuid-alpha) = 1 → idf = ln(3)
  //   df(uuid-beta)  = 1 → idf = ln(3)  (SAME idf but distinct key)
  //   df(common)     = 3 → idf = 0

  const uuidAlpha = "uuid-alpha";
  const uuidBeta = "uuid-beta";
  const common = "common";

  const d1 = new Set([uuidAlpha, common]);
  const d2 = new Set([uuidBeta, common]);
  const d3 = new Set([common]);
  const collisionCorpus = [d1, d2, d3] as const;

  it("buildIdfStats counts two distinct UUIDs as separate cards (each gets own df)", () => {
    const corpus = buildIdfStats(collisionCorpus);
    // Each UUID appears in exactly 1 deck → df=1, idf = ln(3/1) = ln3
    const idfAlpha = corpus.idf.get(uuidAlpha);
    const idfBeta = corpus.idf.get(uuidBeta);
    expect(idfAlpha).toBeDefined();
    expect(idfBeta).toBeDefined();
    // Both should have idf = ln(3/1)
    expect(idfAlpha).toBeCloseTo(LN_3_OVER_1, 10);
    expect(idfBeta).toBeCloseTo(LN_3_OVER_1, 10);
    // They must be tracked as separate keys (both present in the idf map)
    expect(corpus.idf.size).toBeGreaterThanOrEqual(3); // uuid-alpha, uuid-beta, common
  });

  it("signatureFit matches only the UUID actually in the probe, not the other UUID", () => {
    const corpus = buildIdfStats(collisionCorpus);
    // probe contains uuid-alpha only
    const probe = new Set([uuidAlpha]);

    // deck1 contains uuid-alpha → should have positive fit
    const fitDeck1 = signatureFit(probe, corpus.decks[0], corpus);
    // deck2 contains uuid-beta (NOT uuid-alpha) → should have 0 fit
    const fitDeck2 = signatureFit(probe, corpus.decks[1], corpus);

    expect(fitDeck1).toBeGreaterThan(0);
    expect(fitDeck2).toBe(0);
  });

  it("computeAffinity scores uuid-alpha and uuid-beta independently", () => {
    const corpus = buildIdfStats(collisionCorpus);
    // probe = {uuid-alpha}
    const probe = new Set([uuidAlpha]);
    const affinity = computeAffinity(corpus, probe);

    // uuid-alpha is in deck1; probe={uuid-alpha} → deck1 has cosine > 0
    //   → uuid-alpha should appear in affinity map
    // uuid-beta is in deck2; deck2 shares no positive-idf card with the probe
    //   → deck2's cosine to probe should be 0 (common has idf=0)
    //   → uuid-beta should NOT appear in the affinity map (or score 0)
    const alphaAffinity = affinity.get(uuidAlpha) ?? 0;
    const betaAffinity = affinity.get(uuidBeta) ?? 0;

    // uuid-alpha should score strictly higher than uuid-beta
    expect(alphaAffinity).toBeGreaterThan(betaAffinity);
    // uuid-beta should be absent (deck2 has zero cosine to probe since
    // the only shared card "common" has idf=0)
    expect(affinity.has(uuidBeta)).toBe(false);
  });

  it("two distinct UUID keys are never merged under any key-conflation (stronger check)", () => {
    // If an implementation merged uuid-alpha and uuid-beta by some key transform,
    // the merged card would have df=2 and a different idf than ln(3/1).
    // Assert that both have idf strictly equal to ln(3) (df=1 each).
    const corpus = buildIdfStats(collisionCorpus);
    const idfAlpha = corpus.idf.get(uuidAlpha)!;
    const idfBeta = corpus.idf.get(uuidBeta)!;
    // If merged: idf would be ln(3/2) ≈ 0.405, not ln(3) ≈ 1.099
    expect(idfAlpha).toBeGreaterThan(LN_3_OVER_2 + 0.1);
    expect(idfBeta).toBeGreaterThan(LN_3_OVER_2 + 0.1);
  });
});
