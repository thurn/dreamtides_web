// Unit tests for historical draft-record helpers. Hand-built id indexes and a
// synthetic record stand in for the bundled assets.

import { describe, expect, it } from "vitest";

import type { DraftRecord } from "../data/cards-v2-database.ts";
import {
  buildPackSequence,
} from "./draft-records.ts";


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
      mainboardIds: ["a", "b"],
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
      mainboardIds: [],
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
