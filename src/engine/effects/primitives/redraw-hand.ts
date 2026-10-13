import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef } from "../../dsl/types";
import { discardCards, drawCard } from "../../rules/resources";
import { definePrimitive } from "../types";

/** Discard the whole hand, then draw that many cards, including cards replaced on leaving hand. */
export interface RedrawHandNode {
  readonly op: "redrawHand";
  readonly player: PlayerRef;
}

export const redrawHandPrimitive = definePrimitive<RedrawHandNode>({
  op: "redrawHand",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const hand = [...ctx.state.sides[side].hand];
    discardCards(ctx, side, hand);
    for (let index = 0; index < hand.length; index++) drawCard(ctx, side);
  },
});

export function redrawHand(player: PlayerRef = "you"): RedrawHandNode {
  return { op: "redrawHand", player };
}
