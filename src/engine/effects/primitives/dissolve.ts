import type { CharacterRef } from "../../dsl/types";
import { dissolve as dissolveCharacter } from "../../rules/zones";
import { resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/** "Dissolve a character": moves it from play to its owner's void. */
export interface DissolveNode {
  readonly op: "dissolve";
  readonly subject: CharacterRef;
}

export const dissolvePrimitive = definePrimitive<DissolveNode>({
  op: "dissolve",
  targets: (node) => (node.subject.kind === "target" ? [node.subject] : []),
  resolve(ctx, node, env) {
    for (const id of resolveCharacters(ctx, node.subject, env)) dissolveCharacter(ctx, id);
  },
});

export function dissolve(subject: CharacterRef): DissolveNode {
  return { op: "dissolve", subject };
}
