import type { ResolvingEffect } from "../registry";
import { opponent } from "../../state/ids";
import { everyNode, everyTarget, resolveNode } from "../interpreter";
import { primitiveDefinition } from "../registry";
import { definePrimitive, type ResolvingPrimitiveDefinition, type EffectEnv } from "../types";

/**
 * "Each player …": `effect` resolves once for each player, the active player
 * first, then the opposing player, with that player as its "you" (rules §
 * Keywords and Effects → Each player, RD-hv-umm2.62-1). Each player's part
 * finishes, its prompts answered by that player, before the next begins.
 *
 * The effect holds no play-time choice: a target or a mode would be chosen
 * once, by the card's controller, for parts other players carry out, so the
 * builder rejects one.
 */
export interface EachPlayerNode {
  readonly op: "eachPlayer";
  readonly effect: ResolvingEffect;
}

export const eachPlayerPrimitive: ResolvingPrimitiveDefinition<EachPlayerNode> = definePrimitive<EachPlayerNode>({
  op: "eachPlayer",
  children: (node) => [node.effect],
  resolve(ctx, node, env) {
    const active = ctx.state.turn.active;
    for (const side of [active, opponent(active)]) {
      const inner: EffectEnv = {
        ...env,
        controller: side,
        run(effect) {
          resolveNode(ctx, effect, inner);
        },
      };
      inner.run(node.effect);
    }
  },
});

export function eachPlayer(effect: ResolvingEffect): EachPlayerNode {
  if (everyTarget(effect).length > 0) throw new Error("eachPlayer cannot hold a play-time target");
  if (everyNode(effect).some((node) => primitiveDefinition(node.op).modes !== undefined)) {
    throw new Error("eachPlayer cannot hold a modal choice");
  }
  return { op: "eachPlayer", effect };
}
