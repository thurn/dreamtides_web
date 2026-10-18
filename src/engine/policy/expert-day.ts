/**
 * The Expert's Day sequencing (phase-7-ai § 7.3): the main decision of the
 * deciding side's own Day. Every legal action is valued by playing on to
 * the end of the turn's challenge against the defender's exact Dusk
 * assignment (expert-valuation), so repositions choose challengers by the
 * blocks they would meet. A character play is valued at each open back-rank
 * slot supporting an occupied lane, and at the first open slot, so it is
 * placed where its Support counts most.
 * Among actions scoring within the sequencing tolerance of the best, the
 * earliest class in sequencing order wins: removal before deployment. An
 * action other than passing contends only when it gains over passing, and
 * a reposition only when it gains more than the tolerance.
 */
import type { Action } from "../rules/actions";
import { BACK_RANK_SIZE } from "../state/ids";
import type { BattleState } from "../state/types";
import type { ExpertContext } from "./expert-contracts";
import { ACTION_CLASS_ORDER, rankActions, type ActionValuation, type ExpertWeights } from "./expert-valuation";

/**
 * Each character play from `legal` once per open back-rank slot where its
 * placement can matter: every slot supporting an occupied front-rank lane
 * (`Bi` supports `F(i-1)` and `Fi`), and the first open slot; the other
 * actions as they are.
 */
export function withPlacements(state: BattleState, legal: readonly Action[], ctx: ExpertContext): Action[] {
  const { backRank, frontRank } = state.sides[ctx.side];
  const open = Array.from({ length: BACK_RANK_SIZE }, (_, index) => index).filter((index) => backRank[index] === null);
  const supporting = (index: number) => frontRank[index - 1] != null || frontRank[index] != null;
  const slots = open.filter((index, position) => position === 0 || supporting(index));
  return legal.flatMap((action): Action[] => {
    if (action.kind !== "play") return [action];
    const instance = state.instances[action.card];
    if (instance === undefined || instance.printing.kind === "figment" || ctx.engine.catalog.card(instance.printing.cardId).cardType !== "character") return [action];
    return slots.length === 0 ? [action] : slots.map((index): Action => ({ ...action, slot: { rank: "back", index } }));
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
  // Passing always contends; another action only when it gains over passing, a
  // reposition only by more than the tolerance, so near-ties never shuffle characters.
  const contenders = ranking.filter((entry) => entry.score >= best.score - weights.sequencingTolerance &&
    (entry.action.kind === "pass" || entry.gain > (entry.action.kind === "reposition" ? weights.sequencingTolerance : 0)));
  const chosen = ACTION_CLASS_ORDER.flatMap((kind) => contenders.filter((entry) => entry.class === kind))[0] ?? ranking.find((entry) => entry.action.kind === "pass") ?? best;
  return { action: chosen.action, chosen, ranking };
}
