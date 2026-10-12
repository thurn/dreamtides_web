import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef, ValueExpr } from "../../dsl/types";
import { effectEnergy } from "../../rules/resources";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** "Lose N●": current energy stops at 0; this effect is not a payment. */
export interface LoseEnergyNode {
  readonly op: "loseEnergy";
  readonly amount: ValueExpr;
  readonly player: PlayerRef;
}

export const loseEnergyPrimitive = definePrimitive<LoseEnergyNode>({
  op: "loseEnergy",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    effectEnergy(ctx, side, -Math.max(0, evaluate(ctx, node.amount, env)), 0);
  },
});

export function loseEnergy(amount: ValueExpr, player: PlayerRef = "you"): LoseEnergyNode {
  return { op: "loseEnergy", amount, player };
}
