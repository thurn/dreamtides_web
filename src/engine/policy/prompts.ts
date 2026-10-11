/**
 * Prompt answering shared by the placeholder policies: the optional-chain
 * bound and Greedy's prompt heuristic.
 *
 * Greedy reads a free Discover cost choice from the deck of a state sampled
 * from its own view (D22): the cards its decklist has left there, never the
 * battle's hidden deck.
 *
 * Answering a non-forced prompt during automatic resolution counts as a
 * decision, so the resolution cap never ends a self-retriggering "you may"
 * that a policy keeps accepting (RD-hv-7x4l.20). Every policy therefore
 * declines optional prompts once the run of automatic steps already holds
 * `optionalChainCap` chosen answers (`BattleState.automaticChoices`).
 */
import { AI } from "../../content/ai";
import { instanceCard, type EngineCatalog } from "../catalog";
import { discoverableCosts } from "../effects/primitives/discover";
import { allowedAnswers, firstLegalAnswer, isLegalAnswer } from "../prompts/answers";
import type { Answer, ChooseNumberPrompt, Prompt, PromptRole } from "../prompts/types";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import type { BattleView } from "../view/view";

/** Whether a run of automatic steps has used up the optional choices a policy accepts. */
export function optionalChainSpent(automaticChoices: number): boolean {
  return automaticChoices >= AI.enginePolicy.optionalChainCap;
}

/** How much accepting an answer commits: lower is more of a decline. */
function acceptance(value: Answer): number {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number") return value;
  return value.length;
}

/**
 * The legal answer that accepts least: no to a "you may" or an "unless"
 * cost, the fewest cards, the lowest number, the first legal mode.
 */
export function declineAnswer(prompt: Prompt): Answer {
  const allowed = allowedAnswers(prompt);
  if (allowed !== undefined && allowed.length > 0) {
    return allowed.reduce((best, answer) => (acceptance(answer) < acceptance(best) ? answer : best));
  }
  let value: Answer;
  switch (prompt.kind) {
    case "confirm":
    case "payOrDecline":
      value = false;
      break;
    case "chooseTargets":
    case "chooseCards":
      value = prompt.candidates.slice(0, prompt.min);
      break;
    case "chooseNumber":
      value = prompt.min;
      break;
    case "chooseMode":
    case "arrange":
      value = firstLegalAnswer(prompt);
      break;
  }
  return isLegalAnswer(prompt, value) ? value : firstLegalAnswer(prompt);
}

/** What Greedy knows of a candidate card: whether the chooser controls it, and its value (spark, else cost). */
export interface CardInfo {
  readonly mine: boolean;
  readonly value: number;
}

export type CardInfoOf = (id: InstanceId) => CardInfo | null;

/** Card info from a side's view, for a live prompt. */
export function viewCardInfo(view: BattleView, side: Side): CardInfoOf {
  return (id) => {
    const instance = view.instances[id];
    if (instance === undefined) return null;
    const { spark, cost } = instance.characteristics;
    return { mine: instance.controller === side, value: spark ?? cost };
  };
}

/**
 * Card info from a determinized state mid-step, for a simulated prompt:
 * printed spark plus permanent gains, since a step's work state is not a
 * committed state the characteristics memo may cache.
 */
export function stateCardInfo(state: BattleState, catalog: EngineCatalog, side: Side): CardInfoOf {
  return (id) => {
    const instance = state.instances[id];
    if (instance === undefined) return null;
    const printed = instanceCard(catalog, instance);
    const spark = printed.spark === null ? null : printed.spark === "x" ? (instance.status.x ?? 0) : printed.spark;
    const cost = printed.costs.reduce((total, cost) => total + (cost.cost === "energy" ? cost.amount : 0), 0);
    return {
      mine: instance.controller === side,
      value: spark === null ? cost : spark + instance.status.gainedSpark,
    };
  };
}

/** The costs at which a free Discover cost choice finds a card, as the chooser sees its own deck. */
export type DiscoverCostsOf = (prompt: ChooseNumberPrompt) => ReadonlySet<number>;

/**
 * Discover costs from a determinized state: one sampled from the chooser's
 * view, or a simulation's work state descended from one.
 */
export function stateDiscoverCosts(state: BattleState, catalog: EngineCatalog): DiscoverCostsOf {
  return (prompt) => discoverableCosts(state, catalog, prompt.side, prompt.purpose);
}

/**
 * The cost Greedy names for a free Discover cost choice: the highest cost in
 * range at which its deck holds a matching card, the most valuable find by
 * Greedy's cost-as-value reading; the canonical no-match maximum only when
 * no cost finds a card.
 */
function discoverCostAnswer(prompt: ChooseNumberPrompt, costs: ReadonlySet<number>): number {
  const found = [...costs].filter((cost) => cost >= prompt.min && cost <= prompt.max);
  return found.length === 0 ? prompt.max : Math.max(...found);
}

/** Every role registers its card ranking and number choice, including roles used by other prompt kinds. */
const ROLE_STRATEGIES = {
  discardToHandLimit: { cards: "loss", number: "largest" },
  playRoute: { cards: "hostile", number: "largest" },
  chooseX: { cards: "hostile", number: "largest" },
  chooseOne: { cards: "hostile", number: "largest" },
  choosePlayer: { cards: "hostile", number: "largest" },
  target: { cards: "hostile", number: "largest" },
  chooseCost: { cards: "hostile", number: "largest" },
  optionalCost: { cards: "hostile", number: "largest" },
  optionalPayment: { cards: "hostile", number: "largest" },
  abandonCost: { cards: "loss", number: "largest" },
  abandon: { cards: "loss", number: "largest" },
  discardCost: { cards: "loss", number: "largest" },
  revealCost: { cards: "loss", number: "largest" },
  banishCost: { cards: "loss", number: "largest" },
  offeringCost: { cards: "loss", number: "largest" },
  discard: { cards: "loss", number: "largest" },
  discardChosen: { cards: "hostile", number: "largest" },
  banishChosen: { cards: "hostile", number: "largest" },
  foresee: { cards: "hostile", number: "largest" },
  lookAtTop: { cards: "gain", number: "largest" },
  discover: { cards: "gain", number: "largest" },
  discoverCost: { cards: "hostile", number: "discoverCost" },
  chooseAmong: { cards: "gain", number: "largest" },
  chooseFromOpponentHand: { cards: "gain", number: "largest" },
  shuffleInto: { cards: "loss", number: "largest" },
  putInDeck: { cards: "gain", number: "largest" },
  youMay: { cards: "hostile", number: "largest" },
  preventUnlessPays: { cards: "hostile", number: "largest" },
} as const satisfies Record<PromptRole, { readonly cards: "loss" | "gain" | "hostile"; readonly number: "largest" | "discoverCost" }>;

/** How much Greedy wants `id` chosen for a prompt of `role`. */
function cardWant(role: PromptRole, info: CardInfo | null): number {
  if (info === null) return 0;
  if (ROLE_STRATEGIES[role].cards === "loss") return -info.value - 1;
  if (ROLE_STRATEGIES[role].cards === "gain") return info.value + 1;
  // A target is assumed hostile: the opponent's most valuable card first.
  return info.mine ? -info.value - 1 : info.value + 1;
}

/** How much Greedy wants a selection: the sum of its cards' wants. */
function selectionWant(role: PromptRole, cards: readonly InstanceId[], info: CardInfoOf): number {
  return cards.reduce((total, card) => total + cardWant(role, info(card)), 0);
}

function selectionOf(value: Answer): readonly InstanceId[] | null {
  return Array.isArray(value) && value.every((item) => typeof item === "string") ? (value as readonly InstanceId[]) : null;
}

/**
 * Greedy's answer to a prompt, without search: accept a "you may", pay an
 * "unless" cost it can pay, the largest number (for a free Discover cost,
 * the highest cost its deck can find), the first legal mode, and for a
 * selection the cards it wants most, giving up its least valuable cards for
 * costs and discards. A prompt that lists its legal answers gets the best of
 * them. After the optional chain is spent it declines.
 */
export function greedyAnswer(prompt: Prompt, info: CardInfoOf, discoverCosts: DiscoverCostsOf, automaticChoices: number): Answer {
  if (optionalChainSpent(automaticChoices)) return declineAnswer(prompt);
  const allowed = allowedAnswers(prompt);
  if (allowed !== undefined && allowed.length > 0) {
    if (prompt.kind !== "chooseTargets" && prompt.kind !== "chooseCards") {
      return allowed.reduce((best, answer) => (acceptance(answer) > acceptance(best) ? answer : best));
    }
    const want = (answer: Answer): number => selectionWant(prompt.purpose.role, selectionOf(answer) ?? [], info);
    return allowed.reduce((best, answer) => (want(answer) > want(best) ? answer : best));
  }
  let value: Answer;
  switch (prompt.kind) {
    case "confirm":
      value = true;
      break;
    case "payOrDecline":
      value = prompt.payable;
      break;
    case "chooseNumber":
      value = ROLE_STRATEGIES[prompt.purpose.role].number === "discoverCost" ? discoverCostAnswer(prompt, discoverCosts(prompt)) : prompt.max;
      break;
    case "chooseMode":
    case "arrange":
      value = firstLegalAnswer(prompt);
      break;
    case "chooseTargets":
    case "chooseCards": {
      const ranked = [...prompt.candidates]
        .map((card, index) => ({ card, index, want: cardWant(prompt.purpose.role, info(card)) }))
        .sort((a, b) => b.want - a.want || a.index - b.index);
      const wanted = ranked.filter((entry) => entry.want > 0).length;
      const count = Math.min(prompt.max, Math.max(prompt.min, wanted));
      value = ranked.slice(0, count).map((entry) => entry.card);
      break;
    }
  }
  return isLegalAnswer(prompt, value) ? value : firstLegalAnswer(prompt);
}
