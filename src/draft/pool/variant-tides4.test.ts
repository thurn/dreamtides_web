// The `tides4` variant builds a pool by joining a Dreamcaller's starter tide,
// drawing a random subset of its facet tides, topping up with the remaining
// facets and broad tides, and dealing to `TIDES4.dealSize`. These tests pin the
// structural contract (determinism per seed, the deal size and copy cap, the
// always-joined starter, the varying facet subset, and the failure modes)
// against synthetic artifacts — never against the committed `data/tides4.jsonc`,
// whose content is baked design data and subject to change at any time.

import { describe, expect, it } from "vitest";

import { makeRng } from "./rng.ts";
import type { Tides4DecksJson } from "./tides4-io.ts";
import { validateTides4Decks } from "./tides4-io.ts";
import type { PoolData } from "./types.ts";
import { TIDES4, generateTides4 } from "./variant-tides4.ts";

// A synthetic artifact: one starter tide, `facetCount` facet tides, and
// `neutralCount` neutral tides, each with `cardsPerTide` disjoint cards (so
// dealable copies sum across tides). "dc-a" is a signatured Dreamcaller (its
// starter plus all facets and neutrals); "dc-b" is a signatureless Dreamcaller
// (null starter, drawing its subset from every facet). Card UUIDs are
// `<tide>-card-<i>`; copies default to 2.
function makeTides4(
  facetCount: number,
  cardsPerTide: number,
  neutralCount = 2,
  copies = 2,
): Tides4DecksJson {
  const mkCards = (tideId: string) =>
    Array.from({ length: cardsPerTide }, (_, i) => ({
      id: `${tideId}-card-${String(i)}`,
      name: `Card ${tideId}.${String(i)}`,
      copies,
    }));
  const tides: Tides4DecksJson["tides"] = [
    { id: "tide-sig-1", name: "Sig 1", role: "signature", cards: mkCards("tide-sig-1") },
    ...Array.from({ length: facetCount }, (_, f) => ({
      id: `tide-fac-${String(f + 1)}`,
      name: `Facet ${String(f + 1)}`,
      role: "facet" as const,
      cards: mkCards(`tide-fac-${String(f + 1)}`),
    })),
    ...Array.from({ length: neutralCount }, (_, n) => ({
      id: `tide-neu-${String(n + 1)}`,
      name: `Neutral ${String(n + 1)}`,
      role: "neutral" as const,
      cards: mkCards(`tide-neu-${String(n + 1)}`),
    })),
  ];
  const facetIds = tides.filter((t) => t.role === "facet").map((t) => t.id);
  const neutralIds = tides.filter((t) => t.role === "neutral").map((t) => t.id);
  return {
    version: 1,
    tides,
    tidePoolByDreamcaller: {
      "dc-a": { starter: "tide-sig-1", facets: facetIds, neutral: neutralIds },
      "dc-b": { starter: null, facets: facetIds, neutral: neutralIds },
    },
  };
}

function makePoolData(tides4Decks: Tides4DecksJson): PoolData {
  return {
    core: new Set(),
    archLists: new Map(),
    draftLists: new Map(),
    tides4Decks,
  };
}

function poolSize(counts: Map<string, number>): number {
  let s = 0;
  for (const v of counts.values()) s += v;
  return s;
}

describe("generateTides4", () => {
  it("is deterministic per seed", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const a = generateTides4(makeRng(7), poolData, "dc-a");
    const b = generateTides4(makeRng(7), poolData, "dc-a");
    expect([...a.counts.entries()]).toEqual([...b.counts.entries()]);
    expect(a.selected).toEqual(b.selected);
  });

  it("deals exactly the deal size with at most the copy cap per card", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const result = generateTides4(makeRng(3), poolData, "dc-a");
    expect(poolSize(result.counts)).toBe(TIDES4.dealSize);
    for (const count of result.counts.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(TIDES4.cap);
    }
  });

  it("deals the whole bag when it is smaller than the deal size", () => {
    // 1 starter + 1 facet + 1 neutral, 3 disjoint cards each x 2 copies = 18
    // dealable copies, far below the deal size.
    const poolData = makePoolData(makeTides4(1, 3, 1));
    const result = generateTides4(makeRng(1), poolData, "dc-a");
    expect(poolSize(result.counts)).toBe(18);
  });

  it("always joins a signatured Dreamcaller's starter first", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    for (let seed = 0; seed < 20; seed += 1) {
      const result = generateTides4(makeRng(seed), poolData, "dc-a");
      expect(result.selected[0]).toBe("tides4");
      // The starter joins before any facet.
      expect(result.selected[1]).toBe("tide-sig-1");
      // The next joined tide is always a facet (the random subset draw).
      expect(result.selected[2]).toMatch(/^tide-fac-/);
    }
  });

  it("draws a varying facet subset across runs (the variety engine)", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const firstFacetSeen = new Set<string>();
    for (let seed = 0; seed < 40; seed += 1) {
      const result = generateTides4(makeRng(seed), poolData, "dc-a");
      // selected = ["tides4", starter, facet, facet?, ...]; the first facet is the
      // lead of the random subset and must vary run to run.
      firstFacetSeen.add(result.selected[2]);
    }
    expect(firstFacetSeen.size).toBeGreaterThan(1);
  });

  it("leads a signatureless Dreamcaller with a varying facet (no starter)", () => {
    const data = makeTides4(6, 30);
    const poolData = makePoolData(data);
    const facetIds = new Set(
      data.tides.filter((t) => t.role === "facet").map((t) => t.id),
    );
    const leadsSeen = new Set<string>();
    for (let seed = 0; seed < 30; seed += 1) {
      const result = generateTides4(makeRng(seed), poolData, "dc-b");
      const lead = result.selected[1];
      // With no starter the first joined tide is a facet, and it varies.
      expect(facetIds.has(lead)).toBe(true);
      leadsSeen.add(lead);
    }
    expect(leadsSeen.size).toBeGreaterThan(1);
  });

  it("shuffles all tides together without a dreamcaller id or pool entry", () => {
    const poolData = makePoolData(makeTides4(6, 30));
    const noId = generateTides4(makeRng(11), poolData, undefined);
    const unknownId = generateTides4(makeRng(11), poolData, "dc-unknown");
    expect(noId.selected).toEqual(unknownId.selected);
    expect(poolSize(noId.counts)).toBe(TIDES4.dealSize);
  });

  it("maps card UUIDs through cardNameById and skips unknown UUIDs", () => {
    const data = makeTides4(1, 4, 1);
    const poolData = makePoolData(data);
    // Only two of the starter's UUIDs are in the catalog, under renamed names;
    // every other tide's UUIDs are unknown and skipped.
    poolData.cardNameById = new Map([
      ["tide-sig-1-card-0", "Renamed Zero"],
      ["tide-sig-1-card-1", "Renamed One"],
    ]);
    const result = generateTides4(makeRng(2), poolData, "dc-a");
    expect([...result.counts.keys()].sort()).toEqual([
      "Renamed One",
      "Renamed Zero",
    ]);
  });

  it("throws when no tide decks are bundled", () => {
    const poolData = makePoolData(makeTides4(2, 2));
    delete poolData.tides4Decks;
    expect(() => generateTides4(makeRng(0), poolData, "dc-a")).toThrow(/tides4/);
  });
});

describe("validateTides4Decks (smoke)", () => {
  it("accepts the synthetic fixture", () => {
    const data = makeTides4(3, 2);
    expect(validateTides4Decks(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
});
