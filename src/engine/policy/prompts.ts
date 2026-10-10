/**
 * Prompt answering shared by the placeholder policies: the optional-chain
 * bound and Greedy's prompt heuristic.
 *
 * Answering a non-forced prompt during automatic resolution counts as a
 * decision, so the resolution cap never ends a self-retriggering "you may"
 * that a policy keeps accepting (RD-hv-7x4l.20). Every policy therefore
 * declines optional prompts once the run of automatic steps already holds
 * `optionalChainCap` chosen answers (`BattleState.automaticChoices`).
 */
import { AI } from "../../content/ai";
import { instanceCard, type EngineCatalog } from "../catalog";
import { allowedAnswers, firstLegalAnswer, isLegalAnswer } from "../prompts/answers";
import type { Answer, Prompt, PromptRole } from "../prompts/types";
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

/** Roles whose chosen cards the chooser gives up: it picks its least valuable cards, as few as it may. */
const LOSS_ROLES: readonly PromptRole[] = [
  "abandonCost",
  "discardCost",
  "revealCost",
  "banishCost",
  "offeringCost",
  "discard",
  "discardToHandLimit",
];

/** How much Greedy wants `id` chosen for a prompt of `role`. */
function cardWant(role: PromptRole, info: CardInfo | null): number {
  if (info === null) return 0;
  if (LOSS_ROLES.includes(role)) return -info.value - 1;
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
 * "unless" cost it can pay, the largest number, the first legal mode, and
 * for a selection the cards it wants most, giving up its least valuable
 * cards for costs and discards. A prompt that lists its legal answers gets
 * the best of them. After the optional chain is spent it declines.
 */
export function greedyAnswer(prompt: Prompt, info: CardInfoOf, automaticChoices: number): Answer {
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
      value = prompt.max;
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
