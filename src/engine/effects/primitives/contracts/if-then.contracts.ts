import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, v, deck } from "./flow-support";

describe("flow primitives", () => {
  it("ifThen checks its condition when it resolves", () => {
    const met = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawIfTwoWarriors.id], back: [v.vanilla1.id, v.vanilla2.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(met.state.sides.player.hand).toHaveLength(1);
    const unmet = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawIfTwoWarriors.id], back: [v.vanilla1.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(unmet.state.sides.player).toMatchObject({ hand: [], currentEnergy: 1 });
  });
});
