// `growCoherentPool` (used by the `idf4` variant) grows a pool from a starter by
// folding WHOLE decks against the accumulating pool centroid, capping copies at 2,
// until the pool reaches the target size. These tests pin the three properties
// idf4 relies on: the starter is folded first, copies cap at 2, and the pool
// reaches about the target size.

import { describe, expect, it } from "vitest";

import { type IdfDeck, growCoherentPool } from "./variant-idf.ts";

// Build an IdfDeck from a card list, computing its norm under the given weights.
function makeDeck(cards: string[], idfOf: (c: string) => number): IdfDeck {
  const set = new Set(cards);
  let sq = 0;
  for (const c of set) sq += idfOf(c) ** 2;
  return { cards: set, norm: Math.sqrt(sq) || 1 };
}

// Every card carries equal IDF weight here; coherence is then driven purely by
// shared-card overlap, which is enough to exercise the growth ordering.
const idfOf = (): number => 1;

function size(counts: Map<string, number>): number {
  let s = 0;
  for (const v of counts.values()) s += v;
  return s;
}

describe("growCoherentPool", () => {
  it("folds the starter first and reaches about the target size", () => {
    // Three disjoint 10-card decks. With the starter folded first the pool holds
    // exactly its 10 cards; growth folds whole further decks until it reaches the
    // target. Target 20 => starter + one more deck (20 cards).
    const decks = [
      makeDeck(
        Array.from({ length: 10 }, (_, i) => `a-${String(i)}`),
        idfOf,
      ),
      makeDeck(
        Array.from({ length: 10 }, (_, i) => `b-${String(i)}`),
        idfOf,
      ),
      makeDeck(
        Array.from({ length: 10 }, (_, i) => `c-${String(i)}`),
        idfOf,
      ),
    ];
    const counts = growCoherentPool(decks, idfOf, 0, 20);

    // The starter's cards are all present (folded first).
    for (let i = 0; i < 10; i++) {
      expect(counts.has(`a-${String(i)}`)).toBe(true);
    }
    // Whole decks only, so the pool lands on a 10-card boundary at/above target.
    expect(size(counts)).toBe(20);
  });

  it("caps copies at 2 when decks overlap", () => {
    // Three decks that all share an overlapping core plus unique tails, so the
    // shared cards would exceed 2 copies without the cap.
    const shared = Array.from({ length: 6 }, (_, i) => `s-${String(i)}`);
    const decks = [
      makeDeck([...shared, "a-0", "a-1", "a-2", "a-3"], idfOf),
      makeDeck([...shared, "b-0", "b-1", "b-2", "b-3"], idfOf),
      makeDeck([...shared, "c-0", "c-1", "c-2", "c-3"], idfOf),
    ];
    const counts = growCoherentPool(decks, idfOf, 0, 100);

    // No card ever exceeds 2 copies.
    for (const v of counts.values()) expect(v).toBeLessThanOrEqual(2);
    // The shared core is held at exactly the cap once >2 decks contribute it.
    for (const c of shared) expect(counts.get(c)).toBe(2);
  });

  it("folds the most coherent neighbour before a disjoint one", () => {
    // Starter overlaps deck 1 (shared core) and is disjoint from deck 2. Coherent
    // growth must fold deck 1 (higher cosine to the pool) before deck 2.
    const core = Array.from({ length: 8 }, (_, i) => `k-${String(i)}`);
    const decks = [
      makeDeck([...core, "start-0", "start-1"], idfOf), // 0: starter
      makeDeck([...core, "near-0", "near-1"], idfOf), // 1: shares the core
      makeDeck(
        Array.from({ length: 10 }, (_, i) => `far-${String(i)}`),
        idfOf,
      ), // 2: disjoint
    ];
    // Target lets exactly one neighbour fold in beyond the starter.
    const counts = growCoherentPool(decks, idfOf, 0, 12);

    // The coherent neighbour's unique cards are pulled in; the disjoint deck's
    // are not.
    expect(counts.has("near-0")).toBe(true);
    expect(counts.has("far-0")).toBe(false);
  });
});
