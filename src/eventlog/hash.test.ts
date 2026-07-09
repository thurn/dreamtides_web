import { describe, expect, it } from "vitest";
import { assertJsonSafe, hashState } from "./hash";

describe("hashState", () => {
  it("is insensitive to top-level key order", () => {
    expect(hashState({ a: 1, b: 2 })).toBe(hashState({ b: 2, a: 1 }));
  });

  it("is insensitive to nested key order at every depth", () => {
    const left = { outer: { a: 1, b: { x: 1, y: 2 } }, z: 3 };
    const right = { z: 3, outer: { b: { y: 2, x: 1 }, a: 1 } };
    expect(hashState(left)).toBe(hashState(right));
  });

  it("changes when a deeply nested field changes", () => {
    const base = { a: { b: { c: { d: 1 } } } };
    const changed = { a: { b: { c: { d: 2 } } } };
    expect(hashState(base)).not.toBe(hashState(changed));
  });

  it("changes when array order changes (intentional: reordering an array is a different state, do not sort arrays)", () => {
    const left = { items: [1, 2, 3] };
    const right = { items: [3, 2, 1] };
    expect(hashState(left)).not.toBe(hashState(right));
  });

  it("treats arrays and their sorted-key-order object counterparts distinctly from other structures", () => {
    // Arrays are never sorted -- only object keys are. Confirm array identity
    // survives even when nested objects inside get key-reordered.
    const left = { items: [{ a: 1, b: 2 }, { a: 3, b: 4 }] };
    const right = { items: [{ b: 2, a: 1 }, { b: 4, a: 3 }] };
    expect(hashState(left)).toBe(hashState(right));
  });

  it("does not collide distinct structures via ambiguous stringification", () => {
    // { a: "1,2" } vs { a: ["1", "2"] } must not hash equal even though a
    // naive join-based stringify could conflate them.
    const stringValue = hashState({ a: "1,2" });
    const arrayValue = hashState({ a: ["1", "2"] });
    expect(stringValue).not.toBe(arrayValue);
  });

  it("distinguishes primitive types with similar string forms", () => {
    expect(hashState({ a: 1 })).not.toBe(hashState({ a: "1" }));
    expect(hashState({ a: true })).not.toBe(hashState({ a: "true" }));
    expect(hashState({ a: null })).not.toBe(hashState({ a: "null" }));
  });

  it("produces a hex digest string", () => {
    const digest = hashState({ a: 1 });
    expect(digest).toMatch(/^[0-9a-f]+$/);
  });

  it("is deterministic across repeated calls", () => {
    const value = { a: 1, b: [1, 2, { c: 3 }] };
    expect(hashState(value)).toBe(hashState(value));
  });

  it("hash equals hash after a JSON encode/decode round-trip for a state with an undefined-valued key", () => {
    // `JSON.stringify` drops the `b: undefined` entry; the canonical hash mirrors
    // that, so the live state and its decoded snapshot hash identically. This is
    // the invariant that prevents a false fold_divergence after compaction.
    const live = { a: 1, b: undefined, c: 3 };
    const roundTripped = JSON.parse(JSON.stringify(live)) as Record<string, unknown>;
    expect(hashState(live)).toBe(hashState(roundTripped));
    // And it collapses to the same hash as the object without the key at all.
    expect(hashState(live)).toBe(hashState({ a: 1, c: 3 }));
  });

  it("emits null for an undefined/function array slot, matching JSON.stringify", () => {
    const withUndefined = { items: [1, undefined, 3] };
    const withNull = { items: [1, null, 3] };
    expect(hashState(withUndefined)).toBe(hashState(withNull));
  });

  it("does not canonicalize non-plain object containers as empty records", () => {
    expect(() => hashState({ cache: new Map([["x", 1]]) })).toThrow(
      /non-plain object/,
    );
  });
});

describe("assertJsonSafe", () => {
  it("passes a fully JSON-safe value", () => {
    expect(() =>
      assertJsonSafe({ a: 1, b: [true, "x", null, { c: 2 }] }, "state"),
    ).not.toThrow();
  });

  it("names the dotted path of an undefined value", () => {
    expect(() => assertJsonSafe({ a: { b: undefined } }, "state")).toThrow(
      /state\.a\.b holds undefined/,
    );
  });

  it("names the path of a NaN and an Infinity", () => {
    expect(() => assertJsonSafe({ score: NaN }, "state")).toThrow(
      /state\.score holds NaN/,
    );
    expect(() => assertJsonSafe({ n: Infinity }, "state")).toThrow(
      /state\.n holds a non-finite number/,
    );
  });

  it("names the index of an offending array element and rejects functions", () => {
    expect(() => assertJsonSafe({ xs: [1, () => 0] }, "state")).toThrow(
      /state\.xs\[1\] holds a function/,
    );
  });

  it("rejects non-plain object containers before they can survive as empty JSON", () => {
    expect(() => assertJsonSafe({ cache: new Map([["x", 1]]) }, "state")).toThrow(
      /state\.cache holds a non-plain object/,
    );
    expect(() => assertJsonSafe({ date: new Date(0) }, "state")).toThrow(
      /state\.date holds a non-plain object/,
    );
  });
});
