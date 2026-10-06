import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef, ValueExpr } from "../../dsl/types";
import { drawCard } from "../../rules/resources";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** "Draw N cards", or with `ephemeral` "Draw N cards with ephemeral" (banished during Ending while still in hand). */
export interface DrawNode {
  readonly op: "draw";
  readonly count: ValueExpr;
  readonly player: PlayerRef;
  readonly ephemeral?: boolean;
}

export const drawPrimitive = definePrimitive<DrawNode>({
  op: "draw",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const count = evaluate(ctx, node.count, env);
    for (let index = 0; index < count; index++) drawCard(ctx, side, node.ephemeral === true);
  },
});

export function draw(count: ValueExpr, player: PlayerRef = "you", options: { readonly ephemeral?: boolean } = {}): DrawNode {
  return { op: "draw", count, player, ...(options.ephemeral === true ? { ephemeral: true } : {}) };
}
