import type { CharacterRef } from "../../dsl/types";
import { banish as banishCharacter } from "../../rules/zones";
import { resolveCharacters } from "../interpreter";
import { characterTarget, definePrimitive } from "../types";

/** "Banish a character": removes it from play to its owner's Banished zone. */
export interface BanishNode {
  readonly op: "banish";
  readonly subject: CharacterRef;
}

export const banishPrimitive = definePrimitive<BanishNode>({
  op: "banish",
  targets: (node) => characterTarget(node.subject),
  resolve(ctx, node, env) {
    for (const id of resolveCharacters(ctx, node.subject, env)) banishCharacter(ctx, id);
  },
});

export function banish(subject: CharacterRef): BanishNode {
  return { op: "banish", subject };
}
