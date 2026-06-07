// Unit tests for the record-replay helpers. Hand-built name indexes and a
// synthetic record stand in for the bundled assets.

import { describe, expect, it } from "vitest";

import type { DraftRecord } from "../../data/cards-v2-database.ts";
import {
  buildPackSequence,
  resolveCardNames,
  selectRecordIndex,
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
      mainboard: ["a", "b"],
      packs: [
        ["a", "b", "ghost"], // ghost dropped
        ["c", "c", "d"], // c deduped
        ["a", "d"],
      ],
      picks: [["a"], ["c"], ["d"]],
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
      mainboard: [],
      packs: [["known"], ["unknown1", "unknown2"], ["known", "unknown1"]],
      picks: [[], [], []],
    };
    const seq = buildPackSequence(record, index);
    expect(seq).toEqual([[7], [], [7]]);
    expect(seq).toHaveLength(3);
  });
});
