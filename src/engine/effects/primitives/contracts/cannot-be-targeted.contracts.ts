import { describe, expect, it } from "vitest";
import { DSL } from "../../../testing/dsl-cards";
import { playFromHand, runScenario } from "../../../testing/scenario";
import { boardState } from "../../../testing/board";
import { NO_PROMPTS as NO, ScriptedSource } from "../../../steps/sources";
import { IllegalAnswer } from "../../../steps/errors";
import type { AnswerSource } from "../../../steps/types";
import type { ChooseTargetsPrompt } from "../../../prompts/types";
import { hasKeyword } from "../../../rules/keywords";
import { STACK } from "../../../testing/stack-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { engine, v, deck } from "./characters-support";

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
