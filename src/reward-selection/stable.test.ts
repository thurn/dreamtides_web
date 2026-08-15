import { describe, expect, it } from "vitest";
import {
  isStableDigest,
  parseStableDigest,
  stableDigest,
} from "./stable";

describe("stable digests", () => {
  it("brands canonical lowercase SHA-256 values", () => {
    const digest = stableDigest({ b: 2, a: 1 });

    expect(isStableDigest(digest)).toBe(true);
    expect(parseStableDigest(digest)).toBe(digest);
    expect(digest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it.each([
    "",
    "not-a-digest",
    "A".repeat(64),
    "0".repeat(63),
    "0".repeat(65),
  ])("rejects noncanonical serialized values: %s", (value) => {
    expect(isStableDigest(value)).toBe(false);
    expect(() => parseStableDigest(value)).toThrow(
      "stable digest must be a lowercase SHA-256 digest",
    );
  });
});
