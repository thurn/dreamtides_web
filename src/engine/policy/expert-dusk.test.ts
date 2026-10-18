/**
 * Contracts of the Expert Dusk assignment, for either side defending: its
 * plan is a sequence of legal repositions that, followed one decision at a
 * time, reaches a layout that dominates the alternatives, and it keeps a
 * layout that already does.
 */
import { describe, expect, it } from "vitest";
import { opponent, SIDES, type InstanceId, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import type { SideSetup } from "../testing/board";
import { NO_PROMPTS } from "../steps/sources";
import { SYNTHETIC } from "../testing/synthetic-cards";
import { expertContext } from "./expert-contracts";
import { planDusk } from "./expert-dusk";
import { board, deck, engine, entries } from "./policy.fixtures";

const { vanilla1, vanilla3, vanilla5 } = SYNTHETIC;
const BUDGET = 256;

/** `defender`'s Dusk after the attacker ends its Day with `attacker`'s front rank as challengers. */
function dusk(defender: Side, own: SideSetup, attacker: SideSetup, edit?: (state: BattleState, ids: ReturnType<typeof board>["ids"]) => void): BattleState {
  const active = opponent(defender);
  const { state, ids } = board({ active, phase: "day", [defender]: { deck, ...own }, [active]: { deck, ...attacker } });
  edit?.(state, ids);
  return engine.apply(state, active, { kind: "pass" }, NO_PROMPTS).state;
}

function context(side: Side) {
  return expertContext(engine, side, { player: entries(deck), enemy: entries(deck) });
}

/** Follows the plan one decision at a time, replanning after each reposition, until it passes. */
function follow(state: BattleState, side: Side): { readonly state: BattleState; readonly moves: number } {
  let current = state, moves = 0;
  for (;;) {
    const plan = planDusk(current, context(side), BUDGET);
    if (plan.action.kind === "pass") return { state: current, moves };
    expect(engine.legalActions(current, side)).toContainEqual(plan.action);
    current = engine.apply(current, side, plan.action, NO_PROMPTS).state;
    moves += 1;
    expect(moves).toBeLessThanOrEqual(engine.legalActions(state, side).length);
  }
}

const front = (state: BattleState, side: Side, lane: number): InstanceId | null => state.sides[side].frontRank[lane] ?? null;

describe("the Expert Dusk assignment", () => {
  for (const defender of SIDES) {
    it(`moves a winning blocker opposite an unblocked challenger, defending as ${defender}`, () => {
      const state = dusk(defender, { back: [null, null, null, null, vanilla5.id] }, { front: [vanilla3.id] });
      const blocker = state.sides[defender].backRank[4] ?? null;
      const plan = planDusk(state, context(defender), BUDGET);
      expect(plan.exhaustive).toBe(true);
      expect(plan.moves).toHaveLength(1);
      const { state: final } = follow(state, defender);
      expect(front(final, defender, 0)).toBe(blocker);
    });

    it(`swaps a losing blocker for a winning one, defending as ${defender}`, () => {
      const state = dusk(defender, { front: [vanilla1.id], back: [null, null, null, vanilla5.id] }, { front: [vanilla3.id] });
      const winner = state.sides[defender].backRank[3] ?? null;
      const { state: final } = follow(state, defender);
      expect(front(final, defender, 0)).toBe(winner);
    });

    it(`keeps a layout that already blocks with a winner, defending as ${defender}`, () => {
      const state = dusk(defender, { front: [vanilla5.id], back: [vanilla1.id] }, { front: [vanilla3.id] });
      const plan = planDusk(state, context(defender), BUDGET);
      expect(plan.action).toEqual({ kind: "pass" });
      expect(plan.moves).toEqual([]);
    });

    it(`never moves an exhausted character forward, defending as ${defender}`, () => {
      const state = dusk(defender, { back: [null, null, null, null, vanilla5.id] }, { front: [vanilla3.id] }, (setup, ids) => {
        const id = ids[defender].back[4];
        if (id === null || id === undefined) throw new Error("missing blocker");
        const instance = setup.instances[id];
        if (instance !== undefined) instance.status = { ...instance.status, exhausted: true };
      });
      const plan = planDusk(state, context(defender), BUDGET);
      expect(plan.moves.every((move) => move.kind === "reposition" && move.to.rank === "back")).toBe(true);
    });
  }

  it("reports a search its budget cuts short", () => {
    const state = dusk("player", { back: [vanilla1.id, null, null, null, vanilla5.id] }, { front: [vanilla3.id, vanilla3.id] });
    const short = planDusk(state, context("player"), 1);
    expect(short).toMatchObject({ layouts: 1, exhaustive: false, action: { kind: "pass" } });
    const full = planDusk(state, context("player"), BUDGET);
    expect(full.exhaustive).toBe(true);
    expect(full.layouts).toBeGreaterThan(1);
  });

  it("plans only the defender's Dusk decision", () => {
    const { state } = board({ active: "enemy", phase: "day", enemy: { deck, front: [vanilla3.id] }, player: { deck } });
    expect(() => planDusk(state, context("player"), BUDGET)).toThrow();
  });
});
