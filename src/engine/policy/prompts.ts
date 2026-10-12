/**
 * Prompt answering shared by the placeholder policies: the optional-chain
 * bound and Greedy's prompt heuristic.
 *
 * Greedy reads a free Discover cost choice from the deck of a state sampled
 * from its own view (D22): the cards its decklist has left there, never the
 * battle's hidden deck. It names a character type from the same kind of
 * state: the type most of its characters in play and in its deck have.
 *
 * Answering a non-forced prompt during automatic resolution counts as a
 * decision, so the resolution cap never ends a self-retriggering "you may"
 * that a policy keeps accepting (RD-hv-7x4l.20). Every policy therefore
 * declines optional prompts once the run of automatic steps already holds
 * `optionalChainCap` chosen answers (`BattleState.automaticChoices`). Greedy
 * declines only a role whose prompt can sustain such a chain (`chain:
 * "loopable"`); it keeps answering a finite choice, such as an "unless" cost
 * that keeps its own card on the stack, as it would before the cap.
 */
import { AI } from "../../content/ai";
import { instanceCard, type EngineCatalog } from "../catalog";
import { discoverableCosts } from "../effects/primitives/discover";
import { allowedAnswers, firstLegalAnswer, isLegalAnswer } from "../prompts/answers";
import type { CardSubtype } from "../../types/card-identity";
import type { Answer, ChooseModePrompt, ChooseNumberPrompt, Prompt, PromptRole } from "../prompts/types";
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
    case "chooseSlot":
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

/** How many characters of each type the chooser of a character type choice has, in play and in its deck. */
export type SubtypeCountsOf = (prompt: ChooseModePrompt) => ReadonlyMap<CardSubtype, number>;

/**
 * Character type counts from a determinized state: the printed type of each
 * character the chooser controls in play and of each character card in its
 * deck, as `stateCardInfo` reads printed values from a step's work state.
 */
export function stateSubtypeCounts(state: BattleState, catalog: EngineCatalog): SubtypeCountsOf {
  return (prompt) => {
    const side = state.sides[prompt.side];
    const counts = new Map<CardSubtype, number>();
    const ids = [...side.frontRank, ...side.backRank, ...side.deck];
    for (const id of ids) {
      const instance = id === null ? undefined : state.instances[id];
      if (instance === undefined) continue;
      const card = instanceCard(catalog, instance);
      if (card.cardType === "character") counts.set(card.subtype, (counts.get(card.subtype) ?? 0) + 1);
    }
    return counts;
  };
}

/** The type Greedy names: the offered type it has most characters of, the first offered on a tie. */
function subtypeAnswer(prompt: ChooseModePrompt, counts: ReadonlyMap<CardSubtype, number>): Answer {
  let best: { readonly mode: number; readonly count: number } | null = null;
  for (const option of prompt.options) {
    const type = prompt.subtypes?.[option.mode];
    if (!option.legal || type === undefined) continue;
    const count = counts.get(type) ?? 0;
    if (best === null || count > best.count) best = { mode: option.mode, count };
  }
  return best?.mode ?? firstLegalAnswer(prompt);
}

/**
 * Every role registers its card ranking, its number choice, and how the
 * optional-chain bound treats it, including roles used by other prompt kinds.
 *
 * `chain: "loopable"`: the chooser decides how much of its own effect
 * happens (a "you may", an optional payment, how many targets or cards,
 * which mode or route), so a policy that keeps accepting can sustain a
 * self-retriggering chain; once the chain is spent Greedy declines it.
 *
 * `chain: "finite"`: every legal answer commits the chooser to the same
 * fixed amount (exactly N cards, a free cost to look for), or the prompt is
 * an "unless" cost paid in a finite resource against the opposing side's
 * prevent. Declining it is not doing less of the chooser's own effect, so it
 * cannot end a chain the chooser drives, and Greedy answers it the same past
 * the cap.
 *
 * Play-time roles (routes, X, cost alternatives, optional costs, and the
 * cards that pay a cost) are raised only in top-level steps, which start a
 * new run, so the bound never reaches them; they stay loopable because an
 * optional cost or a variable ("X") count chooses how much to pay.
 */
const ROLE_STRATEGIES = {
  // Exactly the excess over the hand limit, once per turn's ending.
  discardToHandLimit: { cards: "loss", number: "largest", chain: "finite" },
  playRoute: { cards: "hostile", number: "largest", chain: "loopable" },
  voidRoute: { cards: "hostile", number: "largest", chain: "loopable" },
  chooseX: { cards: "hostile", number: "largest", chain: "loopable" },
  // A mode or player steers the chooser's own effect, which may be the one that retriggers.
  chooseOne: { cards: "hostile", number: "largest", chain: "loopable" },
  choosePlayer: { cards: "hostile", number: "largest", chain: "loopable" },
  // A type steers the chooser's own effect, as a mode does.
  chooseSubtype: { cards: "hostile", number: "largest", chain: "loopable", mode: "subtype" },
  move: { cards: "hostile", number: "largest", chain: "finite" },
  // An "up to N" target accepts fewer.
  target: { cards: "hostile", number: "largest", chain: "loopable" },
  chooseCost: { cards: "hostile", number: "largest", chain: "loopable" },
  optionalCost: { cards: "hostile", number: "largest", chain: "loopable" },
  // "You may pay N●" for the chooser's own effect; a chain that makes energy can keep paying.
  optionalPayment: { cards: "hostile", number: "largest", chain: "loopable" },
  abandonCost: { cards: "loss", number: "largest", chain: "loopable" },
  returnCost: { cards: "loss", number: "largest", chain: "loopable" },
  // Exactly one character, chosen after an effect or an accepted "unless" cost has committed to it.
  abandon: { cards: "loss", number: "largest", chain: "finite" },
  // Exactly one character stays in play, so which and never how many: the most valuable.
  keep: { cards: "gain", number: "largest", chain: "finite" },
  discardCost: { cards: "loss", number: "largest", chain: "loopable" },
  revealCost: { cards: "loss", number: "largest", chain: "loopable" },
  banishCost: { cards: "loss", number: "largest", chain: "loopable" },
  banishAnyVoidCost: { cards: "hostile", number: "largest", chain: "loopable" },
  offeringCost: { cards: "loss", number: "largest", chain: "loopable" },
  // Exactly N cards, so which and never how many; likewise discardChosen, banishChosen, lookAtTop, discover, and shuffleInto.
  discard: { cards: "loss", number: "largest", chain: "finite" },
  discardChosen: { cards: "hostile", number: "largest", chain: "finite" },
  banishChosen: { cards: "hostile", number: "largest", chain: "finite" },
  // Exactly one opponent hand card, as for discardChosen.
  restrictChosen: { cards: "hostile", number: "largest", chain: "finite" },
  // Where each looked-at card goes steers the chooser's own next draws.
  foresee: { cards: "hostile", number: "largest", chain: "loopable" },
  lookAtTopBanish: { cards: "gain", number: "largest", chain: "finite" },
  lookAtTop: { cards: "gain", number: "largest", chain: "finite" },
  discover: { cards: "gain", number: "largest", chain: "finite" },
  // A free cost to look for, never paid: no answer does less.
  discoverCost: { cards: "hostile", number: "discoverCost", chain: "finite" },
  // An optional take of one card accepts none; a take of several asks its "you may" (youMay) first, then takes the most valuable cards.
  chooseAmong: { cards: "gain", number: "largest", chain: "loopable" },
  chooseFromOpponentHand: { cards: "gain", number: "largest", chain: "loopable" },
  shuffleInto: { cards: "loss", number: "largest", chain: "finite" },
  // A look-at-top arrangement can put cards into the chooser's hand.
  putInDeck: { cards: "gain", number: "largest", chain: "loopable" },
  youMay: { cards: "hostile", number: "largest", chain: "loopable" },
  // "Unless" costs: declining lets the opposing prevent take the chooser's card.
  preventUnlessPays: { cards: "hostile", number: "largest", chain: "finite" },
  opponentUnlessPays: { cards: "hostile", number: "largest", chain: "finite" },
  preventUnlessAbandons: { cards: "hostile", number: "largest", chain: "finite" },
} as const satisfies Record<
  PromptRole,
  {
    readonly cards: "loss" | "gain" | "hostile";
    readonly number: "largest" | "discoverCost";
    readonly chain: "loopable" | "finite";
    /** A mode choice answered other than by its first legal mode: a character type by `subtypeAnswer`. */
    readonly mode?: "subtype";
  }
>;

/** The role's mode strategy, when it has one. */
function modeStrategy(role: PromptRole): "subtype" | undefined {
  const strategy: (typeof ROLE_STRATEGIES)[PromptRole] = ROLE_STRATEGIES[role];
  return "mode" in strategy ? strategy.mode : undefined;
}

/** Whether Greedy declines `prompt` because the optional chain is spent: only a loopable role, past the cap. */
export function greedyDeclinesChain(prompt: Prompt, automaticChoices: number): boolean {
  return ROLE_STRATEGIES[prompt.purpose.role].chain === "loopable" && optionalChainSpent(automaticChoices);
}

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
 * the highest cost its deck can find), the first legal mode (for a
 * character type, the one it has most characters of), and for a
 * selection the cards it wants most, giving up its least valuable cards for
 * costs and discards. A prompt that lists its legal answers gets the best of
 * them. After the optional chain is spent it declines a loopable role's
 * prompt (`greedyDeclinesChain`).
 */
export function greedyAnswer(
  prompt: Prompt,
  info: CardInfoOf,
  discoverCosts: DiscoverCostsOf,
  automaticChoices: number,
  subtypeCounts: SubtypeCountsOf = () => new Map(),
): Answer {
  if (greedyDeclinesChain(prompt, automaticChoices)) return declineAnswer(prompt);
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
      value = modeStrategy(prompt.purpose.role) === "subtype" ? subtypeAnswer(prompt, subtypeCounts(prompt)) : firstLegalAnswer(prompt);
      break;
    case "chooseSlot":
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
