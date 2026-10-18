/**
 * The Expert's prompt strategy (phase-7-ai § 7.3): targets and choices by
 * valuation. It answers every kind of prompt for the side that answers it,
 * reading only what that side's view and its injected callbacks supply, and
 * returns a prompt answer, never a top-level action.
 *
 * When the caller injects an answer valuation (the Expert's simulation of
 * the position after an answer), the strategy scores up to the weights'
 * answer limit of legal answers, its own heuristic answer among them, and
 * keeps the best. Otherwise, and for prompts with more legal answers than
 * it scores, it answers by card valuation:
 *
 * - a selection takes the cards its role wants most: the opponent's most
 *   valuable for a hostile choice such as a target, its own most valuable
 *   for a gain, its own least valuable (and as few as allowed) for a loss
 *   such as a cost or a discard;
 * - a "you may" is accepted, an "unless" cost is paid when it is payable,
 *   affordable and cheap, X and other numbers are the largest, a free
 *   Discover cost is the highest its deck can find, and a character type is
 *   the one it has most characters of.
 *
 * Once a run of automatic steps has spent the optional-chain cap it declines
 * every loopable prompt (`greedyDeclinesChain`), so a self-retriggering
 * "you may" ends; finite prompts are answered as before.
 */
import type { CardSubtype } from "../../types/card-identity";
import type { CardFeatures, FeatureContribution } from "../dsl/ai-features";
import { canonicalAnswer, firstLegalAnswer, isLegalAnswer, legalAnswers } from "../prompts/answers";
import type { Answer, ChooseModePrompt, ChooseNumberPrompt, Prompt, PromptRole } from "../prompts/types";
import type { CardId, InstanceId, Side } from "../state/ids";
import type { BattleView } from "../view/view";
import { declineAnswer, greedyDeclinesChain } from "./prompts";

/** What the chooser's valuation says of a candidate card: whether it controls it, and how much the card is worth. */
export interface CardValue {
  readonly mine: boolean;
  readonly value: number;
}

/** The Expert's prompt tunables, supplied from the AI data module. */
export interface ExpertPromptWeights {
  /** Legal answers scored by the injected answer valuation, at most. */
  readonly scoredAnswers: number;
  /** An "unless" cost of at most this much energy is paid when affordable. */
  readonly cheapUnlessCost: number;
}

/** What the strategy reads for one prompt, all from the answering side's own view. */
export interface ExpertPromptContext {
  readonly side: Side;
  /** The answering side's current energy, for an "unless" cost. */
  readonly energy: number;
  /** `BattleState.automaticChoices`, for the optional-chain bound. */
  readonly automaticChoices: number;
  /** The chooser's valuation of a candidate card; `null` for a card it cannot see. */
  cardValue(id: InstanceId): CardValue | null;
  /** The costs at which a free Discover cost finds a card in the chooser's deck. */
  discoverCosts(prompt: ChooseNumberPrompt): ReadonlySet<number>;
  /** How many characters of each type the chooser has in play and in its deck. */
  subtypeCounts(prompt: ChooseModePrompt): ReadonlyMap<CardSubtype, number>;
  /** The chooser's valuation of the position after an answer, when it can simulate one; `null` when it cannot. */
  answerValue?(answer: Answer): number | null;
}

/** Why the strategy answered as it did. */
export type PromptReason = "chainSpent" | "valuation" | "heuristic";

export interface PromptDecision {
  readonly answer: Answer;
  readonly reason: PromptReason;
  /** Answers the answer valuation scored. */
  readonly scored: number;
}

/** Whether an immediate exact contribution favors its card's controller: a gain for it, or removal of the opponent's characters. */
function favorable(contribution: FeatureContribution): boolean {
  if (contribution.qualifiers.length > 0 || contribution.amount.kind !== "exact") return false;
  if (contribution.feature === "removal") return contribution.player === "opponent";
  return contribution.player === "you" && contribution.amount.value > 0;
}

/**
 * Card valuation from `side`'s view and the printed cards' AST features: a
 * card's effective spark (an event's cost), plus one for each immediate
 * exact contribution its abilities make in its controller's favor. A card
 * the view does not show has no value.
 */
export function featureCardValue(view: BattleView, side: Side, features: (cardId: CardId) => CardFeatures): (id: InstanceId) => CardValue | null {
  return (id) => {
    const instance = view.instances[id];
    if (instance === undefined) return null;
    const { spark, cost } = instance.characteristics;
    const printed = instance.printing.kind === "figment" ? null : features(instance.printing.cardId);
    const bonus = printed === null ? 0 : printed.base.flatMap((ability) => ability.contributions).filter(favorable).length;
    return { mine: instance.controller === side, value: (spark ?? cost) + bonus };
  };
}

/** How a role's selection is wanted: cards the chooser loses, cards it gains, or cards it acts against. */
type Orientation = "loss" | "gain" | "hostile";

const ORIENTATION = {
  discardToHandLimit: "loss",
  playRoute: "hostile",
  voidRoute: "hostile",
  chooseX: "hostile",
  chooseOne: "hostile",
  choosePlayer: "hostile",
  chooseSubtype: "hostile",
  move: "hostile",
  target: "hostile",
  chooseCost: "hostile",
  optionalCost: "hostile",
  optionalPayment: "hostile",
  abandonCost: "loss",
  abandon: "loss",
  keep: "gain",
  returnCost: "loss",
  discardCost: "loss",
  revealCost: "loss",
  banishCost: "loss",
  banishAnyVoidCost: "hostile",
  offeringCost: "loss",
  discard: "loss",
  discardChosen: "hostile",
  banishChosen: "hostile",
  restrictChosen: "hostile",
  foresee: "hostile",
  lookAtTop: "gain",
  lookAtTopBanish: "gain",
  discover: "gain",
  materializeChosen: "gain",
  discoverCost: "hostile",
  chooseAmong: "gain",
  chooseFromOpponentHand: "gain",
  shuffleInto: "loss",
  putInDeck: "gain",
  youMay: "hostile",
  preventUnlessPays: "hostile",
  opponentUnlessPays: "hostile",
  preventUnlessAbandons: "hostile",
} as const satisfies Record<PromptRole, Orientation>;

/** How much the chooser wants a card chosen for a prompt of `role`: positive to choose it. */
function want(role: PromptRole, card: CardValue | null): number {
  if (card === null) return 0;
  switch (ORIENTATION[role]) {
    case "loss": return -card.value - 1;
    case "gain": return card.value + 1;
    case "hostile": return card.mine ? -card.value - 1 : card.value + 1;
  }
}

function discoverCost(prompt: ChooseNumberPrompt, costs: ReadonlySet<number>): number {
  const found = [...costs].filter((cost) => cost >= prompt.min && cost <= prompt.max);
  return found.length === 0 ? prompt.max : Math.max(...found);
}

function subtype(prompt: ChooseModePrompt, counts: ReadonlyMap<CardSubtype, number>): number | null {
  let best: { readonly mode: number; readonly count: number } | null = null;
  for (const option of prompt.options) {
    const type = prompt.subtypes?.[option.mode];
    if (!option.legal || type === undefined) continue;
    const count = counts.get(type) ?? 0;
    if (best === null || count > best.count) best = { mode: option.mode, count };
  }
  return best?.mode ?? null;
}

/** The answer by card valuation and the prompt's role, without simulation. */
function heuristicAnswer(prompt: Prompt, ctx: ExpertPromptContext, weights: ExpertPromptWeights): Answer {
  const role = prompt.purpose.role;
  switch (prompt.kind) {
    case "confirm":
      return true;
    case "payOrDecline":
      return prompt.payable && prompt.energy <= ctx.energy && prompt.energy <= weights.cheapUnlessCost;
    case "chooseNumber":
      return role === "discoverCost" ? discoverCost(prompt, ctx.discoverCosts(prompt)) : prompt.max;
    case "chooseMode":
      return (role === "chooseSubtype" ? subtype(prompt, ctx.subtypeCounts(prompt)) : null) ?? firstLegalAnswer(prompt);
    case "chooseSlot":
    case "arrange":
      return firstLegalAnswer(prompt);
    case "chooseTargets":
    case "chooseCards": {
      const ranked = prompt.candidates
        .map((card, index) => ({ card, index, want: want(role, ctx.cardValue(card)) }))
        .sort((a, b) => b.want - a.want || a.index - b.index);
      const wanted = ranked.filter((entry) => entry.want > 0).length;
      const count = Math.min(prompt.max, Math.max(prompt.min, wanted));
      return ranked.slice(0, count).map((entry) => entry.card);
    }
  }
}

/** A legal answer to `prompt` for `ctx.side`, by valuation. */
export function expertAnswer(prompt: Prompt, ctx: ExpertPromptContext, weights: ExpertPromptWeights): PromptDecision {
  if (prompt.side !== ctx.side) throw new Error(`a ${prompt.side} prompt answered for ${ctx.side}`);
  if (greedyDeclinesChain(prompt, ctx.automaticChoices)) return { answer: declineAnswer(prompt), reason: "chainSpent", scored: 0 };
  const heuristic = heuristicAnswer(prompt, ctx, weights);
  const fallback = isLegalAnswer(prompt, heuristic) ? heuristic : firstLegalAnswer(prompt);
  if (ctx.answerValue === undefined) return { answer: fallback, reason: "heuristic", scored: 0 };
  const candidates = [fallback];
  const seen = new Set([canonicalAnswer(prompt, fallback)]);
  for (const answer of legalAnswers(prompt)) {
    if (candidates.length >= weights.scoredAnswers) break;
    const key = canonicalAnswer(prompt, answer);
    if (seen.has(key)) continue;
    seen.add(key);
    candidates.push(answer);
  }
  let best: { readonly answer: Answer; readonly value: number } | null = null;
  let scored = 0;
  for (const answer of candidates) {
    const value = ctx.answerValue(answer);
    if (value === null) continue;
    scored += 1;
    if (best === null || value > best.value) best = { answer, value };
  }
  return best === null ? { answer: fallback, reason: "heuristic", scored } : { answer: best.answer, reason: "valuation", scored };
}
