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
// The first third of the tides are `signature`, the rest `neutral`. "dc-a" is a
// signatured Dreamcaller (a single lead — tide 1 — plus the neutral tides as
// fill); "dc-b" is a neutral Dreamcaller (every signature tide as a lead
// candidate, neutral tides as fill). Card UUIDs are `<tide>-card-<i>`; copies
// default to 2.
function makeTides3(
  tideCount: number,
  cardsPerTide: number,
  copies = 2,
): Tides3DecksJson {
  const sigCount = Math.max(1, Math.floor(tideCount / 3));
  const tides: Tides3DecksJson["tides"] = Array.from(
    { length: tideCount },
    (_, t) => ({
      id: `tide-${String(t + 1)}`,
      name: `Tide ${String(t + 1)}`,
      role: t < sigCount ? "signature" : "neutral",
      cards: Array.from({ length: cardsPerTide }, (_, i) => ({
        id: `tide-${String(t + 1)}-card-${String(i)}`,
        name: `Card ${String(t + 1)}.${String(i)}`,
        copies,
      })),
    }),
  );
  const signatureIds = tides.filter((t) => t.role === "signature").map((t) => t.id);
  const neutralIds = tides.filter((t) => t.role === "neutral").map((t) => t.id);
  // Fall back to any tide id so tiny fixtures still have a non-empty fill.
  const fill = neutralIds.length > 0 ? neutralIds : [tides[0].id];
  return {
    version: 1,
    tides,
    tidePoolByDreamcaller: {
      "dc-a": { leads: [tides[0].id], fill },
      "dc-b": { leads: signatureIds, fill },
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

  it("always leads a single-lead (signatured) Dreamcaller with its one lead tide", () => {
    const poolData = makePoolData(makeTides3(10, 30));
    for (let seed = 0; seed < 20; seed += 1) {
      const result = generateTides3(makeRng(seed), poolData, "dc-a");
      expect(result.selected[0]).toBe("tides3");
      // The single lead ("tide-1") joins first, before any shuffled fill.
      expect(result.selected[1]).toBe("tide-1");
    }
  });

  it("leans a multi-lead (neutral) Dreamcaller on a varying signature lead", () => {
    const data = makeTides3(12, 30);
    const poolData = makePoolData(data);
    const signatureIds = new Set(
      data.tides.filter((t) => t.role === "signature").map((t) => t.id),
    );
    const leadsSeen = new Set<string>();
    for (let seed = 0; seed < 30; seed += 1) {
      const result = generateTides3(makeRng(seed), poolData, "dc-b");
      const lead = result.selected[1];
      // The lead is always one of the candidate signature tides.
      expect(signatureIds.has(lead)).toBe(true);
      leadsSeen.add(lead);
    }
    // Across runs a neutral Dreamcaller draws more than one archetype lead.
    expect(leadsSeen.size).toBeGreaterThan(1);
  });

  it("forces a fill tide for a single-lead pool but not for a multi-lead pool", () => {
    // Each tide is 100 cards x 2 copies = 200, already above the 150 deal size.
    const data = makeTides3(12, 100);
    const poolData = makePoolData(data);
    // Single-lead (signatured): the minimum-fill rule still joins one broad tide.
    const single = generateTides3(makeRng(4), poolData, "dc-a");
    expect(single.selected[1]).toBe("tide-1");
    expect(single.selected.slice(1).length).toBeGreaterThanOrEqual(2);
    // Multi-lead (neutral): the random archetype lead is the variety, so a lead
    // that already fills the pool joins no fill — a pure, coherent archetype.
    const multi = generateTides3(makeRng(4), poolData, "dc-b");
    expect(multi.selected.slice(1).length).toBe(1);
  });

  it("shuffles all tides together without a dreamcaller id or pool entry", () => {
    const poolData = makePoolData(makeTides3(10, 30));
    const noId = generateTides3(makeRng(11), poolData, undefined);
    const unknownId = generateTides3(makeRng(11), poolData, "dc-unknown");
    expect(noId.selected).toEqual(unknownId.selected);
    expect(poolSize(noId.counts)).toBe(TIDES3.dealSize);
  });

  it("keys the pool by card UUID and skips UUIDs absent from the catalog", () => {
    const data = makeTides3(1, 4);
    const poolData = makePoolData(data);
    // Only two of the four UUIDs are in the catalog; the rest are skipped.
    poolData.cardNameById = new Map([
      ["tide-1-card-0", "Renamed Zero"],
      ["tide-1-card-1", "Renamed One"],
    ]);
    const result = generateTides3(makeRng(2), poolData, "dc-a");
    expect([...result.counts.keys()].sort()).toEqual([
      "tide-1-card-0",
      "tide-1-card-1",
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
