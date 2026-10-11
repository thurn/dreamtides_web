import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, v, deck } from "./cards-support";

describe("card primitives", () => {
  it("erode moves the top cards to the void and causes Fatigue from an empty deck", () => {
    const { state } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.erodeThree.id], deck }, enemy: { deck: [v.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.void).toHaveLength(1);
    expect(state.sides.enemy.fatigueCount).toBe(2);
    expect(state.sides.player.score).toBe(1 + 2);
  });
});
