// The `tides2` variant builds a pool by drawing a lead tide from the
// Dreamcaller's curated tide pool and joining the lead's allied tides until the
// pool is full. These tests pin the structural contract (determinism per seed,
// the deal size and copy cap, lead-from-pool selection, ally-only fill, the
// breadth-first fallback, and the failure modes) against synthetic artifacts —
// never against the committed `data/tides2.jsonc` /
// `data/tides2_relationships.jsonc`, whose contents are design data and subject
// to change at any time.

import { describe, expect, it } from "vitest";

import { makeRng } from "./rng.ts";
import type { TideDecksJson } from "./tides-io.ts";
import type { TideRelationshipsJson } from "./tide-relationships-io.ts";
import type { PoolData } from "./types.ts";
import { TIDES2, generateTides2 } from "./variant-tides2.ts";

// A synthetic artifact of `tideCount` disjoint tides. Card UUIDs are
// `<tide>-card-<i>`; copies default to 2 so a full deal is available from few
// tides.
function makeTideDecks(
  tideCount: number,
  cardsPerTide: number,
  copies = 2,
): TideDecksJson {
  const tides = Array.from({ length: tideCount }, (_, t) => ({
    id: `tide-${String(t + 1)}`,
    name: `Tide ${String(t + 1)}`,
    cards: Array.from({ length: cardsPerTide }, (_, i) => ({
      id: `tide-${String(t + 1)}-card-${String(i)}`,
      name: `Card ${String(t + 1)}.${String(i)}`,
      copies,
    })),
  }));
  return { version: 1, tides, favoredTidesByDreamcaller: {} };
}

// A relationships artifact whose allies are a ring (tide-i allied to the next
// few tides) so every tide has a non-empty ally list, plus one Dreamcaller pool.
function makeRelationships(
  tideCount: number,
  tidePoolByDreamcaller: Record<string, string[]> = { "dc-a": ["tide-1"] },
): TideRelationshipsJson {
  const ids = Array.from({ length: tideCount }, (_, t) => `tide-${String(t + 1)}`);
  const alliesByTide: Record<string, string[]> = {};
  for (let i = 0; i < ids.length; i += 1) {
    alliesByTide[ids[i]] = [
      ids[(i + 1) % ids.length],
      ids[(i + 2) % ids.length],
      ids[(i + 3) % ids.length],
    ];
  }
  return { version: 1, alliesByTide, tidePoolByDreamcaller };
}

function makePoolData(
  tides2Decks: TideDecksJson,
  tides2Relationships: TideRelationshipsJson,
): PoolData {
  return {
    core: new Set(),
    archLists: new Map(),
    draftLists: new Map(),
    tides2Decks,
    tides2Relationships,
  };
}

function poolSize(counts: Map<string, number>): number {
  let s = 0;
  for (const v of counts.values()) s += v;
  return s;
}

describe("generateTides2", () => {
  it("is deterministic per seed", () => {
    const poolData = makePoolData(makeTideDecks(10, 30), makeRelationships(10));
    const a = generateTides2(makeRng(7), poolData, "dc-a", 60);
    const b = generateTides2(makeRng(7), poolData, "dc-a", 60);
    expect([...a.counts.entries()]).toEqual([...b.counts.entries()]);
    expect(a.selected).toEqual(b.selected);
  });

  it("deals exactly the target size with at most the copy cap per card", () => {
    const poolData = makePoolData(makeTideDecks(10, 30), makeRelationships(10));
    const result = generateTides2(makeRng(3), poolData, "dc-a", 100);
    expect(poolSize(result.counts)).toBe(100);
    for (const count of result.counts.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(TIDES2.cap);
    }
  });

  it("deals the whole reachable bag when it is smaller than the target", () => {
    // 4 disjoint tides x 3 cards x 2 copies = 24 dealable copies. With a lead of
    // tide-1 the ring of allies reaches every tide, so the whole bag (24) deals.
    const poolData = makePoolData(makeTideDecks(4, 3), makeRelationships(4));
    const result = generateTides2(makeRng(1), poolData, "dc-a", 200);
    expect(poolSize(result.counts)).toBe(24);
  });

  it("draws the lead from the Dreamcaller's tide pool", () => {
    const poolData = makePoolData(
      makeTideDecks(10, 30),
      makeRelationships(10, { "dc-a": ["tide-4", "tide-7"] }),
    );
    for (let seed = 0; seed < 20; seed += 1) {
      const result = generateTides2(makeRng(seed), poolData, "dc-a", 60);
      // selected[0] is the algorithm label; selected[1] is the lead tide.
      expect(["tide-4", "tide-7"]).toContain(result.selected[1]);
    }
  });

  it("fills only from the lead's published allies", () => {
    // tide-1's allies are tide-2, tide-3, tide-4 (the ring). A 150-copy pool
    // needs the lead plus more tides; every joined tide must be the lead or one
    // of its allies (no uniform-random draw).
    const data = makeTideDecks(10, 30);
    const poolData = makePoolData(data, makeRelationships(10, { "dc-a": ["tide-1"] }));
    const result = generateTides2(makeRng(5), poolData, "dc-a", 150);
    expect(result.selected[0]).toBe("tides2");
    expect(result.selected[1]).toBe("tide-1");
    const allowed = new Set(["tide-1", "tide-2", "tide-3", "tide-4"]);
    for (const id of result.selected.slice(1)) expect(allowed.has(id)).toBe(true);
  });

  it("continues breadth-first through allies' allies when direct allies cannot fill", () => {
    // Small tides: each tide deals 6 copies (3 cards x 2). The lead's three
    // direct allies + lead = 24 copies, far below 60, so the fill must walk
    // allies' allies (still published relationships) to reach the target.
    const poolData = makePoolData(makeTideDecks(10, 3), makeRelationships(10));
    const result = generateTides2(makeRng(2), poolData, "dc-a", 60);
    expect(poolSize(result.counts)).toBe(60);
    // More than the lead + its 3 direct allies had to join.
    expect(result.selected.slice(1).length).toBeGreaterThan(4);
  });

  it("falls back to a draw over all tides without a known Dreamcaller pool", () => {
    const poolData = makePoolData(makeTideDecks(10, 30), makeRelationships(10));
    const noId = generateTides2(makeRng(11), poolData, undefined, 150);
    const unknownId = generateTides2(makeRng(11), poolData, "dc-unknown", 150);
    expect(noId.selected).toEqual(unknownId.selected);
    expect(noId.selected[0]).toBe("tides2");
    expect(noId.selected.length).toBeGreaterThan(1);
  });

  it("includes the core tide in every pool when the artifact carries one", () => {
    const data = makeTideDecks(10, 30);
    data.coreTideId = "tide-3";
    const poolData = makePoolData(data, makeRelationships(10));
    for (let seed = 0; seed < 10; seed += 1) {
      const result = generateTides2(makeRng(seed), poolData, "dc-a", 150);
      // The core tide always joins first.
      expect(result.selected[1]).toBe("tide-3");
    }
  });

  it("keys the pool by card UUID and skips UUIDs absent from the catalog", () => {
    const data = makeTideDecks(1, 4);
    const poolData = makePoolData(data, makeRelationships(1));
    // Only two of the four UUIDs are in the catalog; the rest are skipped.
    poolData.cardNameById = new Map([
      ["tide-1-card-0", "Renamed Zero"],
      ["tide-1-card-1", "Renamed One"],
    ]);
    const result = generateTides2(makeRng(2), poolData, "dc-a", 200);
    expect([...result.counts.keys()].sort()).toEqual([
      "tide-1-card-0",
      "tide-1-card-1",
    ]);
  });

  it("throws when no tide decks are bundled", () => {
    const poolData = makePoolData(makeTideDecks(2, 2), makeRelationships(2));
    delete poolData.tides2Decks;
    expect(() => generateTides2(makeRng(0), poolData, "dc-a", 60)).toThrow(/tides2/);
  });

  it("throws when no tide relationships are bundled", () => {
    const poolData = makePoolData(makeTideDecks(2, 2), makeRelationships(2));
    delete poolData.tides2Relationships;
    expect(() => generateTides2(makeRng(0), poolData, "dc-a", 60)).toThrow(
      /relationships/,
    );
  });
});
