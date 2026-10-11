import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef } from "../../dsl/types";
import { effectEnergy } from "../../rules/resources";
import { definePrimitive } from "../types";

/** Doubles a player's current energy at resolution, preserving maximum energy. */
export interface DoubleEnergyNode {
  readonly op: "doubleEnergy";
  readonly player: PlayerRef;
}

export const doubleEnergyPrimitive = definePrimitive<DoubleEnergyNode>({
  op: "doubleEnergy",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    effectEnergy(ctx, side, ctx.state.sides[side].currentEnergy, 0);
  },
});

export function doubleEnergy(player: PlayerRef = "you"): DoubleEnergyNode {
  return { op: "doubleEnergy", player };
}
