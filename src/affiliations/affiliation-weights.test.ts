// Weight contract for the affiliation reweighting. These run against LIVE data:
// the compiled cards_v2 catalog, the real decklist corpus, and a real
// affiliation's curated signature set (read straight from the public bundle, the
// same artifacts the app ships). The assertions are property-based — they never
// hardcode a card UUID/name or an arbitrary content count — so they stay true as
// the TOML game-design data changes.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { AffiliationContent } from "../types/content.ts";
import type { CardData } from "../types/cards.ts";
import { buildPoolData } from "../draft/pool/pool-data.ts";
import type { PoolData } from "../draft/pool/types.ts";
import { weightedSample } from "../draft/pool/rng.ts";
import { buildIdfStats } from "../draft/idf-fit.ts";
import {
  AFFILIATION_MIN_MULTIPLIER,
  affiliationWeight,
  buildAffiliationNumberWeights,
  buildAffiliationWeightContext,
  computeAffinityById,
  opponentAffiliationBias,
  reweightCandidates,
} from "./affiliation-weights.ts";

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "public");
function readPublicJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, filename), "utf8")) as T;
}

// Live fixtures, loaded once. The IDF pool engine and affiliation reweighting
// score on the id-keyed decklist corpus, so feed `decklist-ids-data.json` (the
// UUID corpus) — the affiliation signatures are themselves UUIDs.
const CARDS = readPublicJson<CardData[]>("cards_v2-data.json");
const DECKLISTS = readPublicJson<string[][]>("decklists-data.json");
const DECKLIST_IDS = readPublicJson<string[][]>("decklist-ids-data.json");
const AFFILIATIONS = readPublicJson<AffiliationContent[]>(
  "affiliations-data.json",
);

const CARD_DATABASE = new Map<number, CardData>(
  CARDS.map((card) => [card.cardNumber, card]),
);
const POOL_DATA: PoolData = buildPoolData(CARDS, DECKLISTS, undefined, DECKLIST_IDS);

// Pick the first affiliation that the live corpus can actually score, so the
// suite never depends on a specific affiliation id surviving a data edit.
function firstScorableAffiliation(): {
  affiliation: AffiliationContent;
  ctx: NonNullable<ReturnType<typeof buildAffiliationWeightContext>>;
} {
  for (const affiliation of AFFILIATIONS) {
    const ctx = buildAffiliationWeightContext(
      POOL_DATA,
      CARD_DATABASE,
      affiliation,
    );
    if (ctx) return { affiliation, ctx };
  }
  throw new Error("No affiliation could be scored against the live corpus");
}

// A tiny seeded RNG so the statistical draw test is deterministic.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One weighted draw without replacement from `entries`, returning the picked
// card numbers — the same scheme `weightedSample` in the draft engine uses.
function weightedDraw(
  entries: Array<{ cardNumber: number; weight: number }>,
  count: number,
  rng: () => number,
): number[] {
  const pool = entries.map((e) => ({ ...e }));
  const picked: number[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    let total = 0;
    for (const e of pool) total += e.weight;
    if (total <= 0) break;
    let roll = rng() * total;
    let idx = pool.length - 1;
    for (let j = 0; j < pool.length; j++) {
      roll -= pool[j].weight;
      if (roll <= 0) {
        idx = j;
        break;
      }
    }
    picked.push(pool[idx].cardNumber);
    pool.splice(idx, 1);
  }
  return picked;
}

describe("affiliation reweighting weight contract", () => {
  it("scores at least one live affiliation against the live corpus", () => {
    const scorable = AFFILIATIONS.filter((a) =>
      buildAffiliationWeightContext(POOL_DATA, CARD_DATABASE, a),
    );
    expect(scorable.length).toBeGreaterThan(0);
  });

  it("returns a positive finite weight for every card", () => {
    const { ctx } = firstScorableAffiliation();
    for (const card of CARDS) {
      const weight = affiliationWeight(card.id, ctx);
      expect(Number.isFinite(weight)).toBe(true);
      expect(weight).toBeGreaterThan(0);
    }
  });

  it("weights signature-set cards strictly above an average unrelated card", () => {
    const { affiliation, ctx } = firstScorableAffiliation();

    // The affiliation's signature cards are UUIDs — the same key space the
    // affinity is scored in — so weight them directly.
    const signatureIds = affiliation.signatureCards;
    expect(signatureIds.length).toBeGreaterThan(0);

    // The mean signature weight must beat the mean weight across the catalog.
    const signatureMean =
      signatureIds.reduce((s, id) => s + affiliationWeight(id, ctx), 0) /
      signatureIds.length;
    const catalogMean =
      CARDS.reduce((s, c) => s + affiliationWeight(c.id, ctx), 0) /
      CARDS.length;
    expect(signatureMean).toBeGreaterThan(catalogMean);

    // The single most affiliated card must beat the floor (so the bias is real).
    const maxWeight = Math.max(
      ...CARDS.map((c) => affiliationWeight(c.id, ctx)),
    );
    expect(maxWeight).toBeGreaterThan(AFFILIATION_MIN_MULTIPLIER);
  });

  it("never removes membership: every candidate keeps a positive weight", () => {
    const { ctx } = firstScorableAffiliation();
    // The IDF / draft machinery works in card-UUID space, where two distinct
    // cards stay distinct, so reweight the distinct candidate UUIDs.
    const candidateIds = [...new Set(CARDS.map((c) => c.id.toLowerCase()))];
    const weights = reweightCandidates(candidateIds, ctx);
    expect(weights.size).toBe(candidateIds.length);
    for (const id of candidateIds) {
      const w = weights.get(id);
      expect(w).toBeDefined();
      expect(w as number).toBeGreaterThan(0);
    }
  });

  it("biases weighted draws toward affiliated cards versus unweighted draws", () => {
    const { affiliation, ctx } = firstScorableAffiliation();
    const numberWeights = buildAffiliationNumberWeights(ctx);

    // Resolve the signature card numbers, the "affiliated" set we count.
    const numberById = new Map(CARDS.map((c) => [c.id, c.cardNumber]));
    const signatureNumbers = new Set(
      affiliation.signatureCards
        .map((uuid) => numberById.get(uuid))
        .filter((n): n is number => n !== undefined),
    );
    expect(signatureNumbers.size).toBeGreaterThan(0);

    // A fixed candidate pool: the signature cards plus a broad slice of the
    // catalog, each with a base weight of 1 (one "copy"), the same starting
    // point a draw site has before affiliation reweighting.
    const baseEntries = CARDS.map((c) => ({
      cardNumber: c.cardNumber,
      weight: 1,
    }));

    const DRAWS = 4000;
    const DRAW_SIZE = 4;
    let weightedHits = 0;
    let unweightedHits = 0;
    const rngW = mulberry32(0xc0ffee);
    const rngU = mulberry32(0xc0ffee);
    for (let i = 0; i < DRAWS; i++) {
      const weighted = baseEntries.map((e) => ({
        cardNumber: e.cardNumber,
        weight: e.weight * (numberWeights.get(e.cardNumber) ?? 1),
      }));
      for (const n of weightedDraw(weighted, DRAW_SIZE, rngW)) {
        if (signatureNumbers.has(n)) weightedHits++;
      }
      for (const n of weightedDraw(
        baseEntries.map((e) => ({ ...e })),
        DRAW_SIZE,
        rngU,
      )) {
        if (signatureNumbers.has(n)) unweightedHits++;
      }
    }

    expect(weightedHits).toBeGreaterThan(unweightedHits);
  });

  it("nudges transfiguration/duplication candidate selection toward affiliated deck cards", () => {
    // The transfiguration/duplication site surfaces a small candidate set by a
    // weighted-without-replacement draw over the player's deck entries, keyed by
    // each entry's card number through the affiliation `cardNumber -> multiplier`
    // map (this mirrors `selectCardChoiceEntryIds`'s `weightedSample` call). This
    // asserts that draw surfaces affiliated cards more than a uniform shuffle of
    // the same deck.
    const { affiliation, ctx } = firstScorableAffiliation();
    const numberWeights = buildAffiliationNumberWeights(ctx);

    const numberById = new Map(CARDS.map((c) => [c.id, c.cardNumber]));
    const signatureNumbers = new Set(
      affiliation.signatureCards
        .map((uuid) => numberById.get(uuid))
        .filter((n): n is number => n !== undefined),
    );
    expect(signatureNumbers.size).toBeGreaterThan(0);

    // A deck of every card (one entry each), the candidate universe a site draws
    // from. Each entry carries its card number, the key the nudge multiplies on.
    const deck = CARDS.map((c, i) => ({
      entryId: `deck-${String(i)}`,
      cardNumber: c.cardNumber,
    }));

    const DRAWS = 4000;
    const LIMIT = 3; // the site's normal-mode candidate cap.
    let weightedHits = 0;
    let uniformHits = 0;
    const rngW = mulberry32(0x5eed1);
    const rngU = mulberry32(0x5eed2);
    for (let i = 0; i < DRAWS; i++) {
      const weighted = weightedSample(
        rngW,
        deck,
        (entry) => numberWeights.get(entry.cardNumber) ?? 1,
        LIMIT,
      );
      for (const entry of weighted) {
        if (signatureNumbers.has(entry.cardNumber)) weightedHits++;
      }
      // Uniform: equal weight on every entry, the neutral-dreamscape fallback.
      const uniform = weightedSample(rngU, deck, () => 1, LIMIT);
      for (const entry of uniform) {
        if (signatureNumbers.has(entry.cardNumber)) uniformHits++;
      }
    }

    expect(weightedHits).toBeGreaterThan(uniformHits);
  });

  it("opponentAffiliationBias keeps every candidate with a positive weight", () => {
    const { affiliation } = firstScorableAffiliation();
    const biased = opponentAffiliationBias(
      CARDS,
      affiliation,
      POOL_DATA,
      CARD_DATABASE,
    );
    expect(biased.length).toBe(CARDS.length);
    for (const { weight } of biased) {
      expect(Number.isFinite(weight)).toBe(true);
      expect(weight).toBeGreaterThan(0);
    }
    // The bias should lift at least one candidate above the floor (real pull).
    expect(
      biased.some((b) => b.weight > AFFILIATION_MIN_MULTIPLIER),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Characterization tests for computeAffinityById — synthetic corpus, no
// live TOML data. These pin the relative-ordering and range invariants so the
// delegation refactor cannot silently change behavior.
// ---------------------------------------------------------------------------
describe("computeAffinityById – characterization (synthetic corpus)", () => {
  // Build a minimal synthetic corpus where behavior is predictable:
  //   deck A  = {alpha, beta, gamma}        <- probe-like deck
  //   deck B  = {alpha, beta, delta}        <- also probe-like
  //   deck C  = {zeta, eta, theta}          <- unrelated deck
  //   deck D  = {alpha, beta, gamma, zeta, eta, theta}  <- mixed
  //   deck E  = {alpha, beta, gamma, delta, zeta, eta, theta}  <- mixed
  //
  // All five decks appear in the corpus so no card has idf=0 (ubiquitous).
  // "omega" appears in every deck → idf=0 → must be excluded from signatureWeightedIds.

  function buildSyntheticCorpus() {
    const deckA = new Set(["alpha", "beta", "gamma", "omega"]);
    const deckB = new Set(["alpha", "beta", "delta", "omega"]);
    const deckC = new Set(["zeta", "eta", "theta", "omega"]);
    const deckD = new Set(["alpha", "beta", "gamma", "zeta", "eta", "theta", "omega"]);
    const deckE = new Set([
      "alpha",
      "beta",
      "gamma",
      "delta",
      "zeta",
      "eta",
      "theta",
      "omega",
    ]);
    return buildIdfStats([deckA, deckB, deckC, deckD, deckE]);
  }

  it("affinities are in [0,1] and the strongest affiliated card scores exactly 1", () => {
    const corpus = buildSyntheticCorpus();
    const { affinityById } = computeAffinityById(corpus, [
      "alpha",
      "beta",
      "gamma",
    ]);
    expect(affinityById.size).toBeGreaterThan(0);
    let max = 0;
    for (const v of affinityById.values()) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      if (v > max) max = v;
    }
    expect(max).toBeCloseTo(1, 10);
  });

  it("probe-aligned cards score higher than unrelated cards", () => {
    const corpus = buildSyntheticCorpus();
    // Probe: alpha, beta, gamma — the signature of deck A / B.
    const { affinityById } = computeAffinityById(corpus, [
      "alpha",
      "beta",
      "gamma",
    ]);

    // alpha and beta appear in probe-like decks and mixed decks → high affinity.
    // zeta, eta, theta only appear in the unrelated deck C and mixed decks → lower.
    const alphaAffinity = affinityById.get("alpha") ?? 0;
    const zetaAffinity = affinityById.get("zeta") ?? 0;
    expect(alphaAffinity).toBeGreaterThan(zetaAffinity);
  });

  it("signatureWeightedIds contains exactly the probe cards with idf > 0", () => {
    const corpus = buildSyntheticCorpus();
    // "omega" is in every deck → idf = ln(5/5) = 0 → must be excluded.
    // alpha, beta are in some decks → idf > 0 → must be included.
    const { signatureWeightedIds } = computeAffinityById(corpus, [
      "alpha",
      "beta",
      "omega",
    ]);
    expect(signatureWeightedIds).toContain("alpha");
    expect(signatureWeightedIds).toContain("beta");
    expect(signatureWeightedIds).not.toContain("omega");
    expect(signatureWeightedIds.length).toBe(2);
  });

  it("idf=0 ubiquitous card excluded from signatureWeightedIds even when sole signature", () => {
    const corpus = buildSyntheticCorpus();
    // Probe is only "omega" which has idf=0 → treated as empty probe.
    const { affinityById, signatureWeightedIds } = computeAffinityById(
      corpus,
      ["omega"],
    );
    expect(signatureWeightedIds).toHaveLength(0);
    expect(affinityById.size).toBe(0);
  });

  it("empty probe returns empty affinityById and empty signatureWeightedIds", () => {
    const corpus = buildSyntheticCorpus();
    const { affinityById, signatureWeightedIds } = computeAffinityById(
      corpus,
      [],
    );
    expect(affinityById.size).toBe(0);
    expect(signatureWeightedIds).toHaveLength(0);
  });

  it("probe with unknown names (not in corpus) returns empty results", () => {
    const corpus = buildSyntheticCorpus();
    // "nonexistent" has no idf entry at all → idf=0 → treated as empty probe.
    const { affinityById, signatureWeightedIds } = computeAffinityById(
      corpus,
      ["nonexistent"],
    );
    expect(affinityById.size).toBe(0);
    expect(signatureWeightedIds).toHaveLength(0);
  });

  it("relative ordering is stable: more-probe-like card outscores less-probe-like", () => {
    const corpus = buildSyntheticCorpus();
    // Probe: alpha, beta, gamma.
    // gamma only appears in decks A, D, E — all probe-overlapping.
    // delta appears in decks B, E — some probe-overlapping, but deck B is also probe-like.
    // zeta appears in decks C, D, E — C is unrelated, so delta should still score > zeta.
    const { affinityById } = computeAffinityById(corpus, [
      "alpha",
      "beta",
      "gamma",
    ]);
    const gammaAff = affinityById.get("gamma") ?? 0;
    const zetaAff = affinityById.get("zeta") ?? 0;
    expect(gammaAff).toBeGreaterThan(zetaAff);
  });
});
