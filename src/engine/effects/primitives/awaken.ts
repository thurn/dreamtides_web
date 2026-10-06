import type { CharacterRef } from "../../dsl/types";
import { instanceOf } from "../../rules/zones";
import { resolveCharacters } from "../interpreter";
import { characterTarget, definePrimitive } from "../types";

/** "Awaken a character": it loses the exhausted status. */
export interface AwakenNode {
  readonly op: "awaken";
  readonly subject: CharacterRef;
}

export const awakenPrimitive = definePrimitive<AwakenNode>({
  op: "awaken",
  targets: (node) => characterTarget(node.subject),
  resolve(ctx, node, env) {
    for (const id of resolveCharacters(ctx, node.subject, env)) {
      instanceOf(ctx.state, id).status.exhausted = false;
      ctx.emit({ kind: "exhaustionChanged", instance: id, exhausted: false });
    }
  },
});

export function awaken(subject: CharacterRef): AwakenNode {
  return { op: "awaken", subject };
}
