import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, v, deck } from "./cards-support";

describe("card primitives", () => {
  it("random discard draws from its own random stream without a prompt", () => {
    const { state, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.opponentDiscardsRandom.id], energy: 1, deck }, enemy: { hand: [v.vanilla1.id, v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.hand).toHaveLength(1);
    expect(state.rng["random:discard"]).toBe(1);
    expect(answers).toEqual([]);
  });
});
