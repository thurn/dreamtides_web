import { describe, expect, it } from "vitest";
import { hashState } from "./hash";

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
});
