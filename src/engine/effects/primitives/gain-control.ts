import type { CharacterRef } from "../../dsl/types";
import { gainControl as takeControl } from "../../rules/zones";
import { resolveCharacters } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "Gain control of an enemy": it moves to the controller's leftmost open
 * back-rank position, exhausted through this turn's Ending; it fails when
 * that rank is full.
 */
export interface GainControlNode {
  readonly op: "gainControl";
  readonly subject: CharacterRef;
}

export const gainControlPrimitive = definePrimitive<GainControlNode>({
  op: "gainControl",
  targets: (node) => (node.subject.kind === "target" ? [node.subject] : []),
  resolve(ctx, node, env) {
    for (const id of resolveCharacters(ctx, node.subject, env)) takeControl(ctx, id, env.controller);
  },
});

export function gainControl(subject: CharacterRef): GainControlNode {
  return { op: "gainControl", subject };
}
