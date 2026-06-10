// The `tides3` variant builds a pool by combining a Dreamcaller's lead tide with
// shuffled fill tides and dealing to `TIDES3.dealSize`. These tests pin the
// structural contract (determinism per seed, the deal size and copy cap, the
// always-present lead, the forced fill tide, and the failure modes) against
// synthetic artifacts — never against the committed `data/tides3.jsonc`, whose
// content is baked design data and subject to change at any time.

import { describe, expect, it } from "vitest";

import { makeRng } from "./rng.ts";
import type { Tides3DecksJson } from "./tides3-io.ts";
import { validateTides3Decks } from "./tides3-io.ts";
import type { PoolData } from "./types.ts";
import { TIDES3, generateTides3 } from "./variant-tides3.ts";

// A synthetic artifact of disjoint tides. Tide 1 is the signature lead for
// "dc-a" (whose pool lists every tide so fill always has candidates); "dc-b"
// leads with tide 2. Card UUIDs are `<tide>-card-<i>`; copies default to 2.
function makeTides3(
  tideCount: number,
  cardsPerTide: number,
  copies = 2,
): Tides3DecksJson {
  const tides: Tides3DecksJson["tides"] = Array.from(
    { length: tideCount },
    (_, t) => ({
    id: `tide-${String(t + 1)}`,
    name: `Tide ${String(t + 1)}`,
    role: t === 0 ? "signature" : "neutral",
    cards: Array.from({ length: cardsPerTide }, (_, i) => ({
      id: `tide-${String(t + 1)}-card-${String(i)}`,
      name: `Card ${String(t + 1)}.${String(i)}`,
      copies,
    })),
  }));
  const allIds = tides.map((t) => t.id);
  return {
    version: 1,
    tides,
    tidePoolByDreamcaller: {
      "dc-a": allIds,
      "dc-b": [allIds[1], ...allIds.filter((id) => id !== allIds[1])],
    },
  };
}

function makePoolData(tides3Decks: Tides3DecksJson): PoolData {
  return {
    core: new Set(),
    archLists: new Map(),
    draftLists: new Map(),
    tides3Decks,
  };
}

function poolSize(counts: Map<string, number>): number {
  let s = 0;
  for (const v of counts.values()) s += v;
  return s;
}

describe("generateTides3", () => {
  it("is deterministic per seed", () => {
    const poolData = makePoolData(makeTides3(10, 30));
    const a = generateTides3(makeRng(7), poolData, "dc-a");
    const b = generateTides3(makeRng(7), poolData, "dc-a");
    expect([...a.counts.entries()]).toEqual([...b.counts.entries()]);
    expect(a.selected).toEqual(b.selected);
  });

  it("deals exactly the deal size with at most the copy cap per card", () => {
    const poolData = makePoolData(makeTides3(10, 30));
    const result = generateTides3(makeRng(3), poolData, "dc-a");
    expect(poolSize(result.counts)).toBe(TIDES3.dealSize);
    for (const count of result.counts.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(TIDES3.cap);
    }
  });

  it("deals the whole bag when it is smaller than the deal size", () => {
    // 2 tides x 3 cards x 2 copies = 12 dealable copies, far below the deal size.
    const poolData = makePoolData(makeTides3(2, 3));
    const result = generateTides3(makeRng(1), poolData, "dc-a");
    expect(poolSize(result.counts)).toBe(12);
  });

  it("always leads with the Dreamcaller's first pool tide", () => {
    const poolData = makePoolData(makeTides3(10, 30));
    for (let seed = 0; seed < 20; seed += 1) {
      const result = generateTides3(makeRng(seed), poolData, "dc-a");
      expect(result.selected[0]).toBe("tides3");
      // The lead (pool[0] = "tide-1") joins first, before any shuffled fill.
      expect(result.selected[1]).toBe("tide-1");
    }
  });

  it("mixes in at least one fill tide even when the lead alone fills the pool", () => {
    // A single 200-copy lead tide already exceeds the 150-copy deal size, but the
    // minimum-fill rule still joins one broad tide, so every pool combines decks.
    const data = makeTides3(6, 100); // each tide: 100 cards x 2 copies = 200 copies
    const poolData = makePoolData(data);
    for (let seed = 0; seed < 10; seed += 1) {
      const result = generateTides3(makeRng(seed), poolData, "dc-a");
      const joined = result.selected.slice(1);
      expect(joined[0]).toBe("tide-1");
      expect(joined.length).toBeGreaterThanOrEqual(1 + TIDES3.minFillTides);
    }
  });

  it("shuffles all tides together without a dreamcaller id or pool entry", () => {
    const poolData = makePoolData(makeTides3(10, 30));
    const noId = generateTides3(makeRng(11), poolData, undefined);
    const unknownId = generateTides3(makeRng(11), poolData, "dc-unknown");
    expect(noId.selected).toEqual(unknownId.selected);
    expect(poolSize(noId.counts)).toBe(TIDES3.dealSize);
  });

  it("maps card UUIDs through cardNameById and skips unknown UUIDs", () => {
    const data = makeTides3(1, 4);
    const poolData = makePoolData(data);
    // Only two of the four UUIDs are in the catalog, under renamed display names.
    poolData.cardNameById = new Map([
      ["tide-1-card-0", "Renamed Zero"],
      ["tide-1-card-1", "Renamed One"],
    ]);
    const result = generateTides3(makeRng(2), poolData, "dc-a");
    expect([...result.counts.keys()].sort()).toEqual([
      "Renamed One",
      "Renamed Zero",
    ]);
  });

  it("throws when no tide decks are bundled", () => {
    const poolData = makePoolData(makeTides3(2, 2));
    delete poolData.tides3Decks;
    expect(() => generateTides3(makeRng(0), poolData, "dc-a")).toThrow(/tides3/);
  });
});

describe("validateTides3Decks (smoke)", () => {
  it("accepts the synthetic fixture", () => {
    const data = makeTides3(3, 2);
    expect(validateTides3Decks(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });
});
