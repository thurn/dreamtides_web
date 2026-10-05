import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef, ValueExpr } from "../../dsl/types";
import { gainPoints as addPoints } from "../../rules/resources";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** "Gain N⍟" (or lose, for a negative amount); a total never goes below 0 (C14). Not a character scoring. */
export interface GainPointsNode {
  readonly op: "gainPoints";
  readonly amount: ValueExpr;
  readonly player: PlayerRef;
}

export const gainPointsPrimitive = definePrimitive<GainPointsNode>({
  op: "gainPoints",
  resolve(ctx, node, env) {
    addPoints(ctx, resolvePlayer(env.controller, node.player), evaluate(ctx, node.amount, env), "effect");
  },
});

export function gainPoints(amount: ValueExpr, player: PlayerRef = "you"): GainPointsNode {
  return { op: "gainPoints", amount, player };
}
