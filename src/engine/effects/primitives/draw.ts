import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef, ValueExpr } from "../../dsl/types";
import { drawCard } from "../../rules/resources";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** "Draw N cards." */
export interface DrawNode {
  readonly op: "draw";
  readonly count: ValueExpr;
  readonly player: PlayerRef;
}

export const drawPrimitive = definePrimitive<DrawNode>({
  op: "draw",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const count = evaluate(ctx, node.count, env);
    for (let index = 0; index < count; index++) drawCard(ctx, side);
  },
});

export function draw(count: ValueExpr, player: PlayerRef = "you"): DrawNode {
  return { op: "draw", count, player };
}
