import type { CharacterRef } from "../../dsl/types";
import { returnToHand as returnCharacter } from "../../rules/zones";
import { resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/** "Return a character to hand". */
export interface ReturnToHandNode {
  readonly op: "returnToHand";
  readonly subject: CharacterRef;
}

export const returnToHandPrimitive = definePrimitive<ReturnToHandNode>({
  op: "returnToHand",
  targets: (node) => (node.subject.kind === "target" ? [node.subject] : []),
  resolve(ctx, node, env) {
    for (const id of resolveCharacters(ctx, node.subject, env)) returnCharacter(ctx, id);
  },
});

export function returnToHand(subject: CharacterRef): ReturnToHandNode {
  return { op: "returnToHand", subject };
}
