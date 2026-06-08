// idf3 exposes the single real decklist it chose as the run's starter — the
// anchor deck the pool is grown from. Specialty shops and enemy battle decks
// both read this exact list, so it must be the deck named in `result.selected`
// (`deck#<startIdx>`), not an empty or mismatched list.

import { describe, expect, it } from "vitest";

import { buildPoolData } from "./pool-data.ts";
import { makeRng } from "./rng.ts";
import type { PoolCard } from "./types.ts";
import { generateIdf3 } from "./variant-idf3.ts";

// A handful of distinct hand-authored decklists. idfCorpus only keeps decks of
// 16-34 cards, so each deck holds 20 distinct cards. The signature cards appear
// only in deck index 2, so idf3 should anchor and start there.
function deck(prefix: string, n = 20): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}-${String(i)}`);
}

const DECKLISTS: readonly (readonly string[])[] = [
  deck("a"),
  deck("b"),
  deck("c"),
  deck("d"),
  deck("e"),
];

const SIGNATURE_CARDS = ["c-0", "c-1", "c-2"]; // only in deck index 2

function minimalCards(
  decklists: readonly (readonly string[])[],
  extra: readonly string[],
): PoolCard[] {
  const names = new Set<string>(extra);
  for (const list of decklists) for (const name of list) names.add(name);
  return [...names].map((name) => ({ name }));
}

function parseStartIdx(selected: string[]): number {
  // selected is like ["idf3", "deck#<startIdx>"].
  const match = /^deck#(\d+)$/.exec(selected[1] ?? "");
  expect(match).not.toBeNull();
  return Number((match as RegExpExecArray)[1]);
}

describe("generateIdf3 starterDeck", () => {
  it("returns the exact decklist the result names in selected", () => {
    const cards = minimalCards(DECKLISTS, SIGNATURE_CARDS);
    const poolData = buildPoolData(cards, DECKLISTS);
    const result = generateIdf3(makeRng(12345), poolData, SIGNATURE_CARDS, 30);

    expect(result.starterDeck).toBeDefined();
    expect(Array.isArray(result.starterDeck)).toBe(true);
    expect(result.starterDeck?.length).toBeGreaterThan(0);

    const startIdx = parseStartIdx(result.selected);
    expect(new Set(result.starterDeck)).toEqual(new Set(DECKLISTS[startIdx]));
  });

  it("throws when the corpus has no decklists (no silent fallback)", () => {
    // With no decklists idf3 has no anchor deck to grow from. It throws rather
    // than silently degrading to an unrelated pool.
    const cards = minimalCards(DECKLISTS, SIGNATURE_CARDS);
    const poolData = buildPoolData(cards, []);

    expect(() => generateIdf3(makeRng(12345), poolData, SIGNATURE_CARDS, 30)).toThrow(
      /cannot build a pool/,
    );
  });
});
