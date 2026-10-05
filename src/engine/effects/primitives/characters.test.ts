/** Character primitives: dissolve, banish, returnToHand, gainSpark, awaken, exhaust; targets and keywords. */
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine";
import { DSL, DSL_CARDS } from "../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../testing/scenario";
import { SYNTHETIC, testCatalog } from "../../testing/synthetic-cards";
import { boardState } from "../../testing/board";
import { NO_PROMPTS as NO } from "../../steps/sources";
import { effectiveSpark } from "../../rules/spark";

const engine = createEngine(testCatalog(DSL_CARDS));
const v = SYNTHETIC;
const deck = Array.from({ length: 5 }, () => v.vanilla1.id);

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

  it("makes a targeted play illegal without a legal target", () => {
    const { state } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.banishEnemyWithSparkAtMostTwo.id], energy: 1, deck },
      enemy: { back: [v.vanilla3.id], deck },
    });
    expect(engine.legalActions(state, "player").some((action) => action.kind === "play")).toBe(false);
  });

  it("banish removes the target to its owner's Banished zone", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.banishEnemyWithSparkAtMostTwo.id], energy: 1, deck }, enemy: { back: [v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.banished).toEqual([ids.enemy.back[0]]);
  });

  it("returnToHand returns the target to its owner's hand", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.returnAnyToHand.id], energy: 1, back: [v.vanilla2.id], deck }, enemy: { back: [v.vanilla3.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[ids.enemy.back[0]!]],
    });
    expect(state.sides.enemy.hand).toEqual([ids.enemy.back[0]]);
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
