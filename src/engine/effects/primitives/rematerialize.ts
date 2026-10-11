import type { CharacterRef } from "../../dsl/types";
import { instanceOf, slotOf } from "../../rules/zones";
import { resolveCharacters } from "../interpreter";
import { characterTarget, definePrimitive } from "../types";

/** Fire an in-play character's materialization again, preserving its current instance and battlefield state. */
export interface RematerializeNode {
  readonly op: "rematerialize";
  readonly subject: CharacterRef;
}

export const rematerializePrimitive = definePrimitive<RematerializeNode>({
  op: "rematerialize",
  targets: (node) => characterTarget(node.subject),
  resolve(ctx, node, env) {
    for (const id of resolveCharacters(ctx, node.subject, env)) {
      const slot = slotOf(ctx.state, id);
      if (slot !== null) ctx.emit({ kind: "materialized", instance: id, side: instanceOf(ctx.state, id).controller, slot });
    }
  },
});

export function rematerialize(subject: CharacterRef): RematerializeNode {
  return { op: "rematerialize", subject };
}
