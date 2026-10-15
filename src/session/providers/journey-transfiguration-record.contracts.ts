import { describe, expect, it } from "vitest";
import { engineDeckEntry } from "../../battle/integration/engine-battle-init";
import { applyEngineTransfigurations } from "../../engine/transfigurations";
import { BASE_VARIANT } from "../../engine/dsl/types";
import { character, data, definitions, entry } from "../../rules/journey/journey-transfiguration-record.fixtures";
describe("journey record battle bridge", () => {
 it("transports the complete record without an extra legacy form or initial Amplified flag", () => {
  const held = entry(); const dto = engineDeckEntry(held, character, data);
  expect(dto).toEqual({ cardId: character.id, transfigurationApplications: held.transfigurationApplications });
  const variant = typeof dto === "string" ? BASE_VARIANT : { ...BASE_VARIANT, ...dto };
  expect(applyEngineTransfigurations(definitions[0], variant).spark).toBe(12);
 });
 it("preserves exact legacy DTO bytes", () => {
  const { transfigurationApplications: _, ...held } = entry();
  expect(JSON.stringify(engineDeckEntry(held, character, data))).toBe(JSON.stringify({ cardId: character.id, transfigurations: ["Kindled"] }));
 });
});
