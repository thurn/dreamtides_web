/**
 * Contracts of the Expert Day sequencing, for either side: character plays
 * are weighed at every open back-rank slot, removal comes before deployment
 * among near-equal choices, and challengers are chosen against the blocks
 * the defender's Dusk assignment would make.
 */
import { describe, expect, it } from "vitest";
import type { Action } from "../rules/actions";
import { opponent, SIDES, type Side } from "../state/ids";
import { boardState } from "../testing/board";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { expertContext } from "./expert-contracts";
import { chooseDayAction, withPlacements } from "./expert-day";
import type { ExpertWeights } from "./expert-valuation";
import { deck, engine, entries } from "./policy.fixtures";

const { vanilla0, vanilla3, vanilla5, event0, dissolveVictim } = SYNTHETIC;
const WEIGHTS: ExpertWeights = { duskBudget: 64, passLimit: 64, loopIterationLimit: 4, sequencingTolerance: 0, interruptHoldMargin: 0, cheapUnlessCost: 1 };

const context = (side: Side) => expertContext(engine, side, { player: entries(deck), enemy: entries(deck) });

describe("the Expert Day sequencing", () => {
  it("weighs a character play at each open slot supporting an occupied lane and at the first open slot", () => {
    const { state } = boardState(engine.catalog, { active: "player", phase: "day", player: { deck, hand: [vanilla0.id, event0.id], back: [vanilla3.id], front: [null, null, null, null, vanilla3.id] }, enemy: { deck } });
    const legal = engine.legalActions(state, "player");
    const expanded = withPlacements(state, legal, context("player"));
    const character = (action: Action) => action.kind === "play" && state.sides.player.hand[0] === action.card;
    const placements = expanded.filter(character);
    expect(placements.map((action) => action.kind === "play" ? action.slot : null)).toEqual([1, 4, 5].map((index) => ({ rank: "back", index })));
    expect(expanded.filter((action) => !character(action))).toEqual(legal.filter((action) => !character(action)));
  });

  for (const side of SIDES) {
    it(`plays removal before deployment among near-equal choices, for ${side}`, () => {
      const { state } = boardState(engine.catalog, {
        active: side, phase: "day",
        [side]: { deck, hand: [vanilla0.id, dissolveVictim.id] },
        [opponent(side)]: { deck, back: [vanilla3.id] },
      });
      const legal = engine.legalActions(state, side);
      const decision = chooseDayAction([state], legal, context(side), { ...WEIGHTS, sequencingTolerance: Number.POSITIVE_INFINITY });
      expect(decision.chosen?.class).toBe("removal");
      expect(legal.some((action) => action.kind === "play" && decision.action.kind === "play" && action.card === decision.action.card)).toBe(true);
    });

    it(`withdraws a challenger the defender would block and dissolve, for ${side}`, () => {
      const { state, ids } = boardState(engine.catalog, {
        active: side, phase: "day",
        [side]: { deck, front: [vanilla3.id] },
        [opponent(side)]: { deck, back: [vanilla5.id] },
      });
      const challenger = ids[side].front[0];
      const decision = chooseDayAction([state], engine.legalActions(state, side), context(side), WEIGHTS);
      expect(decision.action).toMatchObject({ kind: "reposition", card: challenger, to: { rank: "back" } });
    });
  }

  for (const side of SIDES) {
    it(`passes rather than repositioning for no gain, for ${side}`, () => {
      const { state } = boardState(engine.catalog, { active: side, phase: "day", [side]: { deck, back: [vanilla0.id] }, [opponent(side)]: { deck } });
      const decision = chooseDayAction([state], engine.legalActions(state, side), context(side), { ...WEIGHTS, sequencingTolerance: Number.POSITIVE_INFINITY });
      expect(decision.action).toEqual({ kind: "pass" });
    });
  }

  it("plans only the side's own Day main decision", () => {
    const { state } = boardState(engine.catalog, { active: "enemy", phase: "day", enemy: { deck }, player: { deck } });
    expect(() => chooseDayAction([state], [], context("player"), WEIGHTS)).toThrow();
  });
});
