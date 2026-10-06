import { printedCard, type EngineCatalog, type PrintedCard } from "../catalog";
import { characteristicsOf } from "../continuous/characteristics";
import { costModifier } from "../continuous/costs";
import type { Cost, Speed, Variant } from "../dsl/types";
import type { InstanceId, Side } from "../state/ids";
import { opponent } from "../state/ids";
import type { BattleState } from "../state/types";
import { eventAbilities } from "../effects/abilities";
import { effectEntersPlay } from "../effects/interpreter";
import { additionalCosts, costsPayable, playCosts } from "./costs";
import { hasKeyword } from "./keywords";
import { instanceOf, openBackSlots } from "./zones";

/** Where a played card comes from: the hand of the side holding it, or its owner's void by Reclaim. */
export type PlayZone = "hand" | "void";

/**
 * How a card is played: from hand for its costs; from hand by Offering, for
 * 0● (X is 0) and a card banished from hand plus its other costs; or from its
 * owner's void by Reclaim, for its reclaim costs in place of its printed
 * energy cost, or its normal costs with plain Reclaim.
 */
export type PlayRoute = "hand" | "offering" | "reclaim";

/** The costs of playing a card by `route`, in payment order. */
export function routeCosts(definition: PrintedCard, variant: Variant, route: PlayRoute): Cost[] {
  switch (route) {
    case "hand":
      return playCosts(definition, variant);
    case "offering":
      return [{ cost: "banishFromHand", count: 1 }, ...additionalCosts(definition, variant)];
    case "reclaim": {
      const reclaim = definition.abilities(variant).find((ability) => ability.kind === "reclaim");
      return reclaim === undefined ? playCosts(definition, variant) : [...reclaim.costs, ...additionalCosts(definition, variant)];
    }
  }
}

/**
 * Whether `side` passes the quick cost checks for playing `id` by `route`:
 * the costs that need no choice, and for Offering another card in hand to
 * banish. The play's prompts check the other cost choices.
 */
export function routePayable(state: BattleState, catalog: EngineCatalog, side: Side, id: InstanceId, route: PlayRoute): boolean {
  const instance = instanceOf(state, id);
  const costs = routeCosts(printedCard(catalog, instance.printing), instance.variant, route);
  return (
    costsPayable(state, side, id, costs, costModifier(state, catalog, id, side)) &&
    (route !== "offering" || state.sides[side].hand.some((card) => card !== id))
  );
}

/** The routes a card in `from` could be played by, before costs and timing: Offering needs the keyword, Reclaim the keyword or a reclaim ability. */
export function playRoutes(state: BattleState, catalog: EngineCatalog, id: InstanceId, from: PlayZone): PlayRoute[] {
  const instance = instanceOf(state, id);
  if (from === "void") {
    const reclaimable =
      hasKeyword(state, catalog, id, "reclaim") ||
      printedCard(catalog, instance.printing).abilities(instance.variant).some((ability) => ability.kind === "reclaim");
    return reclaimable ? ["reclaim"] : [];
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
 * Whether `side` may begin playing the card `id` from `from` now: a card in
 * its hand, even one the opponent owns, or a card it owns in its void with
 * Reclaim, by some route whose quick cost checks pass.
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
  const definition = printedCard(catalog, instance.printing);
  if (!timingAllows(state, side, definition.speed)) {
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
