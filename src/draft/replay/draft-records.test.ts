// Unit tests for the record-replay helpers. Hand-built name indexes and a
// synthetic record stand in for the bundled assets.

import { describe, expect, it } from "vitest";

import type { DraftRecord } from "../../data/cards-v2-database.ts";
import {
  buildPackSequence,
  resolveCardNames,
  selectRecordIndex,
  selectReplayRecordIndex,
} from "./draft-records.ts";

describe("selectRecordIndex", () => {
  it("is deterministic for a fixed seed", () => {
    const a = selectRecordIndex(12345, 100);
    const b = selectRecordIndex(12345, 100);
    expect(a).toBe(b);
  });

  it("always returns an index within [0, recordCount)", () => {
    for (let seed = 0; seed < 200; seed += 1) {
      const idx = selectRecordIndex(seed, 7);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(7);
    }
  });

  it("varies across seeds", () => {
    const results = new Set<number>();
    for (let seed = 0; seed < 50; seed += 1) {
      results.add(selectRecordIndex(seed, 30));
    }
    expect(results.size).toBeGreaterThan(1);
  });

  it("returns 0 when there are no records", () => {
    expect(selectRecordIndex(42, 0)).toBe(0);
    expect(selectRecordIndex(42, -5)).toBe(0);
  });
});

describe("resolveCardNames", () => {
  it("maps names to numbers, drops unresolved, dedupes first-seen, preserves order", () => {
    const index = new Map<string, number>([
      ["alpha", 10],
      ["beta", 20],
      ["gamma", 30],
    ]);
    // "ghost" is unresolved (dropped); "alpha" repeats (deduped to its first
    // position); order otherwise preserved.
    const result = resolveCardNames(
      ["beta", "ghost", "alpha", "alpha", "gamma"],
      index,
    );
    expect(result).toEqual([20, 10, 30]);
  });

  it("returns an empty array when nothing resolves", () => {
    const index = new Map<string, number>([["alpha", 1]]);
    expect(resolveCardNames(["x", "y"], index)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// selectReplayRecordIndex
// ---------------------------------------------------------------------------

/** Minimal record builder for selectReplayRecordIndex tests. */
function makeRec(id: string, packs: string[][]): DraftRecord {
  return {
    id,
    draftId: `draft-${id}`,
    sourceFile: `draft-${id}-records.json`,
    mainboard: packs.flat(),
    packs,
    picks: packs.map(() => []),
    packIds: packs,
    pickIds: packs.map(() => []),
  };
}

describe("selectReplayRecordIndex", () => {
  // A tiny IDF map: "alpha" and "beta" have positive weights; "common" has 0.
  const idf = new Map<string, number>([
    ["alpha", 2.5],
    ["beta", 1.0],
    ["common", 0],
  ]);

  // recRich: packs contain "alpha" in 2 packs and "beta" in 1 pack → high score.
  // recPoor: packs contain neither → score 0.
  const recRich = makeRec("rich", [
    ["alpha", "other"],
    ["alpha", "beta"],
    ["other"],
  ]);
  const recPoor = makeRec("poor", [
    ["other"],
    ["other2"],
    ["other3"],
  ]);

  it("prefers a record whose packs contain the signature cards over one that does not", () => {
    const records = [recPoor, recRich]; // recPoor at index 0, recRich at index 1
    // With shortlistSize=1 the single best-scoring record is always chosen.
    const chosen = selectReplayRecordIndex(["alpha", "beta"], records, idf, 99, 1);
    expect(chosen).toBe(1); // recRich is at index 1
  });

  it("is deterministic for a fixed seed", () => {
    const records = [recRich, recPoor];
    const a = selectReplayRecordIndex(["alpha"], records, idf, 12345);
    const b = selectReplayRecordIndex(["alpha"], records, idf, 12345);
    expect(a).toBe(b);
  });

  it("varies across seeds within the matched shortlist", () => {
    // Build enough records so the shortlist (25 by default) has variety.
    const richRecords = Array.from({ length: 30 }, (_, i) =>
      makeRec(`rich-${String(i)}`, [["alpha"], ["beta"]]),
    );
    const results = new Set<number>();
    for (let seed = 0; seed < 100; seed += 1) {
      results.add(selectReplayRecordIndex(["alpha"], richRecords, idf, seed));
    }
    // Expect multiple distinct records to be chosen across 100 seeds.
    expect(results.size).toBeGreaterThan(1);
  });

  it("falls back to uniform when idf is undefined", () => {
    const records = [recRich, recPoor];
    const seed = 42;
    const fallback = selectReplayRecordIndex(["alpha"], records, undefined, seed);
    expect(fallback).toBe(selectRecordIndex(seed, records.length));
    expect(fallback).toBeGreaterThanOrEqual(0);
    expect(fallback).toBeLessThan(records.length);
  });

  it("falls back to uniform when signatures are empty", () => {
    const records = [recRich, recPoor];
    const seed = 77;
    const fallback = selectReplayRecordIndex([], records, idf, seed);
    expect(fallback).toBe(selectRecordIndex(seed, records.length));
  });

  it("falls back to uniform when no signature has positive idf weight", () => {
    const records = [recRich, recPoor];
    const seed = 55;
    // "common" has idf weight 0, "unknown" is not in the map (defaults to 0).
    const fallback = selectReplayRecordIndex(["common", "unknown"], records, idf, seed);
    expect(fallback).toBe(selectRecordIndex(seed, records.length));
  });

  it("respects shortlistSize=1 by always returning the single best-scoring record", () => {
    const records = [recPoor, recPoor, recRich, recPoor]; // recRich at index 2
    for (let seed = 0; seed < 20; seed += 1) {
      const chosen = selectReplayRecordIndex(["alpha"], records, idf, seed, 1);
      expect(chosen).toBe(2); // always recRich regardless of seed
    }
  });

  it("tie-breaks by original index ascending when scores are equal", () => {
    // Both records have identical packs so their scores are equal.
    const rec0 = makeRec("tie-0", [["alpha"]]);
    const rec1 = makeRec("tie-1", [["alpha"]]);
    // With shortlistSize=1 the first (lower index) record wins.
    const chosen = selectReplayRecordIndex(["alpha"], [rec0, rec1], idf, 0, 1);
    expect(chosen).toBe(0);
  });

  it("returns 0 when there are no records", () => {
    expect(selectReplayRecordIndex(["alpha"], [], idf, 42)).toBe(0);
  });

  it("deduplicates signature card names before scoring", () => {
    const records = [recPoor, recRich];
    // Passing "alpha" three times should score the same as passing it once.
    const deduped = selectReplayRecordIndex(["alpha", "alpha", "alpha"], records, idf, 7, 1);
    const single = selectReplayRecordIndex(["alpha"], records, idf, 7, 1);
    expect(deduped).toBe(single);
  });
});

describe("buildPackSequence", () => {
  it("resolves each pack to numbers, dropping unresolved and deduping per pack", () => {
    const index = new Map<string, number>([
      ["a", 1],
      ["b", 2],
      ["c", 3],
      ["d", 4],
    ]);
    const record: DraftRecord = {
      id: "rec-1",
      draftId: "draft-1",
      sourceFile: "draft-1-records.json",
      mainboard: ["a", "b"],
      packs: [
        ["a", "b", "ghost"], // ghost dropped
        ["c", "c", "d"], // c deduped
        ["a", "d"],
      ],
      picks: [["a"], ["c"], ["d"]],
      packIds: [
        ["a", "b", "ghost"],
        ["c", "c", "d"],
        ["a", "d"],
      ],
      pickIds: [["a"], ["c"], ["d"]],
    };
    const seq = buildPackSequence(record, index);
    // Same number of packs, same order, resolved + deduped per pack.
    expect(seq).toEqual([
      [1, 2],
      [3, 4],
      [1, 4],
    ]);
    expect(seq).toHaveLength(record.packs.length);
  });

  it("preserves pack count even when a pack resolves to nothing", () => {
    const index = new Map<string, number>([["known", 7]]);
    const record: DraftRecord = {
      id: "rec-2",
      draftId: "draft-2",
      sourceFile: "draft-2-records.json",
      mainboard: [],
      packs: [["known"], ["unknown1", "unknown2"], ["known", "unknown1"]],
      picks: [[], [], []],
      packIds: [["known"], ["unknown1", "unknown2"], ["known", "unknown1"]],
      pickIds: [[], [], []],
    };
    const seq = buildPackSequence(record, index);
    expect(seq).toEqual([[7], [], [7]]);
    expect(seq).toHaveLength(3);
  });
});
