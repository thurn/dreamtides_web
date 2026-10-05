import type { CharacterRef } from "../../dsl/types";
import { instanceOf } from "../../rules/zones";
import { resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/** "Exhaust a character". */
export interface ExhaustNode {
  readonly op: "exhaust";
  readonly subject: CharacterRef;
}

export const exhaustPrimitive = definePrimitive<ExhaustNode>({
  op: "exhaust",
  targets: (node) => (node.subject.kind === "target" ? [node.subject] : []),
  resolve(ctx, node, env) {
    for (const id of resolveCharacters(ctx, node.subject, env)) {
      instanceOf(ctx.state, id).status.exhausted = true;
      ctx.emit({ kind: "exhaustionChanged", instance: id, exhausted: true });
    }
  },
});

export function exhaust(subject: CharacterRef): ExhaustNode {
  return { op: "exhaust", subject };
}
