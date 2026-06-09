// The `tides` variant builds a pool by shuffling a few of the committed tide
// decks together and dealing to the target size. These tests pin the
// structural contract (determinism per seed, the deal size and copy cap, the
// favored-tide draw, and the failure modes) against synthetic tide artifacts —
// never against the committed `data/tides.jsonc`, whose content is design data
// and subject to change at any time.

import { describe, expect, it } from "vitest";

import { makeRng } from "./rng.ts";
import type { TideDecksJson } from "./tides-io.ts";
import { validateTideDecks } from "./tides-io.ts";
import type { PoolData } from "./types.ts";
import { TIDES, generateTides } from "./variant-tides.ts";

// A synthetic artifact of `tideCount` disjoint tides plus one favored tide for
// one Dreamcaller. Card UUIDs are `<tide>-card-<i>`; copies default to 2 so a
// full deal is available from few tides.
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
  return {
    version: 1,
    tides,
    favoredTidesByDreamcaller: { "dc-favored": ["tide-1"] },
  };
}

function makePoolData(tideDecks: TideDecksJson): PoolData {
  return {
    core: new Set(),
    archLists: new Map(),
    draftLists: new Map(),
    tideDecks,
  };
}

function poolSize(counts: Map<string, number>): number {
  let s = 0;
  for (const v of counts.values()) s += v;
  return s;
}

describe("generateTides", () => {
  it("is deterministic per seed", () => {
    const poolData = makePoolData(makeTideDecks(10, 30));
    const a = generateTides(makeRng(7), poolData, "dc-favored", 60);
    const b = generateTides(makeRng(7), poolData, "dc-favored", 60);
    expect([...a.counts.entries()]).toEqual([...b.counts.entries()]);
    expect(a.selected).toEqual(b.selected);
  });

  it("deals exactly the target size with at most the copy cap per card", () => {
    const poolData = makePoolData(makeTideDecks(10, 30));
    const result = generateTides(makeRng(3), poolData, undefined, 100);
    expect(poolSize(result.counts)).toBe(100);
    for (const count of result.counts.values()) {
      expect(count).toBeGreaterThanOrEqual(1);
      expect(count).toBeLessThanOrEqual(TIDES.cap);
    }
  });

  it("deals the whole bag when it is smaller than the target", () => {
    // 2 tides x 3 cards x 2 copies = 12 dealable copies, far below the target.
    const poolData = makePoolData(makeTideDecks(2, 3));
    const result = generateTides(makeRng(1), poolData, undefined, 200);
    expect(poolSize(result.counts)).toBe(12);
  });

  it("always includes a baked favored tide for a Dreamcaller that has one", () => {
    const poolData = makePoolData(makeTideDecks(10, 30));
    for (let seed = 0; seed < 20; seed += 1) {
      const result = generateTides(makeRng(seed), poolData, "dc-favored", 60);
      expect(result.selected).toContain("tide-1");
    }
  });

  it("labels the pool with the algorithm and joins tides until a full pool is dealable", () => {
    const data = makeTideDecks(10, 30);
    const poolData = makePoolData(data);
    // Each disjoint tide deals 60 copies, so a 150-copy pool needs 3 tides.
    const result = generateTides(makeRng(5), poolData, "dc-favored", 150);
    expect(result.selected[0]).toBe("tides");
    const tideIds = new Set(data.tides.map((t) => t.id));
    const chosen = result.selected.slice(1);
    expect(chosen.length).toBe(3);
    for (const id of chosen) expect(tideIds.has(id)).toBe(true);
  });

  it("draws all tides at random without a dreamcaller id or favored entry", () => {
    const poolData = makePoolData(makeTideDecks(10, 30));
    const noId = generateTides(makeRng(11), poolData, undefined, 150);
    const unknownId = generateTides(makeRng(11), poolData, "dc-unknown", 150);
    expect(noId.selected).toEqual(unknownId.selected);
    expect(noId.selected.slice(1).length).toBe(3);
  });

  it("includes the core tide in every pool when the artifact carries one", () => {
    const data = makeTideDecks(10, 30);
    data.coreTideId = "tide-3";
    const poolData = makePoolData(data);
    for (let seed = 0; seed < 10; seed += 1) {
      const result = generateTides(makeRng(seed), poolData, undefined, 150);
      // The core tide always joins first.
      expect(result.selected[1]).toBe("tide-3");
    }
  });

  it("maps card UUIDs through cardNameById and skips unknown UUIDs", () => {
    const data = makeTideDecks(1, 4);
    const poolData = makePoolData(data);
    // Only two of the four UUIDs are in the catalog, under renamed display names.
    poolData.cardNameById = new Map([
      ["tide-1-card-0", "Renamed Zero"],
      ["tide-1-card-1", "Renamed One"],
    ]);
    const result = generateTides(makeRng(2), poolData, undefined, 200);
    expect([...result.counts.keys()].sort()).toEqual(["Renamed One", "Renamed Zero"]);
  });

  it("throws when no tide decks are bundled", () => {
    const poolData = makePoolData(makeTideDecks(2, 2));
    delete poolData.tideDecks;
    expect(() => generateTides(makeRng(0), poolData, undefined, 60)).toThrow(
      /tides/,
    );
  });
});

describe("validateTideDecks", () => {
  it("accepts a well-formed artifact", () => {
    const data = makeTideDecks(3, 2);
    expect(validateTideDecks(JSON.parse(JSON.stringify(data)))).toEqual(data);
  });

  it("rejects favored entries that name no tide", () => {
    const data = makeTideDecks(3, 2);
    data.favoredTidesByDreamcaller["dc-favored"] = ["tide-nope"];
    expect(() => validateTideDecks(data)).toThrow(/names no tide/);
  });

  it("rejects a coreTideId that names no tide", () => {
    const data = makeTideDecks(3, 2);
    data.coreTideId = "tide-nope";
    expect(() => validateTideDecks(data)).toThrow(/coreTideId/);
  });

  it("rejects duplicate tide ids and cards without UUIDs", () => {
    const dup = makeTideDecks(2, 2);
    dup.tides[1].id = dup.tides[0].id;
    expect(() => validateTideDecks(dup)).toThrow(/duplicate/);

    const noUuid = makeTideDecks(2, 2);
    noUuid.tides[0].cards[0].id = "";
    expect(() => validateTideDecks(noUuid)).toThrow(/UUID/);
  });
});
