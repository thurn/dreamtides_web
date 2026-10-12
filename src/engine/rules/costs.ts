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
import type { AdditionalCost, Cost, PaymentCost, Variant } from "../dsl/types";
import type {
  ChooseCardsPrompt,
  ChooseModePrompt,
  ChooseNumberPrompt,
  ConfirmPrompt,
  PromptPurpose,
  PromptRole,
} from "../prompts/types";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import type { StepContext } from "../steps/types";
import { discardCard, gainPoints, spendEnergy } from "./resources";
import { banish, dissolve, instanceOf, returnToHand, slotOf } from "./zones";
import { revealToBoth } from "../view/knowledge";
import { Infeasible } from "../steps/errors";

/** A payment cost other than energy, which a plan pays as one total. */
export type NonEnergyCost = Exclude<PaymentCost, { readonly cost: "energy" }>;

/** One cost to pay after the commit point, with the cards chosen for it. */
export interface PlannedCost {
  readonly cost: NonEnergyCost;
  readonly cards: readonly InstanceId[];
}

/** How a list of costs will be paid, settled by play-time prompts before the commit point. */
export interface CostPlan {
  /** Shared X chosen for energy or abandonment, or captured from a discarded or banished count, or a discarded or abandoned card's cost. */
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

/**
 * Chooses X before targets for an energy-X or abandon-X cost. Energy-X is
 * bounded by payable energy after fixed costs and modifications; abandon-X
 * by controlled matching characters and its declared minimum. The feasibility
 * guard further limits answers to jointly payable target and cost choices.
 * Returns null when neither form needs numeric preparation.
 */
export function chooseX(
  ctx: StepContext,
  side: Side,
  costs: readonly Cost[],
  purpose: PromptPurpose,
  modifier: CostModifier = NO_COST_MODIFIER,
): number | null {
  const variable = xCost(costs);
  const counts = costs.filter((cost): cost is Extract<PaymentCost, { cost: "abandon"; count: "x" }> => cost.cost === "abandon" && cost.count === "x");
  if (variable === null && counts.length === 0) return null;
  const energyMax = variable === null ? Infinity : ctx.state.sides[side].currentEnergy - fixedEnergy(costs) - modifier.increase + modifier.reduction;
  const source = purpose.source;
  if (counts.length > 0 && source === null) throw new Error("An abandon-X choice requires its source");
  const countMax = counts.map((cost) => source === null ? 0 : cardCandidates(ctx.state, ctx.catalog, side, source, cost).length);
  const min = Math.max(variable?.min ?? 0, ...counts.map((cost) => cost.min));
  const max = Math.min(energyMax, ...countMax);
  if (counts.length > 0 && max < min) throw new Infeasible("Too few matching characters for abandon X");
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
  if (adjustedEnergy(minimumEnergy(costs), modifier) > state.sides[side].currentEnergy) return false;
  if (spent(costs, "counters") > storedCounters(state, source)) return false;
  if (spent(costs, "points") > state.sides[side].score) return false;
  return costs.every((cost) => cost.cost !== "exhaustSelf" || canPayExhaust(state, source));
}

/** A cost paid with chosen cards. */
type ChoosingCost = Extract<PaymentCost, { readonly count: number | "x" }>;

function choosesCards(cost: PaymentCost): cost is ChoosingCost {
  return "count" in cost && cost.count !== "hand";
}

/** "Discard your hand": paid with every eligible hand card, which nobody chooses. */
function discardsHand(cost: PaymentCost): boolean {
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
  banishFromVoid: "banishCost",
  banishFromAnyVoid: "banishAnyVoidCost",
  banishFromHand: "offeringCost",
};

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
 * `selectorX` supplies prepared X to character-cost selectors during play or
 * activation. Callers with no explicit binding, including manual planning,
 * use the source card's stored X.
 */
export function planCosts(
  ctx: StepContext,
  side: Side,
  source: AbilitySource,
  costs: readonly Cost[],
  x: number | null,
  purpose: (role: PromptRole) => PromptPurpose,
  excluded: readonly InstanceId[],
  modifier: CostModifier = NO_COST_MODIFIER,
  options: { readonly endsPlayTime?: true; readonly selectorX?: number } = {},
): CostPlan {
  const { state, catalog } = ctx;
  const used = [...excluded];
  const available = state.sides[side].currentEnergy;
  /** The energy committed so far before cost modifications: the top-level parts and X, then each chosen nested part. */
  const energyX = xCost(costs) === null ? 0 : (x ?? 0);
  let baseEnergy = fixedEnergy(costs) + energyX;
  let countersLeft = storedCounters(state, source) - spent(costs, "counters");
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
  const leavesPlay = (cost: PaymentCost): boolean => cost.cost === "return" || cost.cost === "abandon";
  const cannotFollowDeparture = (cost: PaymentCost): boolean => cost.cost === "exhaustSelf" ||
    (cost.cost === "counters" && cost.amount > 0);

  /**
   * Whether every cost in a nested list could be paid on top of what is
   * already committed. Its card costs need distinct cards among the cards
   * not yet used, which a matching of cards to needs decides exactly
   * (`cardsAssignable`).
   */
  const affordable = (list: readonly PaymentCost[]): boolean => {
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
      pool: cardCandidates(state, catalog, side, source, cost, options.selectorX).filter((id) =>
        !used.includes(id) && !(handTaken >= 0 && index > handTaken && hand.includes(id)) &&
        !(leavesPlay(cost) && id === source && list.slice(index + 1).some(cannotFollowDeparture)),
      ),
    }));
    return cardsAssignable(demands);
  };

  /** Plans one payment cost; `nested` costs are budgeted here, top-level parts were budgeted up front. */
  const plan = (cost: PaymentCost, nested: boolean, isLast = false): void => {
    if (sourceDeparted && cannotFollowDeparture(cost)) throw new Infeasible("A departed source cannot pay a later source cost");
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
    const candidates = cardCandidates(state, catalog, side, source, cost, options.selectorX);
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
    const selected = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      purpose: purpose(CARD_ROLE[cost.cost]),
      candidates: remaining,
      min: count ?? leastCount(cost),
      // Too few candidates for the least X is an empty prompt, a dead end like a short fixed count.
      max: count ?? Math.max(remaining.length, leastCount(cost)),
    }, allAnswersPayable ? { allAnswersPayable: true } : undefined);
    const selectedIds = new Set(selected);
    const chosen = remaining.filter((id) => selectedIds.has(id));
    // A captured card cost (a discarded or abandoned card's) is read now,
    // before payment, so it holds even for a figment that then ceases to exist.
    const captures = "captureCost" in cost && cost.captureCost === true;
    if (captures || variable) {
      if (captures && chosen.length !== 1) throw new Error("A captured cost value requires exactly one card");
      const value = captures ? copiableCostOf(state, catalog, chosen[0]) : chosen.length;
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
          purpose: purpose("chooseCost"),
          costOptions: cost.options,
          options: cost.options.map((option, index) => ({ mode: index, legal: affordable(option) })),
        });
        for (const part of cost.options[choice] ?? []) plan(part, true);
        break;
      }
      case "optional": {
        const pays =
          affordable(cost.costs) &&
          ctx.choose<ConfirmPrompt>({ kind: "confirm", side, purpose: purpose("optionalCost") });
        optionalPaid.push(pays);
        if (pays) for (const part of cost.costs) plan(part, true);
        break;
      }
      default:
        plan(cost, false, index === costs.length - 1);
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
export function payCosts(ctx: StepContext, side: Side, source: AbilitySource, plan: CostPlan): void {
  spendEnergy(ctx, side, plan.energy.fixed);
  spendEnergy(ctx, side, plan.energy.x);
  for (const { cost, cards } of plan.payments) {
    switch (cost.cost) {
      case "exhaustSelf":
        exhaustForCost(ctx, source);
        break;
      case "counters":
        spendCounters(ctx, source, cost.amount);
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
        for (const id of cards) discardCard(ctx, side, id);
        break;
      case "banishFromAnyVoid":
      case "banishFromVoid":
      case "banishFromHand":
        for (const id of cards) banish(ctx, id);
        break;
      case "reveal":
        revealToBoth(ctx.state, cards);
        ctx.emit({ kind: "revealed", side, instances: [...cards] });
        break;
    }
  }
}
