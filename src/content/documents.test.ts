import { describe, expect, it } from "vitest";
import { canonicalJson, contentHashes } from "./documents";

describe("content document hashes", () => {
  it("ignores object key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, 3], c: null } })).toBe(
      canonicalJson({ a: { c: null, d: [2, 3] }, b: 1 }),
    );
    expect(contentHashes({ b: 1, a: 2 })).toEqual(
      contentHashes({ a: 2, b: 1 }),
    );
  });

  it("changes when any value changes", () => {
    expect(contentHashes({ a: [1, 2] }).contentHash).not.toBe(
      contentHashes({ a: [2, 1] }).contentHash,
    );
  });

  it("produces SHA-256 hex digests", () => {
    expect(contentHashes({ a: 1 }).contentHash).toMatch(/^[0-9a-f]{64}$/u);
  });
});
