import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, deck } from "./flow-support";

describe("flow primitives", () => {
  it("optional asks and does nothing when declined", () => {
    const declined = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.mayDrawTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [false],
    });
    expect(declined.state.sides.player.hand).toEqual([]);
    const accepted = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.mayDrawTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [true],
    });
    expect(accepted.state.sides.player.hand).toHaveLength(2);
  });
});
