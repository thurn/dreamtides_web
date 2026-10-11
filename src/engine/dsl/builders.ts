/** Builders for abilities, targets, selectors, and values. Primitive builders live in their modules. */
import type { CardSubtype } from "../../types/card-identity";
import type { Effect } from "../effects/registry";
import type { EffectNode } from "../effects/types";
import type {
  Ability,
  ActivatedAbility,
  AdditionalCost,
  AdditionalCostAbility,
  AllSpec,
  BoundValue,
  CardCountValue,
  CardFilter,
  CharacterSelector,
  ChoiceCost,
  Condition,
  Cost,
  CountedZone,
  EnergyCost,
  EnergyXCost,
  FunctionalZone,
  Keyword,
  MovedCardRef,
  OptionalCost,
  PaymentCost,
  PlayerRef,
  ReclaimAbility,
  SelfSpec,
  Speed,
  StackItemSelector,
  StaticAbility,
  SupportedSpec,
  TargetSpec,
  ValueExpr,
  WinConditionAbility,
  XValue,
  ZoneEverySpec,
  ZoneSelfSpec,
  ZoneTargetSpec,
  ZoneTopSpec,
} from "./types";

export function event(effect: Effect): Ability {
  return { kind: "event", effect };
}

/**
 * An always-on ability holding a continuous primitive: "Warriors you control
 * have +1✦." Works in play unless `zone` names a functional zone: "If this
 * card is in your void, characters you control have +1✦" works from "void".
 */
export function staticAbility(effect: Effect, options: { readonly zone?: FunctionalZone } = {}): StaticAbility {
  return { kind: "static", effect, zone: options.zone ?? "play" };
}

/** "Cost: Effect". Standard speed unless stated. */
export function activated(
  costs: readonly Cost[],
  effect: Effect,
  options: { readonly speed?: Speed; readonly oncePerTurn?: boolean } = {},
): ActivatedAbility {
  return {
    kind: "activated",
    costs,
    effect,
    speed: options.speed ?? "standard",
    ...(options.oncePerTurn === true ? { oncePerTurn: true } : {}),
  };
}

/** "N●". */
export function energy(amount: number): EnergyCost {
  return { cost: "energy", amount };
}

/** "X●"; X is at least 1 unless `min` widens it to 0 (rules § Costs, Requirements, and X). */
export function energyX(min = 1): EnergyXCost {
  return { cost: "energyX", min };
}

/** "☾". */
export function exhaustSelf(): PaymentCost {
  return { cost: "exhaustSelf" };
}

/** "Abandon a character" (or N characters) matching the selector; always your own. */
export function abandonCost(extra: Omit<CharacterSelector, "controller"> = {}, count = 1): PaymentCost {
  return { cost: "abandon", selector: { controller: "you", ...extra }, count };
}

/**
 * "Abandon a character: …, where X is that character's cost": one matching
 * character, whose copiable cost is captured as X before it is abandoned.
 */
export function abandonCostCapture(extra: Omit<CharacterSelector, "controller"> = {}): PaymentCost {
  return { cost: "abandon", selector: { controller: "you", ...extra }, count: 1, captureCost: true };
}

/** "Abandon this character": only the ability's source pays. */
export function abandonSelfCost(): PaymentCost {
  return { cost: "abandon", selector: self(), count: 1 };
}

/** "Discard N cards" as a cost. */
export function discardCost(count = 1): PaymentCost {
  return discardCostFilter({}, { count });
}

/** Discard matching hand cards; capture their count or a single card’s copiable cost as X. */
export function discardCostFilter(filter: CardFilter, options: { readonly count?: number | "x"; readonly captureCost?: never } | { readonly count?: 1; readonly captureCost: true } = {}): PaymentCost {
  return options.captureCost === true
    ? { cost: "discard", count: 1, filter, captureCost: true }
    : { cost: "discard", count: options.count ?? 1, filter };
}

/** "N⧗": spend counters stored on the source. */
export function countersCost(amount: number): PaymentCost {
  return { cost: "counters", amount };
}

/** "Pay N⍟" as a cost: N victory points the payer must have in full. */
export function pointsCost(amount: number): PaymentCost {
  if (!Number.isSafeInteger(amount) || amount < 1) throw new Error("pointsCost amount must be a positive safe integer");
  return { cost: "points", amount };
}

/** "Banish N cards from your void" (matching the filter) as a cost. */
export function banishFromVoidCost(count = 1, filter: CardFilter = {}): PaymentCost {
  return { cost: "banishFromVoid", count, filter };
}

/**
 * "Banish X cards from your void" as a cost: the payer chooses how many
 * matching void cards to banish, and that count is X. X is at least `min`,
 * 1 unless X=0 does something meaningful (rules § Costs, Requirements, and X).
 */
export function banishXCost(options: { readonly min?: number; readonly filter?: CardFilter } = {}): PaymentCost {
  const min = options.min ?? 1;
  if (!Number.isSafeInteger(min) || min < 0) throw new Error("banishXCost min must be a non-negative safe integer");
  return { cost: "banishFromVoid", count: "x", filter: options.filter ?? {}, min };
}

/** "Reveal N cards from your hand" (matching the filter) as a cost. */
export function revealCost(count = 1, filter: CardFilter = {}): PaymentCost {
  return { cost: "reveal", count, filter };
}

/** "A or B": each option is the list of costs paid when it is chosen. */
export function choiceCost(...options: readonly (readonly PaymentCost[])[]): ChoiceCost {
  return { cost: "choice", options };
}

/** "You may A": the costs are paid only if the player chooses to. */
export function optionalCost(...costs: readonly PaymentCost[]): OptionalCost {
  return { cost: "optional", costs };
}

/** "To play this card, …": costs added to the card's printed energy cost. */
export function additionalCost(...costs: readonly AdditionalCost[]): AdditionalCostAbility {
  return { kind: "additionalCost", costs };
}

/** "If the additional cost was paid": the item's optional cost at `optional` (printed order) was paid. */
export function costPaid(optional = 0): Condition {
  return { cond: "costPaid", optional };
}

/** "If this card was reclaimed": its latest actual committed play used Reclaim, independent of its replacement status. */
export function sourceWasReclaimed(): Condition {
  return { cond: "sourceWasReclaimed" };
}

/**
 * "If you control a challenger": at least `atLeast` characters in play match
 * the selector, whose controller is relative to the effect's controller.
 */
export function controls(selector: CharacterSelector, atLeast = 1): Condition {
  return { cond: "controls", selector, atLeast };
}

/**
 * "If you control no shadow figments": no character in play matches the
 * selector, whose controller is relative to the effect's controller.
 */
export function controlsNone(selector: CharacterSelector): Condition {
  return { cond: "controls", selector, atLeast: 0, atMost: 0 };
}

/** "If you have no cards in your deck": the player (you by default) has no cards in `zone`. */
export function noCardsIn(zone: CountedZone, player: PlayerRef = "you"): Condition {
  return { cond: "cardsIn", player, zone, atMost: 0 };
}

/** "If there are N or more <cards> in your <zone>", counted when the condition is checked. */
export function conditionCardCounts(
  zone: CountedZone,
  atLeast: number,
  options: { readonly player?: PlayerRef; readonly filter?: CardFilter; readonly atMost?: number } = {},
): Condition {
  return { ...options, cond: "cardsIn", player: options.player ?? "you", zone, atLeast };
}

/**
 * "If …, you win the game" on a card in play or an emblem: its controller
 * wins in the victory check whenever the condition holds (C15).
 */
export function winCondition(condition: Condition): WinConditionAbility {
  return { kind: "winCondition", condition };
}

/** Cards on the stack: by controller relative to the effect's controller, and card type. */
export function stackItem(
  extra: Partial<Pick<StackItemSelector, "controller" | "cardType">> = {},
): StackItemSelector {
  return { kind: "stackItem", controller: extra.controller ?? "any", ...(extra.cardType === undefined ? {} : { cardType: extra.cardType }) };
}

/** "Reclaim N●" or "Reclaim – costs": played from your void for `costs` in place of its printed energy cost. Plain Reclaim is `keyword("reclaim")`. */
export function reclaim(...costs: readonly Cost[]): ReclaimAbility {
  return { kind: "reclaim", costs };
}

export function keyword(name: Keyword): Ability {
  return { kind: "keyword", keyword: name };
}

export function target(selector: CharacterSelector, count = 1): TargetSpec {
  return { kind: "target", selector, count };
}

export function upTo(selector: CharacterSelector, count: number): TargetSpec {
  return { kind: "target", selector, count, upTo: true };
}

export function all(selector: CharacterSelector): AllSpec {
  return { kind: "all", selector };
}

export function self(): SelfSpec {
  return { kind: "self" };
}

/**
 * "A character from your void": `count` void cards matching `filter`, chosen
 * as targets; "up to N" with `upTo`, "another" with `another`, and the
 * opponent's void with `player: "opponent"`.
 */
export function fromVoid(
  filter: CardFilter = {},
  options: { readonly player?: PlayerRef; readonly count?: number; readonly upTo?: boolean; readonly another?: boolean } = {},
): ZoneTargetSpec {
  return {
    kind: "inZone",
    pick: "target",
    zone: "void",
    player: options.player ?? "you",
    filter,
    count: options.count ?? 1,
    ...(options.upTo === true ? { upTo: true } : {}),
    ...(options.another === true ? { another: true } : {}),
  };
}

/** "Events in your void", "your hand": every card in the player's zone matching `filter`, chosen by nobody. */
export function everyIn(
  zone: CountedZone,
  filter: CardFilter = {},
  options: { readonly player?: PlayerRef; readonly another?: boolean } = {},
): ZoneEverySpec {
  return { kind: "inZone", pick: "every", zone, player: options.player ?? "you", filter, ...(options.another === true ? { another: true } : {}) };
}

/** "The top card of your deck" (`count` cards): those of them matching `filter`. */
export function topOfDeck(count = 1, filter: CardFilter = {}, player: PlayerRef = "you"): ZoneTopSpec {
  return { kind: "inZone", pick: "top", zone: "deck", player, filter, count };
}

/** "This character from your void": the source while it is in its controller's `zone`. */
export function thisCardIn(zone: CountedZone): ZoneSelfSpec {
  return { kind: "inZone", pick: "self", zone };
}

export function enemyCharacter(extra: Omit<CharacterSelector, "controller"> = {}): CharacterSelector {
  return { controller: "opponent", ...extra };
}

export function characterYouControl(extra: Omit<CharacterSelector, "controller"> = {}): CharacterSelector {
  return { controller: "you", ...extra };
}

export function anyCharacter(extra: Omit<CharacterSelector, "controller"> = {}): CharacterSelector {
  return { controller: "any", ...extra };
}

export function ofSubtype(subtype: CardSubtype): Pick<CharacterSelector, "subtype"> {
  return { subtype };
}

/** "X": the X chosen for the card or ability as it was played. In a selector's bound, the X paid for its source card. */
export function x(): XValue {
  return { value: "x" };
}

/** A fixed offset, such as "cost 1● higher". */
export function plus(of: ValueExpr, amount: number): ValueExpr {
  return { value: "plus", of, amount };
}

/**
 * "That card", for a value: the cards `node`, an earlier node of the same
 * effect, moved. The content gate rejects a `node` that does not resolve
 * before the value in the same resolution (`testing/moved-card-audit.ts`).
 */
export function cardsMovedBy(node: EffectNode): MovedCardRef {
  return { kind: "movedCards", node };
}

/** "That card's cost": the copiable cost of the cards a node moved, read just before they moved. */
export function costOf(of: MovedCardRef): ValueExpr {
  return { value: "costOf", of };
}

/**
 * "With cost N●": equal cost bounds, for a card filter (constants) or a
 * character selector (a constant or `x()`).
 */
export function costExactly<V extends BoundValue>(cost: V): { readonly costAtLeast: V; readonly costAtMost: V } {
  return { costAtLeast: cost, costAtMost: cost };
}

export function count(of: CharacterSelector): ValueExpr {
  return { value: "count", of };
}

/**
 * "The number of cards in your void", "for each ≤2● cost character in your
 * void": how many cards are in the player's zone as the value is read, in a
 * void only those matching `filter`. A value or a ✦ or cost bound. A hand or
 * deck count takes no filter (RD-hv-umm2.76-1).
 */
export function countCards(zone: "void", filter?: CardFilter, player?: PlayerRef): CardCountValue;
export function countCards(zone: "deck" | "hand", filter?: undefined, player?: PlayerRef): CardCountValue;
export function countCards(zone: CountedZone, filter?: CardFilter, player: PlayerRef = "you"): CardCountValue {
  if (zone === "void") return { value: "countCards", zone, player, filter: filter ?? {} };
  if (filter !== undefined) throw new Error(`A ${zone} count takes no filter`);
  return { value: "countCards", zone, player };
}

/** "Supported characters" (matching `extra`): the front-rank characters the source supports from the back rank. */
export function supported(extra: Omit<CharacterSelector, "controller"> = {}): SupportedSpec {
  return { kind: "supported", selector: extra };
}

/** "The number of characters supporting it" (C9). */
export function supporting(): ValueExpr {
  return { value: "supporting" };
}

/** `of` multiplied by `factor`: "+2✦ for each …". */
export function times(of: ValueExpr, factor: number): ValueExpr {
  return { value: "times", of, factor };
}

/** "X, where X is …", fixed as the effect resolves (RD-hv-7x4l.7-1). */
export function lockedAtResolution(of: ValueExpr): ValueExpr {
  return { value: "locked", of };
}

/** The points awarded by the challenge that triggered this ability, captured at scoring. */
export function scoredAmount(): ValueExpr {
  return { value: "scored" };
}
