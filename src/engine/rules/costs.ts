/**
 * Costs of cards and activated abilities (rules § Costs, Requirements, and
 * X). Cost choices — X, which alternative of an "A or B" cost, whether to pay
 * an optional cost, and the cards that pay — are play-time prompts before the
 * commit point; payment happens after it, all before the item goes on the
 * stack.
 */
import type { EngineCatalog, PrintedCard } from "../catalog";
import { cardMatchesFilter } from "../continuous/characteristics";
import { adjustedEnergy, NO_COST_MODIFIER, type CostModifier } from "../continuous/costs";
import { matchingCharacters } from "../dsl/selectors";
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
import { discardCard, spendEnergy } from "./resources";
import { banish, dissolve, instanceOf, slotOf } from "./zones";
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
 * Chooses X as a play-time prompt when the costs have an X part: from its
 * minimum up to the most the side can pay once the fixed part and the cost
 * modifications apply. An unaffordable X is an empty prompt, which makes the
 * play illegal. `null` without an X part.
 */
export function chooseX(
  ctx: StepContext,
  side: Side,
  costs: readonly Cost[],
  purpose: PromptPurpose,
  modifier: CostModifier = NO_COST_MODIFIER,
): number | null {
  const variable = xCost(costs);
  if (variable === null) return null;
  return ctx.choose<ChooseNumberPrompt>({
    kind: "chooseNumber",
    side,
    purpose,
    min: variable.min,
    max: ctx.state.sides[side].currentEnergy - fixedEnergy(costs) - modifier.increase + modifier.reduction,
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

/**
 * Whether `side` could pay the mandatory costs that need no card choice:
 * the energy (with X at its minimum), any ☾, and any ⧗. Legality's
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
  const counters = sum(costs.map((cost) => (cost.cost === "counters" ? cost.amount : 0)));
  if (counters > storedCounters(state, source)) return false;
  return costs.every((cost) => cost.cost !== "exhaustSelf" || canPayExhaust(state, source));
}

/** A cost paid with chosen cards. */
type ChoosingCost = Extract<PaymentCost, { readonly count: number }>;

function choosesCards(cost: PaymentCost): cost is ChoosingCost {
  return "count" in cost;
}

/** The cards that could pay a card-choosing cost, before excluding cards already used. */
function cardCandidates(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  source: AbilitySource,
  cost: ChoosingCost,
): InstanceId[] {
  switch (cost.cost) {
    case "abandon":
      return matchingCharacters(state, catalog, cost.selector, side, source);
    case "discard":
      return [...state.sides[side].hand];
    case "reveal":
      return state.sides[side].hand.filter((id) => cardMatchesFilter(state, catalog, id, cost.filter));
    case "banishFromVoid":
      return state.sides[side].void.filter((id) => cardMatchesFilter(state, catalog, id, cost.filter));
    case "banishFromHand":
      return [...state.sides[side].hand];
  }
}

/** The role of the prompt choosing the cards for a cost. */
const CARD_ROLE: Readonly<Record<ChoosingCost["cost"], PromptRole>> = {
  abandon: "abandonCost",
  discard: "discardCost",
  reveal: "revealCost",
  banishFromVoid: "banishCost",
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
 * an answer that leads to one (steps/feasibility.ts). Every energy part —
 * top-level, X, and the chosen alternatives' and optional costs' — is one
 * total that `modifier` changes, so an alternative or an optional cost is
 * affordable when the modified total is.
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
): CostPlan {
  const { state, catalog } = ctx;
  const used = [...excluded];
  const available = state.sides[side].currentEnergy;
  /** The energy committed so far before cost modifications: the top-level parts and X, then each chosen nested part. */
  let baseEnergy = fixedEnergy(costs) + (x ?? 0);
  let countersLeft = storedCounters(state, source) - sum(costs.map((cost) => (cost.cost === "counters" ? cost.amount : 0)));
  let exhaustFree = canPayExhaust(state, source) && !costs.some((cost) => cost.cost === "exhaustSelf");
  const payments: PlannedCost[] = [];
  const optionalPaid: boolean[] = [];

  /**
   * Whether every cost in a nested list could be paid on top of what is
   * already committed. Its card costs need distinct cards among the cards
   * not yet used, which Hall's condition decides exactly: every group of
   * them together has at least as many candidates as it needs cards.
   */
  const affordable = (list: readonly PaymentCost[]): boolean => {
    if (adjustedEnergy(baseEnergy + sum(list.map((cost) => (cost.cost === "energy" ? cost.amount : 0))), modifier) > available) return false;
    if (sum(list.map((cost) => (cost.cost === "counters" ? cost.amount : 0))) > countersLeft) return false;
    const exhausts = list.filter((cost) => cost.cost === "exhaustSelf").length;
    if (exhausts > (exhaustFree ? 1 : 0)) return false;
    const demands = list.filter(choosesCards).map((cost) => ({
      count: cost.count,
      pool: cardCandidates(state, catalog, side, source, cost).filter((id) => !used.includes(id)),
    }));
    return cardsAssignable(demands);
  };

  /** Plans one payment cost; `nested` costs are budgeted here, top-level parts were budgeted up front. */
  const plan = (cost: PaymentCost, nested: boolean): void => {
    if (cost.cost === "energy") {
      if (nested) baseEnergy += cost.amount;
      return;
    }
    if (nested) {
      if (cost.cost === "counters") countersLeft -= cost.amount;
      if (cost.cost === "exhaustSelf") exhaustFree = false;
    }
    if (!choosesCards(cost)) {
      payments.push({ cost, cards: [] });
      return;
    }
    const candidates = cardCandidates(state, catalog, side, source, cost);
    const chosen = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      purpose: purpose(CARD_ROLE[cost.cost]),
      candidates: candidates.filter((id) => !used.includes(id)),
      min: cost.count,
      max: cost.count,
    });
    used.push(...chosen);
    payments.push({ cost, cards: [...chosen] });
  };

  for (const cost of costs) {
    switch (cost.cost) {
      case "energyX":
        break;
      case "choice": {
        const choice = ctx.choose<ChooseModePrompt>({
          kind: "chooseMode",
          side,
          purpose: purpose("chooseCost"),
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
        plan(cost, false);
    }
  }
  const total = adjustedEnergy(baseEnergy, modifier);
  // A path of choices can reach this point with more energy than the side
  // has, such as an X a play hook allowed past the cost modifications: a
  // dead end before the commit point, never a failed payment after it.
  if (total > available) throw new Infeasible(`${side} cannot pay ${String(total)}●`);
  const fixed = Math.min(total, adjustedEnergy(baseEnergy - (x ?? 0), modifier));
  return { x, energy: { fixed, x: total - fixed }, payments, optionalPaid };
}

/** One card-choosing cost's need: how many distinct cards, from which candidates. */
interface CardDemand {
  readonly count: number;
  readonly pool: readonly InstanceId[];
}

/**
 * Whether the demands can be met with distinct cards: by Hall's condition,
 * exactly when every group of them has, among all its candidates, at least
 * as many cards as it needs. A cost list holds few card costs.
 */
function cardsAssignable(demands: readonly CardDemand[]): boolean {
  for (let group = 1; group < 1 << demands.length; group++) {
    const candidates = new Set<InstanceId>();
    let needed = 0;
    demands.forEach((demand, index) => {
      if ((group & (1 << index)) === 0) return;
      needed += demand.count;
      for (const id of demand.pool) candidates.add(id);
    });
    if (candidates.size < needed) return false;
  }
  return true;
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
      case "abandon":
        for (const id of cards) abandonCharacter(ctx, side, id);
        break;
      case "discard":
        for (const id of cards) discardCard(ctx, side, id);
        break;
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
