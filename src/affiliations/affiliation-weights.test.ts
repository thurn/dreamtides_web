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
import {
  AFFILIATION_MIN_MULTIPLIER,
  affiliationWeight,
  buildAffiliationNumberWeights,
  buildAffiliationWeightContext,
  opponentAffiliationBias,
  reweightCandidates,
} from "./affiliation-weights.ts";

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "public");
function readPublicJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, filename), "utf8")) as T;
}

// Live fixtures, loaded once.
const CARDS = readPublicJson<CardData[]>("cards_v2-data.json");
const DECKLISTS = readPublicJson<string[][]>("decklists-data.json");
const AFFILIATIONS = readPublicJson<AffiliationContent[]>(
  "affiliations-data.json",
);

const CARD_DATABASE = new Map<number, CardData>(
  CARDS.map((card) => [card.cardNumber, card]),
);
const POOL_DATA: PoolData = buildPoolData(CARDS, DECKLISTS);

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
      const weight = affiliationWeight(card.name, ctx);
      expect(Number.isFinite(weight)).toBe(true);
      expect(weight).toBeGreaterThan(0);
    }
  });

  it("weights signature-set cards strictly above an average unrelated card", () => {
    const { affiliation, ctx } = firstScorableAffiliation();

    // Resolve the affiliation's signature UUIDs to live card names.
    const nameById = new Map(CARDS.map((c) => [c.id, c.name]));
    const signatureNames = affiliation.signatureCards
      .map((uuid) => nameById.get(uuid))
      .filter((n): n is string => n !== undefined);
    expect(signatureNames.length).toBeGreaterThan(0);

    // The mean signature weight must beat the mean weight across the catalog.
    const signatureMean =
      signatureNames.reduce((s, n) => s + affiliationWeight(n, ctx), 0) /
      signatureNames.length;
    const catalogMean =
      CARDS.reduce((s, c) => s + affiliationWeight(c.name, ctx), 0) /
      CARDS.length;
    expect(signatureMean).toBeGreaterThan(catalogMean);

    // The single most affiliated card must beat the floor (so the bias is real).
    const maxWeight = Math.max(
      ...CARDS.map((c) => affiliationWeight(c.name, ctx)),
    );
    expect(maxWeight).toBeGreaterThan(AFFILIATION_MIN_MULTIPLIER);
  });

  it("never removes membership: every candidate keeps a positive weight", () => {
    const { ctx } = firstScorableAffiliation();
    // The IDF / draft machinery works in card-NAME space, where same-named cards
    // collapse to one term, so reweight the distinct candidate names.
    const candidateNames = [...new Set(CARDS.map((c) => c.name))];
    const weights = reweightCandidates(candidateNames, ctx);
    expect(weights.size).toBe(candidateNames.length);
    for (const name of candidateNames) {
      const w = weights.get(name);
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
