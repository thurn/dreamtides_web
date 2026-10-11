import { characteristics, matchesFilter } from "../../continuous/characteristics";
import { copiableCostOf } from "../../dsl/selectors";
import type { CardFilter, ValueExpr } from "../../dsl/types";
import type { ChooseCardsPrompt, ChooseNumberPrompt } from "../../prompts/types";
import { moveToHand } from "../../rules/zones";
import type { InstanceId, Side } from "../../state/ids";
import { SIDES } from "../../state/ids";
import { shuffleInPlace } from "../../state/rng";
import type { StepContext } from "../../steps/types";
import { definePrimitive } from "../types";
import { evaluate } from "../interpreter";

/** An exact cost read from the effect, or a free cost choice made as Discover resolves. */
type DiscoverCost =
  | { readonly costExactly: ValueExpr; readonly chooseCost?: never }
  | { readonly chooseCost: true; readonly costExactly?: never }
  | { readonly costExactly?: never; readonly chooseCost?: never };

/**
 * "Discover a <filter>" (rules § Keywords and Effects → Discover): up to
 * `BattleConfig.discoverOptions` cards (`BATTLE.discoverOptions`, copied into
 * the battle's serialized config when it starts) drawn at random from the
 * `random:discover` stream among the cards in the controller's deck that
 * match the filter are shown to the controller alone; the controller puts
 * one of them into their hand (`cardDiscovered`, which names the card only
 * to a side that can identify it), and their deck is shuffled. With no
 * matching card nothing happens.
 */
export type DiscoverNode = DiscoverCost & {
  readonly op: "discover";
  readonly filter: CardFilter;
};

export const discoverPrimitive = definePrimitive<DiscoverNode>({
  op: "discover",
  resolve(ctx, node, env) {
    const side = env.controller;
    const cost = node.chooseCost === true
      ? ctx.choose<ChooseNumberPrompt>({
          kind: "chooseNumber",
          side,
          purpose: env.purpose("chooseX"),
          min: 0,
          max: ctx.catalog.maximumFixedCost + 1,
        })
      : node.costExactly === undefined ? undefined : evaluate(ctx, node.costExactly, env);
    const options = discoverOptions(ctx, side, node.filter, cost);
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
    moveToHand(ctx, chosen, side);
    ctx.emit({ kind: "cardDiscovered", side, instance: chosen });
    shuffleDeck(ctx, side);
  },
});

/** Up to `config.discoverOptions` distinct matching cards of `side`'s deck, in the order drawn. */
function discoverOptions(ctx: StepContext, side: Side, filter: CardFilter, cost: number | undefined): InstanceId[] {
  const layers = characteristics(ctx.state, ctx.catalog);
  const pool = ctx.state.sides[side].deck.filter((id) =>
    matchesFilter(layers.of(id), filter) && (cost === undefined || copiableCostOf(ctx.state, ctx.catalog, id) === cost),
  );
  const options: InstanceId[] = [];
  while (options.length < ctx.state.config.discoverOptions && pool.length > 0) {
    const [card] = pool.splice(Math.floor(ctx.random("random:discover") * pool.length), 1);
    if (card !== undefined) options.push(card);
  }
  return options;
}

/**
 * Shuffles `side`'s deck from its `shuffle:<side>` stream. Neither side can
 * place a card in it afterwards, so every card in it drops out of both
 * sides' knowledge (view/knowledge.ts), the offered cards it kept included.
 */
function shuffleDeck(ctx: StepContext, side: Side): void {
  const { state } = ctx;
  const deck = state.sides[side].deck;
  shuffleInPlace(state, `shuffle:${side}`, deck);
  for (const viewer of SIDES) {
    state.knownTo[viewer] = state.knownTo[viewer].filter((id) => !deck.includes(id));
  }
}

export function discover(filter: CardFilter = {}, cost: DiscoverCost = {}): DiscoverNode {
  return { op: "discover", filter, ...cost };
}
