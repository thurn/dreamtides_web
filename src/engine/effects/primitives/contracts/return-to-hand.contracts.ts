import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, v, deck } from "./characters-support";

describe("character primitives", () => {
  it("returnToHand returns the target to its owner's hand", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.returnAnyToHand.id], energy: 1, back: [v.vanilla2.id], deck }, enemy: { back: [v.vanilla3.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[ids.enemy.back[0]!]],
    });
    expect(state.sides.enemy.hand).toEqual([ids.enemy.back[0]]);
  });
});
