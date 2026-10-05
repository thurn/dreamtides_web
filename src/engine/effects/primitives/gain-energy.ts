import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef, ValueExpr } from "../../dsl/types";
import { setEnergy } from "../../rules/resources";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** "Gain N●": adds to current energy for this turn only. */
export interface GainEnergyNode {
  readonly op: "gainEnergy";
  readonly amount: ValueExpr;
  readonly player: PlayerRef;
}

export const gainEnergyPrimitive = definePrimitive<GainEnergyNode>({
  op: "gainEnergy",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const state = ctx.state.sides[side];
    setEnergy(ctx, side, state.currentEnergy + evaluate(ctx, node.amount, env), state.maxEnergy);
  },
});

export function gainEnergy(amount: ValueExpr, player: PlayerRef = "you"): GainEnergyNode {
  return { op: "gainEnergy", amount, player };
}
