import { characteristics, matchesFilter } from "../../continuous/characteristics";
import { copiableCostOf } from "../../dsl/selectors";
import type { CardFilter } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { instanceOf, moveToHand } from "../../rules/zones";
import { opponent, type InstanceId, type Side } from "../../state/ids";
import type { StepContext } from "../../steps/types";
import { definePrimitive, type EffectEnv, type EffectNode } from "../types";

/** The cards a take chooses among. */
export type AmongSource =
  /**
   * "Erode 3. … from among those cards": the nested effect resolves first,
   * and the cards it put into a void or the Banished zone are the ones
   * chosen among. Both zones are public, so both sides see the choice.
   */
  | { readonly kind: "movedBy"; readonly effect: EffectNode }
  /**
   * "Look at the opponent's hand. Put a card from it …": the prompt is
   * private to the controller, who alone sees the cards it offers and keeps
   * knowing each one while it stays in that hand (view/knowledge.ts).
   */
  | { readonly kind: "opponentHand" };

/**
 * "Put a <filter> from among <cards> into your hand" (rules § Keywords and
 * Effects → Erode, and § Zones → Hand): the controller chooses one of the
 * cards `among` names that matches the filter and the cost bound, and puts
 * it into their hand (`cardTaken`). With `optional` ("You may") they may
 * choose none. With no matching card nothing is chosen.
 */
export interface TakeFromAmongNode {
  readonly op: "takeFromAmong";
  readonly among: AmongSource;
  readonly filter: CardFilter;
  /** "≤N● cost": the card's copiable cost, with X counting as 0, is at most this. */
  readonly costAtMost?: number;
  readonly optional: boolean;
}

export const takeFromAmongPrimitive = definePrimitive<TakeFromAmongNode>({
  op: "takeFromAmong",
  children: (node) => (node.among.kind === "movedBy" ? [node.among.effect] : []),
  resolve(ctx, node, env) {
    const side = env.controller;
    const among = node.among.kind === "movedBy" ? cardsMovedBy(ctx, node.among.effect, env) : [...ctx.state.sides[opponent(side)].hand];
    const layers = characteristics(ctx.state, ctx.catalog);
    const candidates = among.filter(
      (id) =>
        matchesFilter(layers.of(id), node.filter) &&
        (node.costAtMost === undefined || copiableCostOf(ctx.state, ctx.catalog, id) <= node.costAtMost),
    );
    if (candidates.length === 0) return;
    const fromHand = node.among.kind === "opponentHand";
    const chosen = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      ...(fromHand ? { privateTo: side } : {}),
      purpose: env.purpose(fromHand ? "chooseFromOpponentHand" : "chooseAmong"),
      candidates,
      min: node.optional ? 0 : 1,
      max: 1,
    });
    for (const id of chosen) take(ctx, id, side);
  },
});

/** The cards `effect` puts into a void or the Banished zone as it resolves, in the order they arrive. */
function cardsMovedBy(ctx: StepContext, effect: EffectNode, env: EffectEnv): InstanceId[] {
  const since = ctx.state.clock;
  env.run(effect);
  return Object.values(ctx.state.instances)
    .filter((instance) => instance.enteredZoneAt > since && (instance.zone === "void" || instance.zone === "banished"))
    .sort((a, b) => a.enteredZoneAt - b.enteredZoneAt)
    .map((instance) => instance.id);
}

/** Puts `id` into `side`'s hand and announces it; a created card ceases to exist instead. */
function take(ctx: StepContext, id: InstanceId, side: Side): void {
  const { zone: from, controller: holder } = instanceOf(ctx.state, id);
  if (moveToHand(ctx, id, side) === "hand") ctx.emit({ kind: "cardTaken", side, instance: id, from, holder });
}

/** The cards `effect` moves: "<effect>. … from among those cards …". */
export function movedBy(effect: EffectNode): AmongSource {
  return { kind: "movedBy", effect };
}

/** The opponent's hand, looked at by the controller. */
export function opponentHand(): AmongSource {
  return { kind: "opponentHand" };
}

export function takeFromAmong(
  among: AmongSource,
  options: { readonly filter?: CardFilter; readonly costAtMost?: number; readonly optional?: boolean } = {},
): TakeFromAmongNode {
  return {
    op: "takeFromAmong",
    among,
    filter: options.filter ?? {},
    ...(options.costAtMost === undefined ? {} : { costAtMost: options.costAtMost }),
    optional: options.optional ?? false,
  };
}
