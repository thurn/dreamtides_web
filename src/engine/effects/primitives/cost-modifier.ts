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

/** A static change to the nth matching play's normal base or whole energy payment. */
export interface CostModifierNthNode {
  readonly op: "costModifierNth";
  readonly player: PlayerRef;
  readonly filter: CardFilter;
  readonly nth: number;
  readonly mode: "set" | "reduce";
  readonly amount: number;
}

export const costModifierNthPrimitive = definePrimitive<CostModifierNthNode>({
  op: "costModifierNth",
  staticOnly: true,
  resolve() {
    throw new Error("costModifierNth is a static ability and never resolves");
  },
  continuous: {
    layer: 6,
    changes(node, env) {
      return [{ kind: "cost", player: resolvePlayer(env.controller, node.player), filter: node.filter,
        amount: node.mode === "reduce" ? -node.amount : node.amount, next: false, nth: node.nth,
        ...(node.mode === "set" ? { mode: "set" as const } : {}) }];
    },
  },
});

/** Earlier committed matching plays determine the ordinal before paying (RD-hv-umm2.104-1). */
export function costModifierNth(
  player: PlayerRef,
  filter: CardFilter,
  nth: number,
  change: { readonly set: number } | { readonly reduce: number },
): CostModifierNthNode {
  const mode = "set" in change ? "set" : "reduce";
  const amount = "set" in change ? change.set : change.reduce;
  if (!Number.isSafeInteger(nth) || nth < 1 || !Number.isSafeInteger(amount) || amount < 0) {
    throw new Error("costModifierNth requires a positive whole ordinal and nonnegative whole energy amount");
  }
  return { op: "costModifierNth", player, filter, nth, mode, amount };
}
