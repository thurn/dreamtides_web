import type { EngineCatalog } from "../../catalog";
import { characteristics, copiableCostOf, filterSubjectOf, matchesFilter } from "../../continuous/characteristics";
import type { Ability, CardFilter, ValueExpr } from "../../dsl/types";
import type { ChooseCardsPrompt, ChooseNumberPrompt, PromptPurpose } from "../../prompts/types";
import { instanceOrigin, originAbilities } from "../../rules/activation";
import { shuffleDeck } from "../../rules/shuffle";
import { moveInstance, moveToHand } from "../../rules/zones";
import type { InstanceId, Side } from "../../state/ids";
import type { BattleState } from "../../state/types";
import type { StepContext } from "../../steps/types";
import { showPrivately } from "../../view/knowledge";
import { definePrimitive, type EffectEnv, type EffectNode } from "../types";
import { evaluate, everyNode } from "../interpreter";

/**
 * An exact cost or a strict lower bound read from the effect ("cost greater
 * than that card's cost"), or a free cost choice made as Discover resolves.
 */
type DiscoverCost =
  | { readonly costExactly: ValueExpr; readonly costGreaterThan?: never; readonly chooseCost?: never }
  | { readonly costGreaterThan: ValueExpr; readonly costExactly?: never; readonly chooseCost?: never }
  | { readonly chooseCost: true; readonly costExactly?: never; readonly costGreaterThan?: never }
  | { readonly costExactly?: never; readonly costGreaterThan?: never; readonly chooseCost?: never };

/**
 * "Discover a <filter>" (rules § Keywords and Effects → Discover): up to
 * `BattleConfig.discoverOptions` cards (`BATTLE.discoverOptions`, copied into
 * the battle's serialized config when it starts) drawn at random from the
 * `random:discover` stream among the cards in the controller's deck that
 * match the filter are shown to the controller alone; the controller puts
 * one of them into their hand (`cardDiscovered`, which names the card only
 * to a side that can identify it), and their deck is shuffled. With no
 * matching card nothing happens.
 *
 * With `to` `"deckTop"` ("Discover … and put it on top of your deck"), the
 * deck is shuffled and then the chosen card is put on top of it
 * (`cardsPlaced`, naming the card to its controller alone, who keeps knowing
 * it there).
 */
export type DiscoverNode = DiscoverCost & {
  readonly op: "discover";
  readonly filter: CardFilter;
  /** Where the chosen card goes; absent for the hand. */
  readonly to?: "deckTop";
};

export const discoverPrimitive = definePrimitive<DiscoverNode>({
  op: "discover",
  resolve(ctx, node, env) {
    const side = env.controller;
    const options = discoverOptions(ctx, side, node.filter, costMatcher(ctx, node, env));
    if (options.length === 0) return;
    const [chosen] = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      privateTo: side,
      purpose: env.purpose("discover"),
      candidates: options,
      min: 1,
      max: 1,
    });
    if (chosen === undefined) throw new Error("discover answered with no card");
    if (node.to === "deckTop") {
      shuffleDeck(ctx.state, side);
      moveInstance(ctx, chosen, "deck", "top");
      showPrivately(ctx.state, side, [chosen]);
      ctx.emit({ kind: "cardsPlaced", side, to: "deckTop", cards: [chosen], from: ["deck"], seenBy: [[side]] });
      return;
    }
    moveToHand(ctx, chosen, side);
    ctx.emit({ kind: "cardDiscovered", side, instance: chosen });
    shuffleDeck(ctx.state, side);
  },
});

/** The cards of `side`'s deck that match `filter`, in deck order. */
function matchingDeckCards(state: BattleState, catalog: EngineCatalog, side: Side, filter: CardFilter): InstanceId[] {
  const layers = characteristics(state, catalog);
  return state.sides[side].deck.filter((id) => matchesFilter(filterSubjectOf(state, catalog, id, layers.of(id)), filter));
}

/**
 * Which copiable costs a Discover's cost criterion accepts, settled as it
 * resolves: a free cost choice prompts first, and a value is read once.
 */
function costMatcher(ctx: StepContext, node: DiscoverNode, env: EffectEnv): (cost: number) => boolean {
  if (node.chooseCost === true) {
    const chosen = ctx.choose<ChooseNumberPrompt>({
      kind: "chooseNumber",
      side: env.controller,
      purpose: env.purpose("discoverCost"),
      min: 0,
      max: ctx.catalog.maximumFixedCost + 1,
    });
    return (cost) => cost === chosen;
  }
  if (node.costExactly !== undefined) {
    const exactly = evaluate(ctx, node.costExactly, env);
    return (cost) => cost === exactly;
  }
  if (node.costGreaterThan !== undefined) {
    const above = evaluate(ctx, node.costGreaterThan, env);
    return (cost) => cost > above;
  }
  return () => true;
}

/** Up to `config.discoverOptions` distinct matching cards of `side`'s deck, in the order drawn. */
function discoverOptions(ctx: StepContext, side: Side, filter: CardFilter, costMatches: (cost: number) => boolean): InstanceId[] {
  const pool = matchingDeckCards(ctx.state, ctx.catalog, side, filter).filter(
    (id) => costMatches(copiableCostOf(ctx.state, ctx.catalog, id)),
  );
  const options: InstanceId[] = [];
  while (options.length < ctx.state.config.discoverOptions && pool.length > 0) {
    const [card] = pool.splice(Math.floor(ctx.random("random:discover") * pool.length), 1);
    if (card !== undefined) options.push(card);
  }
  return options;
}

function isFreeCostDiscover(node: EffectNode): node is DiscoverNode & { readonly chooseCost: true } {
  return node.op === "discover" && (node as DiscoverNode).chooseCost === true;
}

/**
 * The ability a prompt's purpose names, as the policy reconstructs it: the
 * resolving ability's captured origin is not in the state, so it reads the
 * captured card (`purpose.cardId`) for a printed ability, which holds however
 * the source has changed since the ability was committed, and the source's
 * gained abilities, as if none were lost (lost positions keep their
 * indexes), for a gained one. A figment's or an emblem's reads its live
 * abilities. `undefined` for a gained ability whose group has ended or whose
 * source no longer exists.
 */
function askingAbility(state: BattleState, catalog: EngineCatalog, purpose: PromptPurpose): Ability | undefined {
  const instance = typeof purpose.source === "string" ? state.instances[purpose.source] : undefined;
  if (instance === undefined || purpose.ability === null) return undefined;
  if (purpose.cardId !== null) {
    const printed = catalog.variantCard(purpose.cardId, instance.variant).abilities(instance.variant);
    if (purpose.ability < printed.length) return printed[purpose.ability];
  }
  const live = instanceOrigin(instance);
  if (purpose.cardId === null || live.kind !== "card") return originAbilities(catalog, live)[purpose.ability];
  const { lost: _lost, ...unlost } = live;
  return originAbilities(catalog, unlost)[purpose.ability];
}

/**
 * The costs a free Discover cost choice (role `discoverCost`) finds a card
 * at in `state`: the copiable cost of each card in the chooser's deck that
 * matches the filter of a free-cost Discover in the asking ability
 * (`askingAbility`), read as `discoverOptions` reads it. It reads the deck
 * `state` holds, so a policy calls it only on a state sampled from its own
 * view (D22). Empty when the asking ability cannot be found, which only
 * costs the policy its informed choice.
 */
export function discoverableCosts(state: BattleState, catalog: EngineCatalog, side: Side, purpose: PromptPurpose): ReadonlySet<number> {
  const ability = askingAbility(state, catalog, purpose);
  const filters = ability !== undefined && "effect" in ability && ability.effect !== undefined
    ? everyNode(ability.effect).filter(isFreeCostDiscover).map((node) => node.filter)
    : [];
  const costs = new Set<number>();
  for (const filter of filters) {
    for (const id of matchingDeckCards(state, catalog, side, filter)) costs.add(copiableCostOf(state, catalog, id));
  }
  return costs;
}

export function discover(filter: CardFilter = {}, cost: DiscoverCost = {}, to: "hand" | "deckTop" = "hand"): DiscoverNode {
  return to === "hand" ? { op: "discover", filter, ...cost } : { op: "discover", filter, ...cost, to };
}
