/**
 * The Expert's action valuation (phase-7-ai § 7.3): every legal top-level
 * action, in a determinization of the deciding side's view, is applied and
 * played on to the end of the turn's challenge, and the result is scored by
 * the injected position evaluation. Both sides pass, except that each Dusk
 * is played by the exact Dusk assignment, so a Day action is valued against
 * the blocks the defender would actually make. The AST features classify
 * each action (removal, Prevent, other plays, deployment, reposition, loop)
 * for sequencing and for the decision log.
 *
 * The weights are injected by the Expert policy, which reads them from the
 * AI data module.
 */
import type { CardFeatures } from "../dsl/ai-features";
import type { Prompt } from "../prompts/types";
import type { Action } from "../rules/actions";
import { opponent, sourceInstance, type CardId } from "../state/ids";
import type { BattleState } from "../state/types";
import { InlineSource } from "../steps/sources";
import { expertContext, type ExpertContext } from "./expert-contracts";
import { planDusk } from "./expert-dusk";
import { greedyAnswer, stateCardInfo, stateDiscoverCosts, stateSubtypeCounts } from "./prompts";

/** The Expert's valuation and sequencing tunables, supplied from the AI data module. */
export interface ExpertWeights {
  /** Layouts the Dusk assignment scores for each projected Dusk. */
  readonly duskBudget: number;
  /** Decisions passed while playing a candidate on to the end of the turn's challenge. */
  readonly passLimit: number;
  /** Repetitions of an optional loop valued per candidate. */
  readonly loopIterationLimit: number;
  /** A preferred class of action wins over the best action when it scores within this much of it. */
  readonly sequencingTolerance: number;
  /** An Interrupt is held unless using it now gains more than this over passing. */
  readonly interruptHoldMargin: number;
  /** An "unless" cost of at most this much energy is paid when affordable. */
  readonly cheapUnlessCost: number;
}

/**
 * What an action does, from its card's AST features, in sequencing order:
 * removal first, then Prevent, other plays and activations, deploying a
 * character, repositioning, repeating a loop, paying to end an effect,
 * passing.
 */
export type ActionClass = "removal" | "prevent" | "spell" | "deployment" | "reposition" | "loop" | "payToEnd" | "pass";

export const ACTION_CLASS_ORDER: readonly ActionClass[] = ["removal", "prevent", "spell", "deployment", "reposition", "loop", "payToEnd", "pass"];

export interface ActionValuation {
  readonly action: Action;
  readonly class: ActionClass;
  /** The card the action plays or activates, when it has one. */
  readonly card: CardId | null;
  /** The mean evaluation after the turn's challenge, over the samples that completed. */
  readonly score: number;
  /** `score` minus passing's score in the same samples; 0 for passing. */
  readonly gain: number;
  readonly samples: number;
}

/** Both sides answer simulated prompts with the prompt heuristic, over the step's own work state. */
function simulationSource(ctx: ExpertContext): InlineSource {
  const { catalog } = ctx.engine;
  const answer = (prompt: Prompt, work: BattleState) =>
    greedyAnswer(prompt, stateCardInfo(work, catalog, prompt.side), stateDiscoverCosts(work, catalog), work.automaticChoices, stateSubtypeCounts(work, catalog));
  return new InlineSource({ player: answer, enemy: answer });
}

/** The printed card an action plays or activates, if any. */
export function actionCard(state: BattleState, action: Action): CardId | null {
  const id = action.kind === "play" ? action.card : action.kind === "activate" ? sourceInstance(action.source) : null;
  const instance = id === null ? undefined : state.instances[id];
  if (instance === undefined || instance.printing.kind === "figment") return null;
  return instance.printing.cardId;
}

function opposingRemoval(features: CardFeatures, ability: number | null): { readonly removal: boolean; readonly prevent: boolean } {
  const abilities = features.base.filter((entry) => ability === null || entry.index === ability);
  const contributions = abilities.flatMap((entry) => entry.contributions).filter((entry) => entry.feature === "removal" && entry.player !== "you");
  return { removal: contributions.some((entry) => entry.op !== "prevent"), prevent: contributions.some((entry) => entry.op === "prevent") };
}

/** The action's class, from the AST features of the card it plays or the ability it activates. */
export function classify(state: BattleState, ctx: ExpertContext, action: Action): ActionClass {
  switch (action.kind) {
    case "pass": return "pass";
    case "reposition": return "reposition";
    case "repeatLoop": return "loop";
    case "payToEnd": return "payToEnd";
    case "play":
    case "activate": {
      const card = actionCard(state, action);
      if (card === null) return "spell";
      const { removal, prevent } = opposingRemoval(ctx.features(card), action.kind === "activate" ? action.ability : null);
      if (removal) return "removal";
      if (prevent) return "prevent";
      return action.kind === "play" && ctx.engine.catalog.card(card).cardType === "character" ? "deployment" : "spell";
    }
  }
}

function sameTurn(state: BattleState, start: BattleState): boolean {
  return state.turn.turnNumber === start.turn.turnNumber && state.turn.active === start.turn.active;
}

/**
 * Plays `state` on to the end of its turn's challenge: each Dusk by the
 * exact Dusk assignment of its defender, every other decision passed.
 * `null` when it does not finish within the pass limit.
 */
function finishChallenge(state: BattleState, ctx: ExpertContext, weights: ExpertWeights, source: InlineSource): BattleState | null {
  const contexts = { [ctx.side]: ctx, [opponent(ctx.side)]: expertContext(ctx.engine, opponent(ctx.side), ctx.decklists) };
  let current = state;
  for (let steps = 0; current.result === null && sameTurn(current, state) && current.turn.phase !== "ending"; steps++) {
    const decision = ctx.engine.decision(current);
    if (decision === null || steps >= weights.passLimit) return null;
    const defending = current.turn.phase === "dusk" && decision.kind === "main" && decision.side !== current.turn.active;
    const context = contexts[decision.side];
    const action: Action = defending && context !== undefined ? planDusk(current, context, weights.duskBudget).action : { kind: "pass" };
    current = ctx.engine.apply(current, decision.side, action, source).state;
  }
  return current;
}

/** The evaluation after `action` and the rest of the turn's challenge, or `null` when the simulation does not complete. */
export function valueAction(state: BattleState, action: Action, ctx: ExpertContext, weights: ExpertWeights): number | null {
  const source = simulationSource(ctx);
  try {
    const finished = finishChallenge(ctx.engine.apply(state, ctx.side, action, source).state, ctx, weights, source);
    return finished === null ? null : ctx.evaluate(ctx.engine.view(finished, ctx.side)).total;
  } catch {
    return null;
  }
}

/** A repeat bounded by the loop limit, so its simulation does finite work. */
function bounded(action: Action, state: BattleState, weights: ExpertWeights): Action {
  if (action.kind !== "repeatLoop") return action;
  const cap = Math.min(weights.loopIterationLimit, state.config.loopIterationCap);
  return { ...action, count: action.count === "untilVictory" ? cap : Math.min(cap, action.count) };
}

/**
 * Every candidate's valuation over the determinizations `states`, best
 * first; ties keep the candidates' order. Passing is always valued, so
 * every gain is measured against it.
 */
export function rankActions(states: readonly BattleState[], candidates: readonly Action[], ctx: ExpertContext, weights: ExpertWeights): ActionValuation[] {
  const first = states[0];
  if (first === undefined) return [];
  const actions = [{ kind: "pass" } as const, ...candidates.filter((action) => action.kind !== "pass")].map((action) => bounded(action, first, weights));
  const passScores = states.map((state) => valueAction(state, { kind: "pass" }, ctx, weights));
  const ranked = actions.flatMap((action): ActionValuation[] => {
    let total = 0, gain = 0, samples = 0;
    states.forEach((state, index) => {
      const score = action.kind === "pass" ? passScores[index] ?? null : valueAction(state, action, ctx, weights);
      const pass = passScores[index] ?? null;
      if (score === null) return;
      total += score;
      gain += pass === null ? 0 : score - pass;
      samples += 1;
    });
    if (samples === 0) return [];
    return [{ action, class: classify(first, ctx, action), card: actionCard(first, action), score: total / samples, gain: gain / samples, samples }];
  });
  return ranked.sort((a, b) => b.score - a.score);
}

/** Why a response was chosen: the best gain, held for a better moment, or nothing beats passing. */
export type ResponseReason = "use" | "hold" | "pass";

/**
 * A response decision: the best response when it gains over passing, but
 * an Interrupt card only when its gain exceeds the hold margin, so a
 * Prevent is spent on high-value items.
 */
export function chooseResponse(states: readonly BattleState[], legal: readonly Action[], ctx: ExpertContext, weights: ExpertWeights): { readonly action: Action; readonly reason: ResponseReason; readonly ranking: readonly ActionValuation[] } {
  const ranking = rankActions(states, legal, ctx, weights);
  const best = ranking.find((entry) => entry.action.kind !== "pass");
  if (best === undefined || best.gain <= 0) return { action: { kind: "pass" }, reason: "pass", ranking };
  const interrupt = best.card !== null && best.action.kind === "play" && ctx.engine.catalog.card(best.card).speed === "interrupt";
  if (interrupt && best.gain <= weights.interruptHoldMargin) return { action: { kind: "pass" }, reason: "hold", ranking };
  return { action: best.action, reason: "use", ranking };
}

/** Whether to pay an "unless" cost of `cost` energy with `available` energy: when it is cheap and affordable. */
export function paysUnless(cost: number, available: number, weights: ExpertWeights): boolean {
  return cost <= available && cost <= weights.cheapUnlessCost;
}
