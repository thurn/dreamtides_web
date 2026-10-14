import { alternativeEventEnergy } from "../effects/primitives/rule-modifier";
import { identifies } from "../view/knowledge";
import { instanceCard, type EngineCatalog } from "../catalog";
import { characteristics, characteristicsOf, filterSubjectOf, matchesFilter } from "../continuous/characteristics";
import { costModifier, type CostModifier } from "../continuous/costs";
import { playPermission } from "../continuous/permissions";
import type { AlternativeCostAbility, Cost, Speed } from "../dsl/types";
import type { InstanceId, Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { eventAbilities } from "../effects/abilities";
import { conditionHolds, effectEntersPlay } from "../effects/interpreter";
import { additionalCosts, costsPayable, playCosts } from "./costs";
import { hasKeyword } from "./keywords";
import { playedThisTurn } from "./turn-log";
import { instanceOf, openBackSlots } from "./zones";

/** Where a played card comes from: the hand of the side holding it, or its owner's void by a play permission or Reclaim. */
export type PlayZone = "hand" | "void" | "deck";

/**
 * How a card is played: from hand for its costs; from hand by Offering, for
 * 0● (X is 0) and a card banished from hand plus its other costs; from its
 * owner's void by a play permission (continuous/permissions.ts), for its
 * normal costs; or from its owner's void by Reclaim, for its reclaim costs
 * in place of its printed energy cost, or its normal costs with plain
 * Reclaim. An applicable event alternative replaces printed energy costs
 * from hand or a zone independently allowed by a play permission. A card-defined
 * alternative replaces its normal energy base with its stated payments, without
 * granting zone access.
 */
export type PlayRoute = "hand" | "offering" | "permission" | "reclaim" | "eventAlternative" | "alternativeCost";

/**
 * The Reclaim costs an effect granted `id` (rules § Keywords and Effects →
 * Reclaim): those of the latest layer-3 gain of Reclaim that carries costs,
 * in timestamp order, since the card last lost Reclaim; `null` when none
 * applies. A plain gain of Reclaim adds the keyword and keeps the cost.
 */
function grantedReclaimCosts(state: BattleState, catalog: EngineCatalog, id: InstanceId): readonly Cost[] | null {
  let granted: readonly Cost[] | null = null;
  for (const { change } of characteristics(state, catalog).changes(3)) {
    if (change.kind !== "keyword" || change.keyword !== "reclaim" || change.instance !== id) continue;
    if (!change.gains) granted = null;
    else if (change.reclaimCosts !== undefined) granted = change.reclaimCosts;
  }
  return granted;
}

/** Explicit Reclaim replaces the normal base; a plain keyword keeps it. */
function explicitReclaimCosts(state: BattleState, catalog: EngineCatalog, id: InstanceId): readonly Cost[] | null {
  const granted = grantedReclaimCosts(state, catalog, id);
  if (granted !== null) return granted;
  const instance = instanceOf(state, id);
  return instanceCard(catalog, instance).abilities(instance.variant).find((ability) => ability.kind === "reclaim")?.costs ?? null;
}

/** One card-defined replacement route; separate declarations require an explicit choice form. */
function ownAlternativeCost(state: BattleState, catalog: EngineCatalog, id: InstanceId): AlternativeCostAbility | null {
  const instance = instanceOf(state, id);
  const alternatives = instanceCard(catalog, instance).abilities(instance.variant).filter(
    (ability): ability is AlternativeCostAbility => ability.kind === "alternativeCost",
  );
  if (alternatives.length > 1) throw new Error("A card has more than one alternative-cost declaration");
  return alternatives[0] ?? null;
}

/** Cost changes for the selected route; explicit replacement routes exclude own base setters. */
export function routeCostModifier(state: BattleState, catalog: EngineCatalog, side: Side, id: InstanceId, route: PlayRoute): CostModifier {
  const replaced = route === "offering" || route === "eventAlternative" || route === "alternativeCost" || (route === "reclaim" && explicitReclaimCosts(state, catalog, id) !== null);
  return costModifier(state, catalog, id, side, undefined, { applyOwnSet: !replaced });
}

/**
 * The costs of playing the card `id` by `route`, in payment order. By
 * Reclaim, a granted Reclaim cost comes first, then a printed or deck-entry
 * one, then the card's normal costs for plain Reclaim; the card's additional
 * costs follow any Reclaim cost.
 */
export function routeCosts(state: BattleState, catalog: EngineCatalog, id: InstanceId, route: PlayRoute): Cost[] {
  const instance = instanceOf(state, id);
  const definition = instanceCard(catalog, instance);
  const { variant } = instance;
  switch (route) {
    case "alternativeCost": {
      const alternative = ownAlternativeCost(state, catalog, id);
      if (alternative === null) throw new Error("The card’s alternative cost is unavailable");
      return [...alternative.costs, ...additionalCosts(definition, variant)];
    }
    case "eventAlternative": {
      const amount = alternativeEventEnergy(state, catalog, instance.controller);
      if (amount === null) throw new Error("The alternative event cost is unavailable");
      return [{ cost: "energy", amount }, ...additionalCosts(definition, variant)];
    }
    case "hand":
    case "permission":
      return playCosts(definition, variant);
    case "offering":
      return [{ cost: "banishFromHand", count: 1 }, ...additionalCosts(definition, variant)];
    case "reclaim": {
      const costs = explicitReclaimCosts(state, catalog, id);
      return costs === null ? playCosts(definition, variant) : [...costs, ...additionalCosts(definition, variant)];
    }
  }
}

/**
 * Whether `side` passes the quick cost checks for playing `id` by `route`:
 * the costs that need no choice, and for Offering another card in hand to
 * banish. The play's prompts check the other cost choices.
 */
export function routePayable(state: BattleState, catalog: EngineCatalog, side: Side, id: InstanceId, route: PlayRoute): boolean {
  const costs = routeCosts(state, catalog, id, route);
  return (
    costsPayable(state, side, id, costs, routeCostModifier(state, catalog, side, id, route)) &&
    (route !== "offering" || state.sides[side].hand.some((card) => card !== id))
  );
}

/**
 * The routes a card in `from` could be played by, before costs and timing:
 * Offering needs the keyword; from the void, a play permission covering the
 * card for its owner comes first, then Reclaim, which needs the keyword or
 * an explicit Reclaim ability whose keyword has not been lost.
 */
export function playRoutes(state: BattleState, catalog: EngineCatalog, id: InstanceId, from: PlayZone): PlayRoute[] {
  const instance = instanceOf(state, id);
  const definition = instanceCard(catalog, instance);
  const alternative: PlayRoute[] = characteristicsOf(state, catalog, id).cardType === "event" &&
    definition.speed !== "standard" && alternativeEventEnergy(state, catalog, instance.controller) !== null ? ["eventAlternative"] : [];
  const own: PlayRoute[] = ownAlternativeCost(state, catalog, id) === null ? [] : ["alternativeCost"];
  if (from === "deck") return playPermission(state, catalog, id, instance.owner) === null ? [] : ["permission", ...alternative, ...own];
  if (from === "void") {
    const permitted = playPermission(state, catalog, id, instance.owner) !== null;
    const reclaimable =
      hasKeyword(state, catalog, id, "reclaim") ||
      (definition.abilities(instance.variant).some((ability) => ability.kind === "reclaim") &&
        !characteristics(state, catalog).changes(3).some(({ change }) =>
          change.kind === "keyword" && change.instance === id && change.keyword === "reclaim" && !change.gains));
    return [...(permitted ? (["permission"] as const) : []), ...(reclaimable ? (["reclaim"] as const) : []), ...(permitted ? [...alternative, ...own] : [])];
  }
  return [...(hasKeyword(state, catalog, id, "offering") ? ["hand", "offering"] as const : ["hand"] as const), ...alternative, ...own];
}

/** Whether `side` has a Fast window now: its own Day or Night, or the opponent's Dusk. */
export function hasFastWindow(state: BattleState, side: Side): boolean {
  const { active, phase } = state.turn;
  return side === active ? phase === "day" || phase === "night" : phase === "dusk";
}

/**
 * Whether the timing rules let `side` play a card or activate an ability of
 * this speed now (rules § Playing Cards and the Stack). Cards and activated
 * abilities share these rules.
 */
export function timingAllows(state: BattleState, side: Side, speed: Speed): boolean {
  if (state.stack.length === 0) {
    if (speed === "standard") {
      return side === state.turn.active && state.turn.phase === "day";
    }
    // Fast, and Interrupt as a kind of Fast.
    return hasFastWindow(state, side);
  }
  // Only an Interrupt can be played onto a non-empty stack, as a response to
  // the opponent's item by the side holding priority.
  const top = state.stack[state.stack.length - 1];
  return (
    speed === "interrupt" &&
    state.priority === side &&
    top !== undefined &&
    top.controller === opponent(side)
  );
}

/**
 * Whether `side` may take a special action that is available wherever it
 * could play a Fast card but never as a response, such as `payToEnd` (C7).
 */
export function specialActionAllowed(state: BattleState, side: Side): boolean {
  return state.stack.length === 0 && hasFastWindow(state, side);
}

/**
 * Back-rank positions still free for `side` once the characters it already
 * has on the stack resolve. A side whose back rank would be full cannot play
 * another character (rules § Battlefield Capacity).
 */
export function freeBackSlotsAfterStack(state: BattleState, catalog: EngineCatalog, side: Side): number {
  const pending = state.stack.filter(
    (item) =>
      item.kind === "card" &&
      item.controller === side &&
      characteristicsOf(state, catalog, item.instance).cardType === "character",
  ).length;
  return openBackSlots(state, side) - pending;
}

/**
 * Whether a play restriction stops `side` playing the card `id` now, by any
 * route (rules § Playing Cards and the Stack → Play restrictions): a layer-6
 * `cannotPlay` change for `side` or every player that names the card or
 * whose filter its effective characteristics match, or a `playLimit` for
 * `side` that the cards it played this turn have reached.
 */
export function playRestricted(state: BattleState, catalog: EngineCatalog, side: Side, id: InstanceId): boolean {
  const layers = characteristics(state, catalog);
  for (const { change } of layers.changes(6)) {
    if (change.kind === "playLimit") {
      if (change.player === side && playedThisTurn(state, side) >= change.count) return true;
    } else if (change.kind === "cannotPlay") {
      if ((change.player !== null && change.player !== side) || (change.instance !== null && change.instance !== id)) continue;
      if (matchesFilter(filterSubjectOf(state, catalog, id, layers.of(id)), change.filter)) return true;
    }
  }
  return false;
}

/**
 * Whether `side` may begin playing the card `id` from `from` now: a card in
 * its hand, even one the opponent owns, or a card it owns in its void that a
 * play permission covers or that has Reclaim, by some route whose quick cost
 * checks pass, when no play restriction stops it.
 */
export function canPlay(
  state: BattleState,
  catalog: EngineCatalog,
  side: Side,
  id: InstanceId,
  from: PlayZone,
): boolean {
  const instance = instanceOf(state, id);
  if (instance.zone !== from || instance.controller !== side) {
    return false;
  }
  if (from === "deck" && (instance.owner !== side || state.sides[side].deck[0] !== id || !identifies(state, id, side))) return false;
  const definition = instanceCard(catalog, instance);
  if (!timingAllows(state, side, definition.speed) || playRestricted(state, catalog, side, id)) {
    return false;
  }
  if (!playRequirementsHold(state, catalog, side, id)) return false;
  // An X cost needs its minimum X, after cost modifications; the play's prompts check the cost choices.
  if (!playRoutes(state, catalog, id, from).some((route) => routePayable(state, catalog, side, id, route))) {
    return false;
  }
  const entersPlay =
    characteristicsOf(state, catalog, id).cardType === "character" ||
    eventAbilities(definition, instance.variant).some((ability) => effectEntersPlay(ability.effect));
  return !entersPlay || freeBackSlotsAfterStack(state, catalog, side) > 0;
}

/** Own requirements read the acting controller's current state before any route pays. */
function playRequirementsHold(state: BattleState, catalog: EngineCatalog, side: Side, id: InstanceId): boolean {
  const instance = instanceOf(state, id);
  return instanceCard(catalog, instance).abilities(instance.variant).every((ability) =>
    ability.kind !== "playCondition" || conditionHolds(state, catalog, ability.condition, {
      controller: side, source: id, optionalPaid: [],
    }));
}

/** The instruction supplies void access; Reclaim and the card’s alternative costs remain optional. */
export function immediatePlayRoutes(state: BattleState, catalog: EngineCatalog, id: InstanceId): PlayRoute[] {
  return ["permission", ...playRoutes(state, catalog, id, "void").filter((route) => route === "reclaim"),
    ...(ownAlternativeCost(state, catalog, id) === null ? [] : ["alternativeCost"] as const)];
}

/** Immediate character play obeys ownership, restrictions, costs and reserved capacity, while the effect supplies timing. */
export function canPlayImmediately(state: BattleState, catalog: EngineCatalog, side: Side, id: InstanceId): boolean {
  const instance = instanceOf(state, id);
  return instance.zone === "void" && instance.owner === side && instance.controller === side &&
    characteristicsOf(state, catalog, id).cardType === "character" && !playRestricted(state, catalog, side, id) &&
    playRequirementsHold(state, catalog, side, id) &&
    immediatePlayRoutes(state, catalog, id).some((route) => routePayable(state, catalog, side, id, route)) &&
    freeBackSlotsAfterStack(state, catalog, side) > 0;
}
