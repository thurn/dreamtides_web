import { describe, expect, it } from "vitest";
import { revealEntityId } from "./identity";

describe("revealEntityId", () => {
  it("preserves UUIDs and deterministically derives RFC 4122 UUIDs", () => {
    const uuid = "12345678-1234-4abc-8def-1234567890ab";
    expect(revealEntityId("tide", uuid)).toBe(uuid);
    expect(revealEntityId("tide", "stable-id")).toBe(revealEntityId("tide", "stable-id"));
    expect(revealEntityId("tide", "stable-id")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("keeps exact case-sensitive namespace and stable-id material distinct", () => {
    expect(revealEntityId("tide", "Tide-A")).not.toBe(revealEntityId("tide", "tide-a"));
    expect(revealEntityId("Tide", "tide-a")).not.toBe(revealEntityId("tide", "tide-a"));
  });

  it("has no collisions across a representative compatibility-id sample", () => {
    const ids = Array.from({ length: 2_000 }, (_, index) => revealEntityId(`family-${String(index % 11)}`, `entity-${String(index)}`));
    expect(new Set(ids).size).toBe(ids.length);
  });
});
