import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef, ValueExpr } from "../../dsl/types";
import { erodeCard } from "../../rules/resources";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** "Erode N": the top N cards of the player's deck go to the void; an empty deck causes Fatigue. */
export interface ErodeNode {
  readonly op: "erode";
  readonly count: ValueExpr;
  readonly player: PlayerRef;
}

export const erodePrimitive = definePrimitive<ErodeNode>({
  op: "erode",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const count = evaluate(ctx, node.count, env);
    for (let index = 0; index < count; index++) erodeCard(ctx, side);
  },
});

export function erode(count: ValueExpr, player: PlayerRef = "you"): ErodeNode {
  return { op: "erode", count, player };
}
