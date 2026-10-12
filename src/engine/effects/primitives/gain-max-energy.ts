import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef, ValueExpr } from "../../dsl/types";
import { effectEnergy } from "../../rules/resources";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** "Gain N maximum ●": raises energy production permanently without changing current ●. */
export interface GainMaxEnergyNode {
  readonly op: "gainMaxEnergy";
  readonly amount: ValueExpr;
  readonly player: PlayerRef;
}

export const gainMaxEnergyPrimitive = definePrimitive<GainMaxEnergyNode>({
  op: "gainMaxEnergy",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const amount = evaluate(ctx, node.amount, env);
    effectEnergy(ctx, side, 0, amount);
  },
});

export function gainMaxEnergy(amount: ValueExpr, player: PlayerRef = "you"): GainMaxEnergyNode {
  return { op: "gainMaxEnergy", amount, player };
}
