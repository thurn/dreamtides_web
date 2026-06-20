import { describe, expect, it } from "vitest";
import { stripUndefinedForRtdb } from "./rtdb-sanitize";

describe("stripUndefinedForRtdb", () => {
  it("drops object keys whose value is undefined", () => {
    expect(stripUndefinedForRtdb({ a: 1, b: undefined, c: "x" })).toEqual({
      a: 1,
      c: "x",
    });
  });

  it("strips undefined recursively through nested objects", () => {
    const input = {
      init: { dreamwellDeck: [{ id: "a", art: undefined }] },
    };
    expect(stripUndefinedForRtdb(input)).toEqual({
      init: { dreamwellDeck: [{ id: "a" }] },
    });
  });

  it("preserves null (RTDB delete sentinel / stored null)", () => {
    expect(stripUndefinedForRtdb({ a: null, b: undefined })).toEqual({
      a: null,
    });
  });

  it("converts undefined array elements to null to keep indices stable", () => {
    expect(stripUndefinedForRtdb([1, undefined, 3])).toEqual([1, null, 3]);
  });

  it("keeps empty arrays as-is (RTDB drops them, read-side normalizers restore)", () => {
    const slots: unknown[] = [];
    expect(stripUndefinedForRtdb({ slots })).toEqual({ slots: [] });
  });

  it("returns the same reference when nothing needs stripping", () => {
    const clean = { a: 1, b: { c: [2, 3] }, d: null };
    expect(stripUndefinedForRtdb(clean)).toBe(clean);
  });

  it("returns a new object only along the changed path", () => {
    const untouched = { keep: true };
    const input = { untouched, dirty: { drop: undefined, keep: 1 } };
    const result = stripUndefinedForRtdb(input);
    expect(result).not.toBe(input);
    // Unchanged subtrees are shared, not needlessly cloned.
    expect(result.untouched).toBe(untouched);
    expect(result.dirty).toEqual({ keep: 1 });
  });

  it("passes primitives through unchanged", () => {
    expect(stripUndefinedForRtdb(5)).toBe(5);
    expect(stripUndefinedForRtdb("x")).toBe("x");
    expect(stripUndefinedForRtdb(null)).toBe(null);
    expect(stripUndefinedForRtdb(undefined)).toBe(undefined);
  });
});
