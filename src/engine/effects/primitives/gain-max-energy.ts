import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef, ValueExpr } from "../../dsl/types";
import { setEnergy } from "../../rules/resources";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** "Gain N maximum ●": raises energy production permanently, and current ● with it. */
export interface GainMaxEnergyNode {
  readonly op: "gainMaxEnergy";
  readonly amount: ValueExpr;
  readonly player: PlayerRef;
}

export const gainMaxEnergyPrimitive = definePrimitive<GainMaxEnergyNode>({
  op: "gainMaxEnergy",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const state = ctx.state.sides[side];
    const amount = evaluate(ctx, node.amount, env);
    setEnergy(ctx, side, state.currentEnergy + amount, state.maxEnergy + amount);
  },
});

export function gainMaxEnergy(amount: ValueExpr, player: PlayerRef = "you"): GainMaxEnergyNode {
  return { op: "gainMaxEnergy", amount, player };
}
