import { describe, expect, it } from "vitest";
import { MERCHANT_TUNING } from "../tuning";
import { MERCHANT_ARCHETYPE_BUILDERS } from "./registry";
import { MERCHANT_ARCHETYPE_FAMILIES } from "./types";

describe("merchant archetype registry", () => {
  it("registers each archetype id at most once", () => {
    const ids = MERCHANT_ARCHETYPE_BUILDERS.map((builder) => builder.archetypeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every registered builder a tuning weight", () => {
    for (const builder of MERCHANT_ARCHETYPE_BUILDERS) {
      expect(MERCHANT_TUNING.weights[builder.archetypeId]).toBeTypeOf("number");
      expect(MERCHANT_TUNING.weights[builder.archetypeId]).toBeGreaterThan(0);
    }
  });

  it("matches each builder's declared family to the family table", () => {
    for (const builder of MERCHANT_ARCHETYPE_BUILDERS) {
      expect(builder.family).toBe(
        MERCHANT_ARCHETYPE_FAMILIES[builder.archetypeId],
      );
    }
  });

  it("keeps the weight table and the family table in sync", () => {
    // Cross-check two independently-maintained tables: every weighted archetype
    // has a family, and every family-tabled archetype has a weight.
    const weightIds = Object.keys(MERCHANT_TUNING.weights).sort();
    const familyIds = Object.keys(MERCHANT_ARCHETYPE_FAMILIES).sort();
    expect(weightIds).toEqual(familyIds);
  });
});
