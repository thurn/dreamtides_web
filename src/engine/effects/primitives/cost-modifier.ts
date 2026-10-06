import { resolvePlayer } from "../../dsl/selectors";
import type { CardFilter, Duration, PlayerRef, ValueExpr } from "../../dsl/types";
import { startContinuous } from "../../continuous/resolve";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "Events cost you 1● more" or "The next character you play this turn costs
 * 2● less" (layer 6): cards `player` plays that match `filter` cost `amount`
 * more, or less when it is negative. A `next` modifier, made by a resolving
 * effect, applies to one card and ends as that card is played. `duration`
 * `null` takes the enclosing `forDuration`'s, else lasts permanently (a
 * `next` modifier then lasts until it is used).
 */
export interface CostModifierNode {
  readonly op: "costModifier";
  readonly player: PlayerRef;
  readonly filter: CardFilter;
  readonly amount: ValueExpr;
  readonly next: boolean;
  readonly duration: Duration | null;
}

export const costModifierPrimitive = definePrimitive<CostModifierNode>({
  op: "costModifier",
  resolve(ctx, node, env) {
    const amount = evaluate(ctx, node.amount, env);
    const player = resolvePlayer(env.controller, node.player);
    startContinuous(ctx, env, node.duration, [], [{ kind: "cost", player, filter: node.filter, amount, next: node.next }]);
  },
  continuous: {
    layer: 6,
    changes(node, env) {
      return [{ kind: "cost", player: resolvePlayer(env.controller, node.player), filter: node.filter, amount: env.value(node.amount), next: false }];
    },
  },
});

export function costModifier(
  player: PlayerRef,
  filter: CardFilter,
  amount: ValueExpr,
  options: { readonly next?: boolean; readonly duration?: Duration } = {},
): CostModifierNode {
  return { op: "costModifier", player, filter, amount, next: options.next === true, duration: options.duration ?? null };
}
