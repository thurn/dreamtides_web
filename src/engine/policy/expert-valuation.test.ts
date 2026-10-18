/**
 * Contracts of the Expert action valuation: actions are classified from
 * their cards' AST features, valued against passing, and responses are
 * used, held or passed by their gain.
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import type { Prompt } from "../prompts/types";
import type { Action } from "../rules/actions";
import { opponent, SIDES, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { boardState } from "../testing/board";
import { STACK } from "../testing/stack-cards";
import { InlineSource } from "../steps/sources";
import { SYNTHETIC, testCatalog } from "../testing/synthetic-cards";
import { expertContext } from "./expert-contracts";
import { chooseResponse, classify, paysUnless, rankActions, type ExpertWeights } from "./expert-valuation";
import { deck, entries } from "./policy.fixtures";
import { greedyAnswer, stateCardInfo, stateDiscoverCosts, stateSubtypeCounts } from "./prompts";

const engine = createEngine(testCatalog([STACK.preventEvent]));
const { vanilla0, vanilla3, event0, dissolveVictim } = SYNTHETIC;

const WEIGHTS: ExpertWeights = { duskBudget: 64, passLimit: 64, loopIterationLimit: 4, sequencingTolerance: 0, interruptHoldMargin: 0, cheapUnlessCost: 1 };

const context = (side: Side) => expertContext(engine, side, { player: entries(deck), enemy: entries(deck) });

const answer = (prompt: Prompt, work: BattleState) =>
  greedyAnswer(prompt, stateCardInfo(work, engine.catalog, prompt.side), stateDiscoverCosts(work, engine.catalog), work.automaticChoices, stateSubtypeCounts(work, engine.catalog));
const source = () => new InlineSource({ player: answer, enemy: answer });

function play(state: BattleState, side: Side, card: string): Action {
  const action = engine.legalActions(state, side).find((entry) => entry.kind === "play" && entry.card === card);
  if (action === undefined) throw new Error(`${card} is not playable`);
  return action;
}

describe("the Expert action valuation", () => {
  it("classifies actions by their cards' AST features", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player", phase: "day",
      player: { deck, hand: [dissolveVictim.id, vanilla0.id, event0.id], front: [vanilla3.id], energy: 3 },
      enemy: { deck, front: [vanilla3.id] },
    });
    const ctx = context("player");
    const [removal, character, spell] = ids.player.hand;
    expect(classify(state, ctx, play(state, "player", removal ?? ""))).toBe("removal");
    expect(classify(state, ctx, play(state, "player", character ?? ""))).toBe("deployment");
    expect(classify(state, ctx, play(state, "player", spell ?? ""))).toBe("spell");
    expect(classify(state, ctx, { kind: "pass" })).toBe("pass");
    const reposition = engine.legalActions(state, "player").find((action) => action.kind === "reposition");
    expect(reposition === undefined ? null : classify(state, ctx, reposition)).toBe("reposition");
  });

  for (const side of SIDES) {
    it(`values deploying a character above passing, best first, for ${side}`, () => {
      const { state } = boardState(engine.catalog, { active: side, phase: "day", [side]: { deck, hand: [vanilla3.id], energy: 3 }, [opponent(side)]: { deck } });
      const ranking = rankActions([state], engine.legalActions(state, side), context(side), WEIGHTS);
      expect(ranking.map((entry) => entry.score)).toEqual([...ranking.map((entry) => entry.score)].sort((a, b) => b - a));
      expect(ranking.find((entry) => entry.action.kind === "pass")?.gain).toBe(0);
      expect(ranking[0]?.class).toBe("deployment");
      expect(ranking[0]?.gain).toBeGreaterThan(0);
    });

    it(`prevents an opposing removal event unless the hold margin keeps the Interrupt, for ${side}`, () => {
      const attacker = opponent(side);
      const { state, ids } = boardState(engine.catalog, {
        active: attacker, phase: "day",
        [attacker]: { deck, hand: [dissolveVictim.id], energy: 1 },
        [side]: { deck, hand: [STACK.preventEvent.id], front: [vanilla3.id], energy: 1 },
      });
      const removal = ids[attacker].hand[0] ?? "";
      const responding = engine.apply(state, attacker, play(state, attacker, removal), source()).state;
      expect(engine.decision(responding)).toEqual({ kind: "respond", side });
      const legal = engine.legalActions(responding, side);
      const used = chooseResponse([responding], legal, context(side), WEIGHTS);
      expect(used.reason).toBe("use");
      expect(used.action.kind).toBe("play");
      expect(classify(responding, context(side), used.action)).toBe("prevent");
      const held = chooseResponse([responding], legal, context(side), { ...WEIGHTS, interruptHoldMargin: Number.POSITIVE_INFINITY });
      expect(held).toMatchObject({ reason: "hold", action: { kind: "pass" } });
    });
  }

  it("pays a cheap affordable unless cost only", () => {
    expect(paysUnless(1, 2, WEIGHTS)).toBe(true);
    expect(paysUnless(1, 0, WEIGHTS)).toBe(false);
    expect(paysUnless(2, 5, WEIGHTS)).toBe(false);
  });
});
