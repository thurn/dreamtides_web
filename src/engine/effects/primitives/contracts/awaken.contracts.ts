import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { boardState } from "../../../testing/board";
import { NO_PROMPTS as NO } from "../../../steps/sources";
import { engine, v, deck } from "./characters-support";

describe("character primitives", () => {
  it("awaken and exhaust apply to every matching character", () => {
    const exhausted = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.exhaustEnemies.id], energy: 1, deck }, enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(exhausted.ids.enemy.back.every((id) => id !== null && exhausted.state.instances[id]?.status.exhausted)).toBe(true);
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.awakenAll.id], back: [v.vanilla1.id], deck },
      enemy: { deck },
    });
    start.instances[ids.player.back[0]!].status.exhausted = true;
    const awake = engine.apply(start, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO).state;
    expect(awake.instances[ids.player.back[0]!]?.status.exhausted).toBe(false);
  });

  it("treats one target spec used twice as one target", () => {
    const { answers, state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.exhaustAndPumpSame.id], energy: 1, deck }, enemy: { back: [v.vanilla1.id, v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[ids.enemy.back[1]!]],
    });
    expect(answers).toHaveLength(1);
    expect(state.instances[ids.enemy.back[1]!]?.status).toMatchObject({ exhausted: true, gainedSpark: 1 });
  });

  it("reads Awakened from a keyword ability", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.awakenedCharacter.id], energy: 2, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.instances[ids.player.hand[0]]?.status.exhausted).toBe(false);
  });
});
