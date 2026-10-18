/**
 * The Expert policy (phase-7-ai § 7.3, D27): the hand-written bot that
 * integrates the Expert strategy modules over determinizations of its view
 * (D22), with its weights from `AI.expert`:
 *
 * - its own Day: Day sequencing (expert-day), which values every action
 *   against the defender's exact Dusk assignment, places characters for
 *   Support and plays removal before deployment;
 * - its Dusk as the defender: the exact Dusk assignment (expert-dusk);
 * - a response: Prevent high-value items and hold Interrupts otherwise
 *   (expert-valuation);
 * - any other main window: the best-valued action, passing unless one
 *   gains;
 * - a prompt: the prompt strategy (expert-prompts), valuing cards by spark
 *   and AST features from its view.
 *
 * Its evaluation is the position evaluation plus the ongoing value of the
 * printed abilities of each side's characters in play, read from their AST
 * features (`AI.expert.abilityValue`).
 *
 * Candidates the per-card overrides (expert-overrides) rule out are never
 * weighed. Every decision's trace names the best candidates with their
 * scores, for the AI decision log.
 */
import { AI } from "../../content/ai";
import type { CardFeatures, FeatureContribution } from "../dsl/ai-features";
import type { Action } from "../rules/actions";
import { opponent, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import type { BattleView } from "../view/view";
import { chooseDayAction } from "./expert-day";
import { expertContext, type ExpertContext } from "./expert-contracts";
import { planDusk } from "./expert-dusk";
import { overridden } from "./expert-overrides";
import { expertAnswer, featureCardValue } from "./expert-prompts";
import { chooseResponse, rankActions, type ActionValuation, type ExpertWeights } from "./expert-valuation";
import { greedyAnswer, stateCardInfo, stateDiscoverCosts, stateSubtypeCounts } from "./prompts";
import type { Prompt } from "../prompts/types";
import { InlineSource } from "../steps/sources";
import type { Policy, PolicyCandidate, PolicyChoice, PolicyContext, PolicyDecision, PolicyResult } from "./types";

const EXPERT = AI.expert;

/** Whether a contribution favors its card's controller: a gain for it, or removal or a loss for the opponent. */
function favors(contribution: FeatureContribution): boolean {
  const negative = contribution.amount.kind === "exact" ? contribution.amount.value < 0 : contribution.amount.kind === "dynamic" && contribution.amount.sign < 0;
  if (contribution.feature === "removal") return contribution.player === "opponent";
  return contribution.player === "you" ? !negative : contribution.player === "opponent" && negative;
}

/** The ongoing value of a printed card's triggered, static and activated abilities while it is in play. */
function abilityValue(features: CardFeatures): number {
  const { weights, amountCap } = EXPERT.abilityValue;
  let total = 0;
  for (const ability of features.base) {
    if (ability.kind !== "triggered" && ability.kind !== "static" && ability.kind !== "activated") continue;
    for (const contribution of ability.contributions) {
      if (!favors(contribution)) continue;
      const amount = contribution.amount.kind === "exact" ? Math.min(amountCap, Math.abs(contribution.amount.value)) : 1;
      total += weights[contribution.feature] * amount;
    }
  }
  return total;
}

/** `ectx` with the Expert's evaluation: the position evaluation plus the ability value of the characters in play, its own minus the opponent's. */
function withAbilityValue(ectx: ExpertContext): ExpertContext {
  const sideValue = (view: BattleView, side: Side): number =>
    [...view.sides[side].frontRank, ...view.sides[side].backRank].reduce((total, id) => {
      const printing = id === null ? undefined : view.instances[id]?.printing;
      return printing === undefined || printing.kind === "figment" ? total : total + abilityValue(ectx.features(printing.cardId));
    }, 0);
  return {
    ...ectx,
    evaluate: (view) => {
      const base = ectx.evaluate(view);
      return view.result === null ? { ...base, total: base.total + sideValue(view, ectx.side) - sideValue(view, opponent(ectx.side)) } : base;
    },
    features: (cardId) => ectx.features(cardId),
  };
}

/**
 * The Day actions worth valuing: every play and activation, and of the
 * repositions only one per distinct destination. A front-rank lane is
 * distinct by the enemy character opposite it, the own character it would
 * swap with and the two back-rank characters supporting it; a back-rank slot is worth reaching only when it supports
 * an occupied front-rank lane or is the first open slot.
 */
export function distinctDayActions(state: BattleState, legal: readonly Action[], side: Side): Action[] {
  const own = state.sides[side], enemy = state.sides[opponent(side)];
  const firstOpen = own.backRank.indexOf(null);
  const seen = new Set<string>();
  return legal.filter((action) => {
    if (action.kind !== "reposition") return true;
    const { rank, index } = action.to;
    if (rank === "back") return (own.backRank[index] === null && index === firstOpen) || own.frontRank[index - 1] != null || own.frontRank[index] != null;
    const lane = `${action.card}|${enemy.frontRank[index] ?? "-"}|${own.frontRank[index] ?? "-"}|${own.backRank[index] ?? "-"}|${own.backRank[index + 1] ?? "-"}`;
    if (seen.has(lane)) return false;
    seen.add(lane);
    return true;
  });
}

function candidatesOf(ranking: readonly ActionValuation[]): PolicyCandidate[] {
  return ranking.slice(0, EXPERT.traceTopK).map((entry) => ({ choice: { kind: "action", action: entry.action }, score: entry.score, visits: entry.samples }));
}

/** Both sides answer simulated prompts with the prompt heuristic, over the step's own work state. */
function simulationSource(ectx: ExpertContext): InlineSource {
  const { catalog } = ectx.engine;
  const answer = (prompt: Prompt, work: BattleState) =>
    greedyAnswer(prompt, stateCardInfo(work, catalog, prompt.side), stateDiscoverCosts(work, catalog), work.automaticChoices, stateSubtypeCounts(work, catalog));
  return new InlineSource({ player: answer, enemy: answer });
}

/** `state` after `action` and any responses passed, while it is still `side`'s Day main decision; otherwise `null`. */
function continuing(state: BattleState, action: Action, ectx: ExpertContext, weights: ExpertWeights): BattleState | null {
  const source = simulationSource(ectx);
  try {
    let current = ectx.engine.apply(state, ectx.side, action, source).state;
    for (let passes = 0; current.result === null && current.stack.length > 0 && passes < weights.passLimit; passes++) {
      const next = ectx.engine.decision(current);
      if (next === null) return null;
      current = ectx.engine.apply(current, next.side, { kind: "pass" }, source).state;
    }
    const decision = ectx.engine.decision(current);
    const sameDay = current.turn.turnNumber === state.turn.turnNumber && current.turn.phase === "day";
    return current.result === null && sameDay && decision?.kind === "main" && decision.side === ectx.side ? current : null;
  } catch {
    return null;
  }
}

/**
 * The Day decision with a two-action lookahead: the Day sequencing's best
 * first actions are each valued by the best follow-up the Day still allows,
 * passing included, averaged over the determinizations; the first action of
 * the best pair wins when it beats the sequencing's own choice.
 */
function dayDecision(states: readonly BattleState[], legal: readonly Action[], ectx: ExpertContext, weights: ExpertWeights): { readonly action: Action; readonly ranking: readonly ActionValuation[] } {
  const first = states[0];
  if (first === undefined) return { action: { kind: "pass" }, ranking: [] };
  const single = chooseDayAction(states, distinctDayActions(first, legal, ectx.side), ectx, weights);
  const chosenScore = single.chosen?.score ?? Number.NEGATIVE_INFINITY;
  let best: { readonly action: Action; readonly score: number } | null = null;
  for (const entry of single.ranking.filter((candidate) => candidate.action.kind !== "pass").slice(0, EXPERT.lookahead.firstActions)) {
    let total = 0, samples = 0;
    for (const state of states) {
      const after = continuing(state, entry.action, ectx, weights);
      if (after === null) continue;
      const followUps = rankActions([after], distinctDayActions(after, ectx.engine.legalActions(after, ectx.side), ectx.side), ectx, weights);
      const top = followUps[0];
      if (top === undefined) continue;
      total += top.score;
      samples += 1;
    }
    const score = samples === 0 ? entry.score : total / samples;
    if (best === null || score > best.score) best = { action: entry.action, score };
  }
  return best !== null && best.score > chosenScore + weights.sequencingTolerance ? { action: best.action, ranking: single.ranking } : single;
}

/** The action for a top-level decision, with the ranking that chose it. */
function topLevel(states: readonly BattleState[], legal: readonly Action[], ectx: ExpertContext): { readonly action: Action; readonly ranking: readonly ActionValuation[] } {
  const first = states[0];
  const decision = first === undefined ? null : ectx.engine.decision(first);
  if (first === undefined || decision === null) return { action: { kind: "pass" }, ranking: [] };
  const { phase, active } = first.turn;
  // Valuations project each Dusk with the smaller budget; the Expert's own Dusk uses the full one.
  const projecting = { ...EXPERT.weights, duskBudget: EXPERT.projectedDuskBudget };
  if (decision.kind === "respond") return chooseResponse(states, legal, ectx, projecting);
  if (phase === "day" && active === ectx.side) return dayDecision(states, legal, ectx, projecting);
  if (phase === "dusk" && active !== ectx.side) return { action: planDusk(first, ectx, EXPERT.weights.duskBudget).action, ranking: [] };
  const ranking = rankActions(states, legal, ectx, projecting);
  const best = ranking[0];
  return { action: best !== undefined && best.gain > 0 ? best.action : { kind: "pass" }, ranking };
}

export const EXPERT_POLICY: Policy = {
  id: "expert",
  decide(view: BattleView, decision: PolicyDecision, ctx: PolicyContext): PolicyResult {
    const started = ctx.now();
    const ectx = withAbilityValue(expertContext(ctx.engine, ctx.side, ctx.decklists));
    const sample = () => ctx.engine.determinize(view, ctx.decklists, () => ctx.random.next());
    if (decision.kind === "topLevel") {
      const legal = decision.legal.filter((action) => !overridden(view, action));
      const choices = legal.length === 0 ? decision.legal : legal;
      const states = Array.from({ length: EXPERT.determinizations }, sample);
      const { action, ranking } = choices.length > 1 ? topLevel(states, choices, ectx) : { action: choices[0] ?? { kind: "pass" as const }, ranking: [] };
      const chosen: PolicyChoice = { kind: "action", action };
      return {
        choice: chosen,
        trace: {
          policy: "expert",
          budget: ctx.budget,
          used: { iterations: ranking.reduce((total, entry) => total + entry.samples, 0), ms: ctx.now() - started },
          determinizations: choices.length > 1 ? states.length : 0,
          candidates: candidatesOf(ranking),
          chosen,
        },
      };
    }
    let determinizations = 0;
    const once = (): BattleState => {
      determinizations += 1;
      return sample();
    };
    const result = expertAnswer(decision.prompt, {
      side: ctx.side,
      energy: view.sides[ctx.side].currentEnergy,
      automaticChoices: view.automaticChoices,
      cardValue: featureCardValue(view, ctx.side, (cardId) => ectx.features(cardId)),
      discoverCosts: (prompt) => stateDiscoverCosts(once(), ctx.engine.catalog)(prompt),
      subtypeCounts: (prompt) => stateSubtypeCounts(once(), ctx.engine.catalog)(prompt),
    }, EXPERT.prompts);
    const chosen: PolicyChoice = { kind: "answer", value: result.answer };
    return {
      choice: chosen,
      trace: {
        policy: "expert",
        budget: ctx.budget,
        used: { iterations: result.scored, ms: ctx.now() - started },
        determinizations,
        candidates: [],
        chosen,
        ...(result.reason === "chainSpent" ? { declined: "optionalChain" as const } : {}),
      },
    };
  },
};
