import { describe, expect, it } from "vitest";
import { beadEntities } from "./bead-entities";

const sampled = "00000000-0000-0000-0000-000000000118";
const unsampled = "00000000-0000-0000-0000-00000000005c";
const inventory = {
  entities: [sampled, unsampled].map((id, index) => ({
    id,
    kind: index === 0 ? "card" : "figment",
    name: "Shared synthetic name",
    module: `synthetic/entity-${String(index)}.ts`,
    text: `Synthetic text ${String(index)}`,
    ...(index === 0 ? { amplifiedText: "Synthetic amplified text" } : {}),
    requiredPrimitives: { existing: ["syntheticExisting"], new: ["syntheticNew"] },
    promptKinds: ["syntheticPrompt"],
  })),
};

describe("bead entity brief", () => {
  it("prints UUID-specific inventory facts and the exact D21 boundary", () => {
    const rows = beadEntities([`${sampled.toUpperCase()},${unsampled}`], inventory);
    expect(rows).toEqual(inventory.entities.map((entity, index) => ({
      uuid: entity.id,
      kind: entity.kind,
      name: entity.name,
      module: entity.module,
      text: entity.text,
      amplifiedText: entity.amplifiedText ?? null,
      requiredPrimitives: entity.requiredPrimitives,
      promptKinds: entity.promptKinds,
      d21: { firstByte: index === 0 ? 25 : 26, sampled: index === 0 },
    })));
  });

  it("rejects unknown UUIDs instead of producing an incomplete brief", () => {
    const missing = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    expect(() => beadEntities([sampled, missing], inventory)).toThrow(missing);
  });

  it("requires UUIDs and preserves absent optional catalog fields", () => {
    expect(() => beadEntities([], inventory)).toThrow();
    expect(() => beadEntities(["malformed"], inventory)).toThrow();
    const [{ module: _module, text: _text, amplifiedText: _amplifiedText, ...minimal }] = inventory.entities;
    expect(beadEntities([sampled], { entities: [minimal] })[0]).toMatchObject({
      module: null, text: null, amplifiedText: null,
    });
  });
});
