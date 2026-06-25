import { describe, expect, it } from "vitest";
import { pruneLogEntries, type RoomLogEntries } from "./room-log-service";

function makeEntries(count: number): RoomLogEntries {
  const entries: RoomLogEntries = {};
  for (let index = 0; index < count; index += 1) {
    // Mimic push-key ordering: zero-padded so lexicographic === chronological.
    const key = `-key${String(index).padStart(5, "0")}`;
    entries[key] = JSON.stringify({ seq: index });
  }
  return entries;
}

describe("pruneLogEntries", () => {
  it("keeps only the newest `limit` entries by key order", () => {
    const pruned = pruneLogEntries(makeEntries(10), 3);
    const keys = Object.keys(pruned).sort();
    expect(keys).toEqual(["-key00007", "-key00008", "-key00009"]);
  });

  it("returns the entries unchanged when within the limit", () => {
    const entries = makeEntries(3);
    expect(pruneLogEntries(entries, 5)).toEqual(entries);
  });

  it("handles an empty node", () => {
    expect(pruneLogEntries({}, 100)).toEqual({});
  });

  it("preserves each entry's stored value", () => {
    const pruned = pruneLogEntries(makeEntries(5), 2);
    expect(pruned["-key00004"]).toBe(JSON.stringify({ seq: 4 }));
  });
});
