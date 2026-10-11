import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { boardState } from "../../../testing/board";
import { engine, v, deck } from "./characters-support";

describe("character primitives", () => {
  it("dissolve uses the target chosen at play time", () => {
    const { state, ids, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.dissolveEnemy.id], energy: 2, deck }, enemy: { back: [v.vanilla2.id, v.vanilla3.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[ids.enemy.back[1]!]],
    });
    expect(state.instances[ids.enemy.back[1]!]?.zone).toBe("void");
    expect(state.instances[ids.enemy.back[0]!]?.zone).toBe("play");
    expect(answers[0]).toMatchObject({ value: [ids.enemy.back[1]] });
  });

  it("makes a targeted play illegal without a legal target", () => {
    const { state } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.banishEnemyWithSparkAtMostTwo.id], energy: 1, deck },
      enemy: { back: [v.vanilla3.id], deck },
    });
    expect(engine.legalActions(state, "player").some((action) => action.kind === "play")).toBe(false);
  });
});
