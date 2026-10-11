import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { NO_PROMPTS as NO } from "../../../steps/sources";
import { effectiveSpark } from "../../../rules/spark";
import { engine, v, deck } from "./characters-support";

describe("character primitives", () => {
  it("a variable-spark character enters play with the X paid for it and loses it when it leaves play", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.variableSpark.id, DSL.returnAnyToHand.id], energy: 4, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: () => [3],
    });
    const trooper = ids.player.hand[0];
    expect(state.sides.player.backRank[0]).toBe(trooper);
    expect(effectiveSpark(state, engine.catalog, trooper)).toBe(3);
    // Returned to hand (the only character is the forced target), it has 0 spark again.
    const bounced = engine.apply(state, "player", { kind: "play", card: ids.player.hand[1], from: "hand" }, NO).state;
    expect(bounced.sides.player.hand).toContain(trooper);
    expect(bounced.instances[trooper]?.status.x).toBeNull();
    expect(effectiveSpark(bounced, engine.catalog, trooper)).toBe(0);
  });

  it("gainSpark until end of turn expires during Ending; permanent spark stays", () => {
    const temporary = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.pumpUntilEndOfTurn.id], back: [v.vanilla2.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    const pumped = temporary.ids.player.back[0]!;
    expect(effectiveSpark(temporary.state, engine.catalog, pumped)).toBe(5);
    const ended = engine.apply(engine.apply(engine.apply(temporary.state, "player", { kind: "pass" }, NO).state, "enemy", { kind: "pass" }, NO).state, "player", { kind: "pass" }, NO).state;
    expect(effectiveSpark(ended, engine.catalog, pumped)).toBe(2);
    expect(ended.floating).toEqual([]);
    const permanent = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.pumpPermanently.id], energy: 1, back: [v.vanilla2.id, v.vanilla3.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[ids.player.back[1]!]],
    });
    expect(permanent.state.instances[permanent.ids.player.back[1]!]?.status.gainedSpark).toBe(1);
  });
});
