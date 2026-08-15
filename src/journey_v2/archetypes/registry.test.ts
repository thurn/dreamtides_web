import { describe, expect, it } from "vitest";
import { AUGURY_TUNING } from "../tuning";
import { AUGURY_ARCHETYPE_BUILDERS } from "./registry";
import { AUGURY_ARCHETYPE_FAMILIES } from "./types";

describe("augury archetype registry", () => {
  it("registers every TOML-configurable Augury offer type", () => {
    const ids = AUGURY_ARCHETYPE_BUILDERS.map((builder) => builder.archetypeId);
    expect(ids.sort()).toEqual(Object.keys(AUGURY_ARCHETYPE_FAMILIES).sort());
  });

  it("registers each archetype id at most once", () => {
    const ids = AUGURY_ARCHETYPE_BUILDERS.map((builder) => builder.archetypeId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives every registered builder a tuning weight", () => {
    for (const builder of AUGURY_ARCHETYPE_BUILDERS) {
      expect(AUGURY_TUNING.weights[builder.archetypeId]).toBeTypeOf("number");
      expect(AUGURY_TUNING.weights[builder.archetypeId]).toBeGreaterThan(0);
    }
  });

  it("matches each builder's declared family to the family table", () => {
    for (const builder of AUGURY_ARCHETYPE_BUILDERS) {
      expect(builder.family).toBe(
        AUGURY_ARCHETYPE_FAMILIES[builder.archetypeId],
      );
    }
  });

  it("keeps the weight table and the family table in sync", () => {
    // Cross-check two independently-maintained tables: every weighted archetype
    // has a family, and every family-tabled archetype has a weight.
    const weightIds = Object.keys(AUGURY_TUNING.weights).sort();
    const familyIds = Object.keys(AUGURY_ARCHETYPE_FAMILIES).sort();
    expect(weightIds).toEqual(familyIds);
  });
});
