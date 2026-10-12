import { identifies } from "../view/knowledge";
import { instanceCard, type EngineCatalog } from "../catalog";
import { characteristics, characteristicsOf, filterSubjectOf, matchesFilter } from "../continuous/characteristics";
import { costModifier, type CostModifier } from "../continuous/costs";
import { playPermission } from "../continuous/permissions";
import type { Cost, Speed } from "../dsl/types";
import type { InstanceId, Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { eventAbilities } from "../effects/abilities";
import { effectEntersPlay } from "../effects/interpreter";
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
 * Reclaim.
 */
export type PlayRoute = "hand" | "offering" | "permission" | "reclaim";

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

/** Cost changes for the selected route; explicit replacement routes exclude own base setters. */
export function routeCostModifier(state: BattleState, catalog: EngineCatalog, side: Side, id: InstanceId, route: PlayRoute): CostModifier {
  const replaced = route === "offering" || (route === "reclaim" && explicitReclaimCosts(state, catalog, id) !== null);
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
 * card for its owner comes first, then Reclaim, which needs the keyword or a
 * reclaim ability.
 */
export function playRoutes(state: BattleState, catalog: EngineCatalog, id: InstanceId, from: PlayZone): PlayRoute[] {
  const instance = instanceOf(state, id);
  if (from === "deck") return playPermission(state, catalog, id, instance.owner) === null ? [] : ["permission"];
  if (from === "void") {
    const permitted = playPermission(state, catalog, id, instance.owner) !== null;
    const reclaimable =
      hasKeyword(state, catalog, id, "reclaim") ||
      instanceCard(catalog, instance).abilities(instance.variant).some((ability) => ability.kind === "reclaim");
    return [...(permitted ? (["permission"] as const) : []), ...(reclaimable ? (["reclaim"] as const) : [])];
  }
  return hasKeyword(state, catalog, id, "offering") ? ["hand", "offering"] : ["hand"];
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
  // An X cost needs its minimum X, after cost modifications; the play's prompts check the cost choices.
  if (!playRoutes(state, catalog, id, from).some((route) => routePayable(state, catalog, side, id, route))) {
    return false;
  }
  const entersPlay =
    characteristicsOf(state, catalog, id).cardType === "character" ||
    eventAbilities(definition, instance.variant).some((ability) => effectEntersPlay(ability.effect));
  return !entersPlay || freeBackSlotsAfterStack(state, catalog, side) > 0;
}
