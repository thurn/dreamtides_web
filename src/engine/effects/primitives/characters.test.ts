/**
 * Character primitives: dissolve, banish, returnToHand, gainSpark, awaken,
 * exhaust; targets and keywords, including "cannot be targeted by effects"
 * (C17).
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../../engine";
import { DSL, DSL_CARDS } from "../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../testing/scenario";
import { SYNTHETIC, testCatalog } from "../../testing/synthetic-cards";
import { boardState } from "../../testing/board";
import { NO_PROMPTS as NO, ScriptedSource } from "../../steps/sources";
import { IllegalAnswer } from "../../steps/errors";
import type { AnswerSource } from "../../steps/types";
import type { ChooseTargetsPrompt } from "../../prompts/types";
import { effectiveSpark } from "../../rules/spark";
import { hasKeyword } from "../../rules/keywords";
import { STACK } from "../../testing/stack-cards";
import { at, passUntil } from "../../testing/trigger-harness";

const engine = createEngine(testCatalog([...DSL_CARDS, STACK.preventCharacterToDeck]));
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

/** A source that answers each target prompt with its first candidate and records the prompts it was asked. */
function firstCandidate(): { readonly asked: ChooseTargetsPrompt[]; readonly source: AnswerSource } {
  const asked: ChooseTargetsPrompt[] = [];
  return {
    asked,
    source: {
      answer(prompt) {
        if (prompt.kind !== "chooseTargets") throw new Error(`Unexpected ${prompt.kind} prompt`);
        asked.push(prompt);
        return prompt.candidates.slice(0, prompt.min);
      },
    },
  };
}

describe("cannot be targeted by effects (C17)", () => {
  const shielded = DSL.untargetableCharacter.id;

  it("is never offered by a targeted prompt, whoever controls the effect", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.returnAnyToHand.id], energy: 1, back: [shielded, v.vanilla2.id], deck },
      enemy: { back: [shielded, v.vanilla3.id], deck },
    });
    const { asked, source } = firstCandidate();
    const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, source);
    expect(asked.map((prompt) => prompt.candidates)).toEqual([[ids.player.back[1], ids.enemy.back[1]]]);
    expect(result.state.sides.player.hand).toEqual([ids.player.back[1]]);
  });

  it("makes a play illegal when its only targets cannot be targeted, for either controller's characters", () => {
    const { state } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.dissolveEnemy.id, DSL.pumpUntilEndOfTurn.id], energy: 2, back: [shielded], deck },
      enemy: { back: [shielded], deck },
    });
    expect(engine.legalActions(state, "player").some((action) => action.kind === "play")).toBe(false);
  });

  it("rejects an answer naming a character that cannot be targeted", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.dissolveEnemy.id], energy: 2, deck },
      enemy: { back: [shielded, v.vanilla2.id, v.vanilla3.id], deck },
    });
    const play = () => engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([[ids.enemy.back[0]!]]));
    expect(play).toThrow(IllegalAnswer);
  });

  it("is never offered as a stack target while on the stack", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [shielded], energy: 1, deck },
      enemy: { hand: [STACK.preventCharacterToDeck.id], energy: 1, deck },
    });
    // The enemy's only response has no legal target, so the enemy passes and the character resolves.
    const result = engine.apply(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, NO);
    expect(result.state.sides.player.backRank[0]).toBe(ids.player.hand[0]);
    expect(result.state.sides.enemy.hand).toEqual(ids.enemy.hand);
  });

  it("is still affected by effects that do not target", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.exhaustEnemies.id], energy: 1, deck }, enemy: { back: [shielded], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.instances[ids.enemy.back[0]!]?.status.exhausted).toBe(true);
  });

  it("granted in response, makes the chosen target illegal as the effect resolves, until the grant ends", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.dissolveEnemy.id], energy: 2, deck },
      enemy: { hand: [DSL.shieldAlly.id], energy: 1, back: [v.vanilla2.id], deck },
    });
    const ally = ids.enemy.back[0]!;
    const dissolve = ids.player.hand[0];
    const played = engine.apply(state, "player", { kind: "play", card: dissolve, from: "hand" }, NO).state;
    const responded = engine.apply(played, "enemy", { kind: "play", card: ids.enemy.hand[0], from: "hand" }, NO);
    const resolved = passUntil(engine, responded.state, (next) => next.stack.length === 0);
    expect([...responded.events, ...resolved.events]).toContainEqual({ kind: "noLegalTarget", source: dissolve });
    expect(resolved.state.instances[ally]?.zone).toBe("play");
    expect(hasKeyword(resolved.state, engine.catalog, ally, "cannotBeTargeted")).toBe(true);
    const nextTurn = passUntil(engine, resolved.state, at(engine, "enemy", "day")).state;
    expect(hasKeyword(nextTurn, engine.catalog, ally, "cannotBeTargeted")).toBe(false);
  });
});
