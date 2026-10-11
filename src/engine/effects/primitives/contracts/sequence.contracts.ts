import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, deck } from "./flow-support";

describe("flow primitives", () => {
  it("sequence runs its effects in order", () => {
    const { events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawThenEnergy.id], energy: 1, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    const kinds = events.map((event) => event.kind);
    expect(kinds.indexOf("cardDrawn")).toBeLessThan(kinds.lastIndexOf("energyChanged"));
  });
});
