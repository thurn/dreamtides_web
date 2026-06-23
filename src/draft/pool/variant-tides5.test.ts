// `tides5` is the same runtime algorithm as `tides4` ({@link combineTidesPool}),
// reading its own committed artifact from `poolData.tides5Decks`. The deep
// structural contract (deterministic deal, copy cap, starter-first selection, the
// facet-subset variety engine, provenance) is exercised by the `tides4` suite,
// which shares the exact code path. These tests pin the `tides5`-specific wiring:
// the variant reads the `tides5Decks` field, tags its pool with the `tides5`
// label, produces a full pool, and fails loudly when its artifact is absent — all
// against a synthetic artifact, never the committed `data/tides5.jsonc`.

import { describe, expect, it } from "vitest";

import { makeRng } from "./rng.ts";
import type { Tides5DecksJson } from "./tides5-io.ts";
import type { PoolData } from "./types.ts";
import { TIDES4 } from "./variant-tides4.ts";
import { generateTides5 } from "./variant-tides5.ts";

// A synthetic artifact: one starter tide, `facetCount` facet tides, and
// `neutralCount` neutral tides, each with `cardsPerTide` disjoint cards. "dc-a" is
// a signatured Dreamcaller; "dc-b" is signatureless (null starter). The schema is
// the `tides4` schema verbatim.
function makeTides5(
  facetCount: number,
  cardsPerTide: number,
  neutralCount = 2,
  copies = 2,
): Tides5DecksJson {
  const mkCards = (tideId: string) =>
    Array.from({ length: cardsPerTide }, (_, i) => ({
      id: `${tideId}-card-${String(i)}`,
      name: `Card ${tideId}.${String(i)}`,
      copies,
    }));
  const tides: Tides5DecksJson["tides"] = [
    {
      id: "tide-sig-1",
      name: "Sig 1",
      role: "signature",
      color: "purple",
      cards: mkCards("tide-sig-1"),
    },
    ...Array.from({ length: facetCount }, (_, f) => ({
      id: `tide-fac-${String(f + 1)}`,
      name: `Facet ${String(f + 1)}`,
      role: "facet" as const,
      color: "green" as const,
      cards: mkCards(`tide-fac-${String(f + 1)}`),
    })),
    ...Array.from({ length: neutralCount }, (_, n) => ({
      id: `tide-neu-${String(n + 1)}`,
      name: `Neutral ${String(n + 1)}`,
      role: "neutral" as const,
      color: "blue" as const,
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

function makePoolData(tides5Decks: Tides5DecksJson): PoolData {
  return {
    core: new Set(),
    archLists: new Map(),
    draftLists: new Map(),
    tides5Decks,
  };
}

function poolSize(counts: Map<string, number>): number {
  let s = 0;
  for (const v of counts.values()) s += v;
  return s;
}

describe("generateTides5", () => {
  it("reads tides5Decks and tags the pool with the tides5 label", () => {
    const poolData = makePoolData(makeTides5(6, 30));
    const result = generateTides5(makeRng(7), poolData, "dc-a");
    expect(result.selected[0]).toBe("tides5");
    // Same starter-first selection as tides4 (shared combine core).
    expect(result.selected[1]).toBe("tide-sig-1");
    expect(result.selected[2]).toMatch(/^tide-fac-/);
  });

  it("is deterministic per seed", () => {
    const poolData = makePoolData(makeTides5(6, 30));
    const a = generateTides5(makeRng(4), poolData, "dc-a");
    const b = generateTides5(makeRng(4), poolData, "dc-a");
    expect([...a.counts.entries()]).toEqual([...b.counts.entries()]);
    expect(a.selected).toEqual(b.selected);
  });

  it("deals exactly the deal size with at most the copy cap per card", () => {
    const poolData = makePoolData(makeTides5(6, 30));
    const result = generateTides5(makeRng(3), poolData, "dc-a");
    expect(poolSize(result.counts)).toBe(TIDES4.dealSize);
    for (const count of result.counts.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(TIDES4.cap);
    }
  });

  it("produces tides4-shaped provenance under the tides4Provenance field", () => {
    const poolData = makePoolData(makeTides5(6, 30));
    const result = generateTides5(makeRng(7), poolData, "dc-a");
    const provenance = result.tides4Provenance;
    expect(provenance).toBeDefined();
    if (provenance === undefined) return;
    expect(provenance.dreamcallerId).toBe("dc-a");
    expect(provenance.signatureless).toBe(false);
    expect(provenance.tides[0].selection).toBe("starter");
  });

  it("throws when no tide decks are bundled", () => {
    const poolData = makePoolData(makeTides5(2, 2));
    delete poolData.tides5Decks;
    expect(() => generateTides5(makeRng(0), poolData, "dc-a")).toThrow(/tides5/);
  });
});
