/**
 * Costs of cards and activated abilities (rules § Costs, Requirements, and
 * X). Cost choices — X, which alternative of an "A or B" cost, whether to pay
 * an optional cost, and the cards that pay — are play-time prompts before the
 * commit point; payment happens after it, all before the item goes on the
 * stack.
 */
import type { EngineCatalog, PrintedCard } from "../catalog";
import { cardMatchesFilter, copiableCostOf } from "../continuous/characteristics";
import { adjustedEnergy, NO_COST_MODIFIER, type CostModifier } from "../continuous/costs";
import { matchingCharacters, resolvePlayer } from "../dsl/selectors";
import { fixedEnergy, minimumEnergy, xCost } from "../dsl/energy";
import type { AbandonXCost, AdditionalCost, Cost, PaymentCost, Variant } from "../dsl/types";
import type {
  ChooseCardsPrompt,
  ChooseModePrompt,
  ChooseNumberPrompt,
  ConfirmPrompt,
  PromptPurpose,
  PromptRole,
} from "../prompts/types";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import type { StepContext } from "../steps/types";
import { discardCards, gainPoints, spendEnergy } from "./resources";
import { banish, charactersInPlay, dissolve, instanceOf, returnToHand, slotOf } from "./zones";
import { revealToBoth } from "../view/knowledge";
import { Infeasible } from "../steps/errors";
import { effectiveSpark } from "./spark";

/** A payment cost other than energy, which a plan pays as one total. */
export type NonEnergyCost = Exclude<PaymentCost | AbandonXCost, { readonly cost: "energy" }>;

/** One cost to pay after the commit point, with the cards chosen for it. */
export interface PlannedCost {
  readonly cost: NonEnergyCost;
  readonly cards: readonly InstanceId[];
}

/** How a list of costs will be paid, settled by play-time prompts before the commit point. */
export interface CostPlan {
  /** Shared X chosen for energy, counters or abandonment, or captured from a payment count, a card's copiable cost, or an abandoned character's effective spark. */
  readonly x: number | null;
  /**
   * The whole energy cost — the fixed energy (top-level, and each chosen
   * alternative's and paid optional cost's) plus X — after cost
   * modifications applied to the total (RD-hv-7x4l.7-3). Paid first: the
   * fixed part, then X.
   */
  readonly energy: { readonly fixed: number; readonly x: number };
  /**
   * The costs other than energy to pay, in printed order, with each chosen
   * alternative's costs in place of its choice.
   */
  readonly payments: readonly PlannedCost[];
  /** Whether each optional cost will be paid, in printed order. */
  readonly optionalPaid: readonly boolean[];
}

/**
 * Every cost of playing a card as `variant`: its printed energy, then each
 * additional cost ("To play this card, …") in printed order.
 */
export function playCosts(definition: PrintedCard, variant: Variant): Cost[] {
  return [...definition.costs, ...additionalCosts(definition, variant)];
}

/** A card's additional costs ("To play this card, …") for `variant`, in printed order. */
export function additionalCosts(definition: PrintedCard, variant: Variant): AdditionalCost[] {
  return definition.abilities(variant).flatMap((ability) => (ability.kind === "additionalCost" ? ability.costs : []));
}

/** The count-X form is mandatory and top-level, including directly authored catalog data. */
function isAbandonX(cost: Cost): cost is AbandonXCost {
  return cost.cost === "abandon" && cost.count === "x";
}

function hasNestedAbandonX(costs: readonly Cost[]): boolean {
  return costs.some(cost => cost.cost === "choice" ? cost.options.some(option => option.some(isAbandonX)) :
    cost.cost === "optional" && cost.costs.some(isAbandonX));
}

/** Counter-X is mandatory and top-level, so its binding precedes all immediate targets. */
function hasNestedCounterX(costs: readonly Cost[]): boolean {
  return costs.some(cost => cost.cost === "choice" ? cost.options.some(option => option.some(part => part.cost === "countersX")) :
    cost.cost === "optional" && cost.costs.some(part => part.cost === "countersX"));
}

function invalidCounterMinimum(costs: readonly Cost[]): boolean {
  return costs.some(cost => cost.cost === "countersX" && (!Number.isSafeInteger(cost.min) || cost.min < 0));
}

/**
 * Chooses X before targets for energy-X, counter-X or abandon-X costs. Energy-X is
 * bounded by payable energy after fixed costs and modifications; abandon-X
 * by controlled matching characters and its declared minimum; counter-X by
 * the source budget after fixed counter payments. The feasibility
 * guard further limits answers to jointly payable target and cost choices.
 * Returns null when none of these forms needs numeric preparation.
 */
export function chooseX(
  ctx: StepContext,
  side: Side,
  costs: readonly Cost[],
  purpose: PromptPurpose,
  modifier: CostModifier = NO_COST_MODIFIER,
): number | null {
  if (hasNestedAbandonX(costs)) throw new Infeasible("Abandon X must be a top-level mandatory cost");
  if (hasNestedCounterX(costs) || invalidCounterMinimum(costs)) throw new Infeasible("Counter X requires a valid top-level mandatory cost");
  const variable = xCost(costs);
  const counts = costs.filter(isAbandonX);
  const counterCosts = costs.filter((cost) => cost.cost === "countersX");
  if (variable === null && counts.length === 0 && counterCosts.length === 0) return null;
  const energyMax = variable === null ? Infinity : ctx.state.sides[side].currentEnergy - fixedEnergy(costs) - modifier.increase + modifier.reduction;
  const source = purpose.source;
  if (counts.length > 0 && source === null) throw new Error("An abandon-X choice requires its source");
  const min = Math.max(variable?.min ?? 0, ...counts.map((cost) => cost.min), ...counterCosts.map((cost) => cost.min));
  const counterMax = counterCosts.length === 0 ? Infinity : source === null ? 0 :
    Math.floor((storedCounters(ctx.state, source) - spent(costs, "counters")) / counterCosts.length);
  let max = Math.min(energyMax, counterMax);
  if (counts.length > 0) {
    const ceiling = Math.min(energyMax, counterMax, charactersInPlay(ctx.state, side).length);
    max = -1;
    // Eligibility may vary with X, including holes: the feasibility guard
    // proves each offered number against targets and every payment.
    for (let prospective = min; prospective <= ceiling; prospective += 1) {
      if (counts.every(cost => source !== null && cardCandidates(ctx.state, ctx.catalog, side, source, cost, prospective).length >= prospective)) max = prospective;
    }
    if (max < min) throw new Infeasible("Too few matching characters for abandon X");
  }
  if (counterCosts.length > 0 && max < min) throw new Infeasible("Too few stored counters for the shared X");
  return ctx.choose<ChooseNumberPrompt>({
    kind: "chooseNumber",
    side,
    purpose,
    min,
    max,
  });
}

/**
 * Whether `source` can pay a ☾ cost now: the avatar while ready, or a ready
 * character in its controller's back rank. Front-rank characters, cards in
 * other zones, and dreamsigns cannot pay ☾ (rules § Exhaust and Awaken).
 */
export function canPayExhaust(state: BattleState, source: AbilitySource): boolean {
  if (typeof source !== "string") {
    const avatar = state.sides[source.side].avatar;
    return source.kind === "avatar" && avatar !== null && !avatar.exhausted;
  }
  const instance = state.instances[source];
  return (
    instance?.zone === "play" && !instance.status.exhausted && slotOf(state, source)?.rank === "back"
  );
}

/** Counters stored on `source`: a card's ⧗; an emblem stores none. */
function storedCounters(state: BattleState, source: AbilitySource): number {
  return typeof source === "string" ? (state.instances[source]?.status.counters ?? 0) : 0;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

/** The ⧗ or ⍟ the costs in a list spend, not counting nested alternatives and optional costs. */
function spent(costs: readonly Cost[], kind: "counters" | "points"): number {
  return sum(costs.map((cost) => (cost.cost === kind ? cost.amount : 0)));
}

/** Only the new opponent-grant shape is checked here; ordinary cost validation is unchanged. */
function validOpponentGrants(costs: readonly Cost[]): boolean {
  return costs.every(cost => cost.cost === "choice" ? cost.options.every(validOpponentGrants) :
    cost.cost === "optional" ? validOpponentGrants(cost.costs) :
      cost.cost !== "giveOpponentPoints" || Number.isSafeInteger(cost.amount) && cost.amount > 0);
}

/**
 * Whether `side` could pay the mandatory costs that need no card choice:
 * the energy (with X at its minimum), any ☾, any ⧗, and any ⍟. Legality's
 * feasibility search checks the card choices, alternatives, and optional
 * costs.
 */
export function costsPayable(
  state: BattleState,
  side: Side,
  source: AbilitySource,
  costs: readonly Cost[],
  modifier: CostModifier = NO_COST_MODIFIER,
): boolean {
  if (!validOpponentGrants(costs)) return false;
  if (costs.some(cost => cost.cost === "revealSource") && !canRevealSource(state, side, source)) return false;
  if (hasNestedAbandonX(costs)) return false;
  if (hasNestedCounterX(costs) || invalidCounterMinimum(costs)) return false;
  if (adjustedEnergy(minimumEnergy(costs), modifier) > state.sides[side].currentEnergy) return false;
  if (spent(costs, "counters") + sum(costs.map(cost => cost.cost === "countersX" ? cost.min : 0)) > storedCounters(state, source)) return false;
  if (spent(costs, "points") > state.sides[side].score) return false;
  return costs.every((cost) => cost.cost !== "exhaustSelf" || canPayExhaust(state, source));
}

/** Only the acting holder's physical hand source can pay a source reveal. */
function canRevealSource(state: BattleState, side: Side, source: AbilitySource): boolean {
  return typeof source === "string" && state.instances[source]?.zone === "hand" &&
    state.instances[source].controller === side && state.sides[side].hand.includes(source);
}

/** A cost paid with chosen cards. */
type ChoosingCost = Extract<PaymentCost | AbandonXCost, { readonly count: number | "x" }>;

function choosesCards(cost: PaymentCost | AbandonXCost): cost is ChoosingCost {
  return "count" in cost && cost.count !== "hand";
}

/** "Discard your hand": paid with every eligible hand card, which nobody chooses. */
function discardsHand(cost: PaymentCost | AbandonXCost): boolean {
  return cost.cost === "discard" && cost.count === "hand";
}

/** The declared minimum of a variable abandon, void banish or discard count, else 0. */
function leastCount(cost: ChoosingCost): number {
  if (cost.count !== "x") return 0;
  return cost.cost === "banishFromVoid" || cost.cost === "abandon" ? cost.min : cost.cost === "discard" ? (cost.min ?? 0) : 0;
}

/** The cards that could pay a card-choosing cost, before excluding cards already used. */
function cardCandidates(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  source: AbilitySource,
  cost: ChoosingCost,
  selectorX?: number,
): InstanceId[] {
  switch (cost.cost) {
    case "abandon": {
      if ("kind" in cost.selector) {
        if (typeof source !== "string") return [];
        const instance = state.instances[source];
        return instance?.zone === "play" && instance.controller === side ? [source] : [];
      }
      const matches = matchingCharacters(state, catalog, cost.selector, side, source, selectorX);
      // The explicit count-X form pays only controlled characters, even
      // when authored directly with an unrestricted or opposing selector.
      return cost.count === "x" ? matches.filter(id => state.instances[id]?.controller === side) : matches;
    }
    case "return":
      return matchingCharacters(state, catalog, cost.selector, side, source, selectorX);
    case "discard":
      return state.sides[side].hand.filter((id) => cardMatchesFilter(state, catalog, id, cost.filter));
    case "revealSource":
      return typeof source === "string" && canRevealSource(state, side, source) ? [source] : [];
    case "reveal":
      return state.sides[side].hand.filter((id) => cardMatchesFilter(state, catalog, id, cost.filter));
    case "banishFromAnyVoid": {
      const players = cost.player === "any" ? [side, resolvePlayer(side, "opponent")] : [resolvePlayer(side, cost.player)];
      return players.flatMap((of) => state.sides[of].void.filter((id) => cardMatchesFilter(state, catalog, id, cost.filter)));
    }
    case "banishFromVoid":
      return state.sides[side].void.filter((id) => cardMatchesFilter(state, catalog, id, cost.filter));
    case "banishFromHand":
      return [...state.sides[side].hand];
  }
}

/** The role of the prompt choosing the cards for a cost. */
const CARD_ROLE: Readonly<Record<ChoosingCost["cost"], PromptRole>> = {
  abandon: "abandonCost",
  return: "returnCost",
  discard: "discardCost",
  reveal: "revealCost",
  revealSource: "revealCost",
  banishFromVoid: "banishCost",
  banishFromAnyVoid: "banishAnyVoidCost",
  banishFromHand: "offeringCost",
};

/** A play or activation's local X binding and mandatory captured-card selections before targeting. */
export interface PreparedCostX {
  readonly x: number | null;
  readonly payments: readonly (PlannedCost & { readonly costIndex: number })[];
}

/**
 * Prepares mandatory cost-captured X only when the play or activation's immediate
 * modes or targets read it. Count costs choose a number before targeting;
 * copiable-cost and effective-spark captures choose their actual payment card. These selections
 * are replay-local and planCosts validates them against every other payment
 * and target before the commit point. Targetless protocols retain
 * their printed-order card choices. Energy-X, counter-X and abandon-X preparation use
 * chooseX in either case. Nested choices keep their own planning protocol.
 * Captured-card purposes receive the cost's top-level index; shared numeric X has none.
 */
export function prepareCostX(
  ctx: StepContext,
  side: Side,
  source: AbilitySource,
  costs: readonly Cost[],
  purpose: (role: PromptRole, costIndex?: number) => PromptPurpose,
  targetsNeedX: boolean,
  options: { readonly modifier?: CostModifier; readonly fixedX?: number; readonly excluded?: readonly InstanceId[] } = {},
): PreparedCostX {
  let x = options.fixedX ?? chooseX(ctx, side, costs, purpose("chooseX"), options.modifier);
  const payments: (PlannedCost & { readonly costIndex: number })[] = [];
  if (!targetsNeedX) return { x, payments };
  for (const [index, cost] of costs.entries()) {
    if (cost.cost !== "discard" && cost.cost !== "abandon") continue;
    const capturesSpark = cost.cost === "abandon" && cost.captureSpark === true;
    if (cost.captureCost !== true && !capturesSpark) continue;
    const candidates = cardCandidates(ctx.state, ctx.catalog, side, source, cost, x ?? undefined)
      .filter(id => !options.excluded?.includes(id) && !payments.some(payment => payment.cards.includes(id)));
    const selected = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards", side, purpose: purpose(CARD_ROLE[cost.cost], index), candidates, min: 1, max: 1,
    });
    const cards = candidates.filter(id => selected.includes(id));
    const value = capturesSpark ? effectiveSpark(ctx.state, ctx.catalog, cards[0]) : copiableCostOf(ctx.state, ctx.catalog, cards[0]);
    if (x !== null && x !== value) throw new Infeasible("Captured card payment disagrees with X");
    x = value;
    payments.push({ cost, cards, costIndex: index });
  }
  const counts = costs.filter((cost): cost is ChoosingCost =>
    (cost.cost === "discard" || cost.cost === "banishFromVoid" || cost.cost === "abandon") && cost.count === "x",
  );
  if (x === null && counts.length > 0) {
    const min = Math.max(...counts.map(leastCount));
    const max = Math.min(...counts.map(cost => cardCandidates(ctx.state, ctx.catalog, side, source, cost)
      .filter(id => !options.excluded?.includes(id) && !payments.some(payment => payment.cards.includes(id))).length));
    if (max < min) throw new Infeasible("Too few matching cards for cost-captured X");
    x = ctx.choose<ChooseNumberPrompt>({ kind: "chooseNumber", side, purpose: purpose("chooseX"), min, max });
  }
  return { x, payments };
}

/**
 * Settles how the costs will be paid, as play-time prompts in printed order:
 * which alternative of each "A or B" cost (an alternative is legal when it
 * can be paid on its own), whether to pay each optional cost (asked only when
 * it can be paid), and the cards that pay each card-choosing cost. Cards in `excluded`
 * — the card being played and the ability's targets — and cards chosen for
 * earlier costs are not candidates: a card used to pay a cost is never also
 * a target of the same ability (rules § Targeting). A mandatory cost that
 * cannot be paid raises an empty prompt, and a plan whose energy total the
 * side cannot pay throws `Infeasible`: both are dead ends of that path of
 * answers, so legality's search tries the others and a real run never offers
 * an answer that leads to one (steps/feasibility.ts). "Discard your hand"
 * asks nothing: it takes every card left in the payer's hand once the
 * excluded and earlier cost cards are set aside, none from an empty hand,
 * and leaves a later cost no hand card to choose (RD-hv-umm2.334-1). Every
 * energy part — top-level, X, and the chosen alternatives' and optional costs' — is one
 * total that `modifier` changes, so an alternative or an optional cost is
 * affordable when the modified total is. `endsPlayTime` is reserved for a
 * caller whose next operation is the commit point: it allows a final discard
 * or void banish (from the payer's void or a selected void) with
 * already-payable resources to prove all its card selections at once.
 * Character-cost selectors use the current shared payment X. `selectorX` supplies
 * a fallback during play or activation. Callers with no explicit binding, including manual planning,
 * use the source card's stored X. `preparedPayments` carries mandatory
 * copiable-cost or effective-spark captures selected before immediate targeting; these cards
 * must still be available and distinct from targets and earlier payments.
 * Prepared captures retain their owning top-level cost index, even when descriptors
 * are reused. Payment purposes receive that index, including nested leaves.
 */
export function planCosts(
  ctx: StepContext,
  side: Side,
  source: AbilitySource,
  costs: readonly Cost[],
  x: number | null,
  purpose: (role: PromptRole, costIndex?: number) => PromptPurpose,
  excluded: readonly InstanceId[],
  modifier: CostModifier = NO_COST_MODIFIER,
  options: { readonly endsPlayTime?: true; readonly selectorX?: number; readonly preparedPayments?: PreparedCostX["payments"] } = {},
): CostPlan {
  if (!validOpponentGrants(costs)) throw new Infeasible("Opponent-point payments require positive safe integers");
  if (hasNestedAbandonX(costs)) throw new Infeasible("Abandon X must be a top-level mandatory cost");
  if (hasNestedCounterX(costs) || invalidCounterMinimum(costs)) throw new Infeasible("Counter X requires a valid top-level mandatory cost");
  const { state, catalog } = ctx;
  const used = [...excluded];
  const available = state.sides[side].currentEnergy;
  /** The energy committed so far before cost modifications: the top-level parts and X, then each chosen nested part. */
  const energyX = xCost(costs) === null ? 0 : (x ?? 0);
  let baseEnergy = fixedEnergy(costs) + energyX;
  let countersLeft = storedCounters(state, source) - spent(costs, "counters") -
    sum(costs.map(cost => cost.cost === "countersX" ? (x ?? cost.min) : 0));
  /** The payer's ⍟ left once the top-level and chosen nested ⍟ costs are paid; never below 0 for a payable plan. */
  let pointsLeft = state.sides[side].score - spent(costs, "points");
  let exhaustCount = costs.filter((cost) => cost.cost === "exhaustSelf").length;
  const exhaustCapacity = canPayExhaust(state, source) ? 1 : 0;
  /** Shared resource check for nested choices, terminal proofs and the completed plan. */
  const resourcesPayable = (energy = baseEnergy, counters = countersLeft, exhausts = exhaustCount, points = pointsLeft): boolean =>
    adjustedEnergy(energy, modifier) <= available && counters >= 0 && exhausts <= exhaustCapacity && points >= 0;
  const payments: PlannedCost[] = [];
  const optionalPaid: boolean[] = [];
  let capturedX = x;
  let sourceDeparted = false;
  // Returning or abandoning leaves play and clears counters; zero payments need no source.
  const leavesPlay = (cost: PaymentCost | AbandonXCost): boolean => cost.cost === "return" || cost.cost === "abandon";
  const cannotFollowDeparture = (cost: PaymentCost | AbandonXCost): boolean => cost.cost === "exhaustSelf" ||
    (cost.cost === "counters" && cost.amount > 0) || (cost.cost === "countersX" && (capturedX ?? cost.min) > 0);

  /**
   * Whether every cost in a nested list could be paid on top of what is
   * already committed. Its card costs need distinct cards among the cards
   * not yet used, which a matching of cards to needs decides exactly
   * (`cardsAssignable`).
   */
  const affordable = (list: readonly PaymentCost[]): boolean => {
    if (!validOpponentGrants(list)) return false;
    if (sourceDeparted && list.some(cannotFollowDeparture)) return false;
    if (!resourcesPayable(
      baseEnergy + sum(list.map((cost) => (cost.cost === "energy" ? cost.amount : 0))),
      countersLeft - spent(list, "counters"),
      exhaustCount + list.filter((cost) => cost.cost === "exhaustSelf").length,
      pointsLeft - spent(list, "points"),
    )) return false;
    const choosing = list.flatMap((cost, index) => choosesCards(cost) ? [{ cost, index }] : []);
    /** Where a whole-hand discard in the list leaves later costs no hand card. */
    const handTaken = list.findIndex(discardsHand);
    const hand = state.sides[side].hand;
    if (choosing.some(({ cost }) => cost.count === "x" && capturedX !== null && capturedX < leastCount(cost))) return false;
    const demands = choosing.map(({ cost, index }) => ({
      count: cost.count === "x" ? (capturedX ?? leastCount(cost)) : cost.count,
      pool: cardCandidates(state, catalog, side, source, cost, capturedX ?? options.selectorX).filter((id) =>
        !used.includes(id) && !(handTaken >= 0 && index > handTaken && hand.includes(id)) &&
        !(leavesPlay(cost) && id === source && list.slice(index + 1).some(cannotFollowDeparture)),
      ),
    }));
    return cardsAssignable(demands);
  };

  /** Plans one payment cost; `nested` costs are budgeted here, top-level parts were budgeted up front. */
  const plan = (cost: PaymentCost | AbandonXCost, nested: boolean, costIndex: number, isLast = false): void => {
    if (cost.cost === "revealSource" && payments.some(payment => discardsHand(payment.cost))) {
      throw new Infeasible("Source reveal cannot follow a chosen whole-hand discard");
    }
    if (sourceDeparted && cannotFollowDeparture(cost)) throw new Infeasible("A departed source cannot pay a later source cost");
    if (cost.cost === "revealSource") {
      if (typeof source !== "string" || !canRevealSource(state, side, source) || used.includes(source)) {
        throw new Infeasible("Source reveal needs its distinct physical hand source");
      }
      used.push(source);
      payments.push({ cost, cards: [source] });
      return;
    }
    if (cost.cost === "countersX") {
      if (capturedX === null || !Number.isSafeInteger(capturedX) || capturedX < cost.min) throw new Infeasible("Counter X needs its prepared binding");
      payments.push({ cost, cards: [] });
      return;
    }
    if (cost.cost === "energy") {
      if (nested) baseEnergy += cost.amount;
      return;
    }
    if (nested) {
      if (cost.cost === "counters") countersLeft -= cost.amount;
      if (cost.cost === "points") pointsLeft -= cost.amount;
      if (cost.cost === "exhaustSelf") exhaustCount += 1;
    }
    if (discardsHand(cost)) {
      // Nobody chooses: the hand as the costs are planned, less the source and the cards already used.
      const cards = state.sides[side].hand.filter((id) => id !== source && !used.includes(id));
      used.push(...cards);
      payments.push({ cost, cards });
      return;
    }
    if (!choosesCards(cost)) {
      payments.push({ cost, cards: [] });
      return;
    }
    const candidates = cardCandidates(state, catalog, side, source, cost, capturedX ?? options.selectorX);
    const variable = cost.count === "x";
    const count = variable ? capturedX : cost.count;
    // An X bound earlier below a variable count's least X leaves no count to choose.
    if (variable && capturedX !== null && capturedX < leastCount(cost)) throw new Infeasible("X is below the count's least value");
    const remaining = candidates.filter((id) => !used.includes(id));
    // Only the official play/activate callers certify that this plan is
    // immediately followed by the commit point. This last discard, payer-void
    // banish, or fixed-count banish from a selected void cannot affect energy,
    // remaining costs, or a captured-cost equality constraint: a variable
    // count bound earlier is fixed here.
    const allAnswersPayable = options.endsPlayTime === true && !nested && isLast &&
      (cost.cost === "discard" || cost.cost === "banishFromVoid" || cost.cost === "banishFromAnyVoid") &&
      !("captureCost" in cost && cost.captureCost === true) && resourcesPayable();
    const prepared = nested ? undefined : options.preparedPayments?.find(payment => payment.costIndex === costIndex);
    if (prepared !== undefined && (
      prepared.cards.length !== (count ?? leastCount(cost)) ||
      prepared.cards.some(id => !remaining.includes(id)) ||
      new Set(prepared.cards).size !== prepared.cards.length
    )) throw new Infeasible("Prepared cost cards conflict with targets or another payment");
    const selected = prepared?.cards ?? ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      purpose: purpose(CARD_ROLE[cost.cost], costIndex),
      candidates: remaining,
      min: count ?? leastCount(cost),
      // Too few candidates for the least X is an empty prompt, a dead end like a short fixed count.
      max: count ?? Math.max(remaining.length, leastCount(cost)),
    }, allAnswersPayable ? { allAnswersPayable: true } : undefined);
    const selectedIds = new Set(selected);
    const chosen = remaining.filter((id) => selectedIds.has(id));
    // Capture against the whole prepayment board, before any payment removes
    // a Support or static source, including for a figment that then ceases.
    const capturesSpark = cost.cost === "abandon" && cost.captureSpark === true;
    const captures = capturesSpark || ("captureCost" in cost && cost.captureCost === true);
    if (captures || variable) {
      if (captures && chosen.length !== 1) throw new Error("A captured cost value requires exactly one card");
      const value = capturesSpark ? effectiveSpark(state, catalog, chosen[0]) : captures ? copiableCostOf(state, catalog, chosen[0]) : chosen.length;
      if (capturedX !== null && capturedX !== value) throw new Infeasible("Card payment disagrees with X");
      capturedX = value;
    }
    if (leavesPlay(cost) && typeof source === "string" && chosen.includes(source)) sourceDeparted = true;
    used.push(...chosen);
    payments.push({ cost, cards: [...chosen] });
  };

  for (const [index, cost] of costs.entries()) {
    switch (cost.cost) {
      case "energyX":
        break;
      case "choice": {
        const choice = ctx.choose<ChooseModePrompt>({
          kind: "chooseMode",
          side,
          purpose: purpose("chooseCost", index),
          costOptions: cost.options,
          options: cost.options.map((option, index) => ({ mode: index, legal: affordable(option) })),
        });
        for (const part of cost.options[choice] ?? []) plan(part, true, index);
        break;
      }
      case "optional": {
        const pays =
          affordable(cost.costs) &&
          ctx.choose<ConfirmPrompt>({ kind: "confirm", side, purpose: purpose("optionalCost", index) });
        optionalPaid.push(pays);
        if (pays) for (const part of cost.costs) plan(part, true, index);
        break;
      }
      default:
        plan(cost, false, index, index === costs.length - 1);
    }
  }
  const total = adjustedEnergy(baseEnergy, modifier);
  // Every completed plan uses the same resource check as its nested choices
  // and terminal proof: an unaffordable plan is a dead end before commitment.
  if (!resourcesPayable()) throw new Infeasible(`${side} cannot pay the planned resources`);
  const fixed = Math.min(total, adjustedEnergy(baseEnergy - energyX, modifier));
  return { x: capturedX, energy: { fixed, x: total - fixed }, payments, optionalPaid };
}

/** One card-choosing cost's need: how many distinct cards, from which candidates. */
export interface CardDemand {
  readonly count: number;
  readonly pool: readonly InstanceId[];
}

/**
 * Whether the demands can be met with distinct cards: whether a matching of
 * each card needed to one of its demand's candidates, no card used twice,
 * covers every card needed. Augmenting paths (Kuhn's algorithm) find one in
 * time polynomial in the cards needed and the candidates, for any number of
 * demands.
 */
export function cardsAssignable(demands: readonly CardDemand[]): boolean {
  const needs = demands.flatMap((demand) => Array.from({ length: demand.count }, () => demand.pool));
  if (needs.length > new Set(demands.flatMap((demand) => demand.pool)).size) return false;
  /** The need each card is matched to. */
  const matched = new Map<InstanceId, number>();
  const augment = (need: number, visited: Set<InstanceId>): boolean => {
    for (const card of needs[need] ?? []) {
      if (visited.has(card)) continue;
      visited.add(card);
      const other = matched.get(card);
      if (other === undefined || augment(other, visited)) {
        matched.set(card, need);
        return true;
      }
    }
    return false;
  };
  return needs.every((_, need) => augment(need, new Set()));
}

/** Exhausts a source to pay a ☾ cost. */
function exhaustForCost(ctx: StepContext, source: AbilitySource): void {
  if (typeof source !== "string") {
    const avatar = ctx.state.sides[source.side].avatar;
    if (source.kind !== "avatar" || avatar === null) throw new Error("only an avatar emblem pays ☾");
    avatar.exhausted = true;
    ctx.emit({ kind: "avatarExhaustionChanged", side: source.side, exhausted: true });
    return;
  }
  instanceOf(ctx.state, source).status.exhausted = true;
  ctx.emit({ kind: "exhaustionChanged", instance: source, exhausted: true });
}

/** Spends ⧗ stored on a card to pay a cost. */
function spendCounters(ctx: StepContext, source: AbilitySource, amount: number): void {
  if (amount === 0) return;
  if (typeof source !== "string") throw new Error("an emblem stores no counters");
  const status = instanceOf(ctx.state, source).status;
  if (amount > status.counters) throw new Error(`${source} cannot pay ${String(amount)}⧗`);
  status.counters -= amount;
  ctx.emit({ kind: "countersChanged", instance: source, counters: status.counters });
}

/**
 * Abandons a character `side` controls (rules § Abandon): it is dissolved by
 * no effect, so it fires ▸Dissolved, and a figment ceases to exist after
 * firing it.
 */
export function abandonCharacter(ctx: StepContext, side: Side, id: InstanceId): void {
  if (instanceOf(ctx.state, id).controller !== side) throw new Error(`${side} cannot abandon ${id}`);
  dissolve(ctx, id, null, true);
}

/**
 * Pays ⍟ `side` has (rules § Costs, Requirements, and X → Paying ⍟): its
 * score drops by exactly `amount`, announced as a loss of points. A plan
 * never pays more ⍟ than its payer has, so the score never clamps here.
 */
function payPoints(ctx: StepContext, side: Side, amount: number): void {
  if (amount > ctx.state.sides[side].score) throw new Error(`${side} cannot pay ${String(amount)}⍟`);
  gainPoints(ctx, side, -amount, "effect");
}

/** Pays every planned cost after the commit point: the whole energy cost first (the fixed part, then X), then the rest in order. */
export function payCosts(ctx: StepContext, side: Side, source: AbilitySource, plan: CostPlan,
  options: { readonly retainSourceCounters?: true } = {},
): number | null {
  for (const [index, payment] of plan.payments.entries()) {
    if (payment.cost.cost !== "revealSource") continue;
    if (typeof source !== "string" || !canRevealSource(ctx.state, side, source) || payment.cards.length !== 1 || payment.cards[0] !== source ||
      plan.payments.some((other, otherIndex) => otherIndex !== index && other.cards.includes(source)) ||
      plan.payments.slice(0, index).some(other => discardsHand(other.cost))) {
      throw new Infeasible("Source reveal needs its distinct physical hand source");
    }
  }
  let paymentSourceCounters: number | null = null;
  spendEnergy(ctx, side, plan.energy.fixed);
  spendEnergy(ctx, side, plan.energy.x);
  for (const { cost, cards } of plan.payments) {
    if (options.retainSourceCounters === true && typeof source === "string" && cards.includes(source) &&
      (cost.cost === "abandon" || cost.cost === "return") && ctx.state.instances[source]?.zone === "play") {
      paymentSourceCounters = storedCounters(ctx.state, source);
    }
    switch (cost.cost) {
      case "exhaustSelf":
        exhaustForCost(ctx, source);
        break;
      case "counters":
        spendCounters(ctx, source, cost.amount);
        break;
      case "countersX":
        if (plan.x === null || !Number.isSafeInteger(plan.x) || plan.x < cost.min) throw new Error("A counter-X payment needs its chosen X");
        spendCounters(ctx, source, plan.x);
        break;
      case "giveOpponentPoints":
        if (!validOpponentGrants([cost])) throw new Error("Opponent-point payments require positive safe integers");
        gainPoints(ctx, opponent(side), cost.amount, "effect");
        break;
      case "points":
        payPoints(ctx, side, cost.amount);
        break;
      case "abandon":
        for (const id of cards) abandonCharacter(ctx, side, id);
        break;
      case "return":
        for (const id of cards) {
          if (instanceOf(ctx.state, id).controller !== side) throw new Error(`${side} cannot return ${id} to pay a cost`);
          returnToHand(ctx, id);
        }
        break;
      case "discard":
        discardCards(ctx, side, cards);
        break;
      case "banishFromAnyVoid":
      case "banishFromVoid":
      case "banishFromHand":
        for (const id of cards) banish(ctx, id);
        break;
      case "revealSource":
        if (typeof source !== "string" || !canRevealSource(ctx.state, side, source)) throw new Infeasible("Source left hand before its reveal payment");
        revealToBoth(ctx.state, [source]);
        ctx.emit({ kind: "revealed", side, instances: [source] });
        break;
      case "reveal":
        revealToBoth(ctx.state, cards);
        ctx.emit({ kind: "revealed", side, instances: [...cards] });
        break;
    }
  }
  return paymentSourceCounters;
}
