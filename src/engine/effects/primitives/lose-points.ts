import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef, ValueExpr } from "../../dsl/types";
import { gainPoints } from "../../rules/resources";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** "Lose N⍟": loss stops at 0 (C14), and never counts as a character scoring. */
export interface LosePointsNode {
  readonly op: "losePoints";
  readonly amount: ValueExpr;
  readonly player: PlayerRef;
}

export const losePointsPrimitive = definePrimitive<LosePointsNode>({
  op: "losePoints",
  resolve(ctx, node, env) {
    gainPoints(ctx, resolvePlayer(env.controller, node.player), -Math.max(0, evaluate(ctx, node.amount, env)), "effect");
  },
});

export function losePoints(amount: ValueExpr, player: PlayerRef = "you"): LosePointsNode {
  return { op: "losePoints", amount, player };
}
