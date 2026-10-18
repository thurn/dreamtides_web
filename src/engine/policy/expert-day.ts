/**
 * The Expert's Day sequencing (phase-7-ai § 7.3): the main decision of the
 * deciding side's own Day. Every legal action is valued by playing on to
 * the end of the turn's challenge against the defender's exact Dusk
 * assignment (expert-valuation), so repositions choose challengers by the
 * blocks they would meet. A character play is valued at each open back-rank
 * slot it may be dropped on, so it is placed where its Support counts most.
 * Among actions scoring within the sequencing tolerance of the best, the
 * earliest class in sequencing order wins: removal before deployment.
 */
import type { Action } from "../rules/actions";
import { BACK_RANK_SIZE } from "../state/ids";
import type { BattleState } from "../state/types";
import type { ExpertContext } from "./expert-contracts";
import { ACTION_CLASS_ORDER, rankActions, type ActionValuation, type ExpertWeights } from "./expert-valuation";

/** Each character play from `legal` once per open back-rank slot of the deciding side, the other actions as they are. */
export function withPlacements(state: BattleState, legal: readonly Action[], ctx: ExpertContext): Action[] {
  const open = Array.from({ length: BACK_RANK_SIZE }, (_, index) => index).filter((index) => state.sides[ctx.side].backRank[index] === null);
  return legal.flatMap((action): Action[] => {
    if (action.kind !== "play") return [action];
    const instance = state.instances[action.card];
    if (instance === undefined || instance.printing.kind === "figment" || ctx.engine.catalog.card(instance.printing.cardId).cardType !== "character") return [action];
    return open.length === 0 ? [action] : open.map((index): Action => ({ ...action, slot: { rank: "back", index } }));
  });
}

export interface DayDecision {
  readonly action: Action;
  /** The chosen candidate's valuation; `null` when no candidate's simulation completed. */
  readonly chosen: ActionValuation | null;
  readonly ranking: readonly ActionValuation[];
}

/**
 * The Expert's choice for `ctx.side`'s Day main decision, over the
 * determinizations `states` of its view.
 */
export function chooseDayAction(states: readonly BattleState[], legal: readonly Action[], ctx: ExpertContext, weights: ExpertWeights): DayDecision {
  const first = states[0];
  if (first === undefined) throw new Error("no determinization to plan from");
  const decision = ctx.engine.decision(first);
  if (first.turn.phase !== "day" || first.turn.active !== ctx.side || decision?.kind !== "main" || decision.side !== ctx.side) {
    throw new Error(`not ${ctx.side}'s Day decision`);
  }
  const ranking = rankActions(states, withPlacements(first, legal, ctx), ctx, weights);
  const best = ranking[0];
  if (best === undefined) return { action: { kind: "pass" }, chosen: null, ranking };
  const contenders = ranking.filter((entry) => entry.score >= best.score - weights.sequencingTolerance);
  const chosen = ACTION_CLASS_ORDER.flatMap((kind) => contenders.filter((entry) => entry.class === kind))[0] ?? best;
  return { action: chosen.action, chosen, ranking };
}
