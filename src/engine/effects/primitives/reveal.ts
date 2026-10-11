import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef } from "../../dsl/types";
import { revealToBoth } from "../../view/knowledge";
import { definePrimitive } from "../types";

/** Reveal a player's whole hand to both sides, keeping its cards in hand. */
export interface RevealNode {
  readonly op: "reveal";
  readonly player: PlayerRef;
}

export const revealPrimitive = definePrimitive<RevealNode>({
  op: "reveal",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const instances = [...ctx.state.sides[side].hand];
    if (instances.length === 0) return;
    revealToBoth(ctx.state, instances);
    ctx.emit({ kind: "revealed", side, instances });
  },
});

export function reveal(player: PlayerRef = "you"): RevealNode {
  return { op: "reveal", player };
}
