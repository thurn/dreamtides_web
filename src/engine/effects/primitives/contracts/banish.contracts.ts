import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { engine, v, deck } from "./characters-support";

describe("character primitives", () => {
  it("banish removes the target to its owner's Banished zone", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.banishEnemyWithSparkAtMostTwo.id], energy: 1, deck }, enemy: { back: [v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.banished).toEqual([ids.enemy.back[0]]);
  });
});
