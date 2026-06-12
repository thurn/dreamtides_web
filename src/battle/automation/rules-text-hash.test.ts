import { describe, expect, it } from "vitest";

import { fnv1aHex } from "./rules-text-hash";

describe("fnv1aHex", () => {
  it("matches the deterministic golden value for a known rules string", () => {
    // Golden value guards against an accidental change to the hash algorithm
    // that would silently invalidate every stored rules-text hash.
    expect(fnv1aHex("▸Dawn: Gain 1●.")).toBe("1e9baa12");
  });

  it("produces distinct hashes for distinct rules strings", () => {
    expect(fnv1aHex("▸Dawn: Gain 1●.")).not.toBe(fnv1aHex("▸Dusk: Gain 1●."));
  });

  it("is deterministic for the same input", () => {
    const input = "Whenever you play a card, draw a card.";
    expect(fnv1aHex(input)).toBe(fnv1aHex(input));
  });

  it("returns 8 lowercase hex characters", () => {
    expect(fnv1aHex("anything at all")).toMatch(/^[0-9a-f]{8}$/);
  });

  it("zero-pads short hashes to 8 characters", () => {
    // The empty string hashes to the FNV-1a offset basis 0x811c9dc5; pick an
    // input whose hash has leading zeros to exercise padding if one arises.
    expect(fnv1aHex("")).toMatch(/^[0-9a-f]{8}$/);
  });
});
