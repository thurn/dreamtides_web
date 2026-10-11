import { expect } from "vitest";
import type { Side } from "../../engine/state/ids";
import { opponent, SIDES } from "../../engine/state/ids";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { parseCardId } from "../../types/card-identity";
import agent from "../cards/shatterpoint-agent-7697da0e";

const AGENT = parseCardId(agent.id);
const DECK = Array.from({ length: 4 }, () => SYNTHETIC.vanilla1.id);

/** Actual scored points, rather than printed spark, determine the opponent's loss. */
function scores(side: Side, blocked: boolean, opposingScore: number): NamedScenario {
  const defending = opponent(side);
  const amount = blocked ? 1 : 3;
  return {
    name: `${agent.id} ${side} ${blocked ? "blocked" : "unpaired"} challenge against ${String(opposingScore)} points`,
    spec: {
      board: {
        active: side, phase: "day",
        [side]: { front: [AGENT], deck: DECK },
        [defending]: { front: blocked ? [SYNTHETIC.vanilla2.id] : [], score: opposingScore, deck: DECK },
      },
      steps: () => [side, defending, side].map((actor) => ({ side: actor, action: { kind: "pass" } })),
    },
    check: ({ events, state, ids }) => {
      const challenger = ids[side].front[0];
      expect(events).toContainEqual(expect.objectContaining({ kind: "laneResolved", challenger, scored: amount }));
      expect(events).toContainEqual(expect.objectContaining({ kind: "triggerQueued", source: challenger, controller: side, scored: amount }));
      expect(state.sides[side].score).toBe(amount);
      expect(state.sides[defending].score).toBe(Math.max(0, opposingScore - amount));
      expect(events.filter((event) => event.kind === "pointsScored" && event.cause === "effect")).toEqual(opposingScore === 0 ? [] : [
        { kind: "pointsScored", side: defending, amount: -Math.min(opposingScore, amount), cause: "effect" },
      ]);
    },
  };
}

export default {
  slug: "prim-lose-points",
  scenarios: SIDES.flatMap((side) => [scores(side, true, 7), scores(side, false, 7), scores(side, false, 0)]),
} satisfies ScenarioModule;
