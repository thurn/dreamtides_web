import type { CharacterRef, Duration } from "../../dsl/types";
import { startContinuous } from "../../continuous/resolve";
import { resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "… has all character types" (layer 2): selectors and filters naming any
 * subtype match it. `duration` `null` takes the enclosing `forDuration`'s,
 * else lasts permanently.
 */
export interface GiveAllTypesNode {
  readonly op: "giveAllTypes";
  readonly subject: CharacterRef;
  readonly duration: Duration | null;
}

export const giveAllTypesPrimitive = definePrimitive<GiveAllTypesNode>({
  op: "giveAllTypes",
  targets: (node) => (node.subject.kind === "target" ? [node.subject] : []),
  resolve(ctx, node, env) {
    const ids = resolveCharacters(ctx, node.subject, env);
    startContinuous(ctx, env, node.duration, ids, ids.map((instance) => ({ kind: "allTypes", instance })));
  },
  continuous: {
    layer: 2,
    changes(node, env) {
      return env.characters(node.subject).map((instance) => ({ kind: "allTypes", instance }));
    },
  },
});

export function giveAllTypes(subject: CharacterRef, duration: Duration | null = null): GiveAllTypesNode {
  return { op: "giveAllTypes", subject, duration };
}
