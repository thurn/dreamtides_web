import type { CardFilter } from "../../dsl/types";
import { playCharacterImmediately } from "../../rules/immediate-play";
import { definePrimitive } from "../types";

/** One optional owned-void character play during resolution, for normal costs or available Reclaim. */
export interface PlayImmediatelyNode {
  readonly op: "playImmediately";
  readonly filter: CardFilter;
}

export const playImmediatelyPrimitive = definePrimitive<PlayImmediatelyNode>({
  op: "playImmediately",
  entersPlay: true,
  resolve(ctx, node, env) {
    if (node.filter.cardType !== "character") throw new Error("Immediate play names characters only");
    playCharacterImmediately(ctx, env.controller, node.filter, env.purpose("target"));
  },
});

/** The effect supplies the moment of play, never a lasting permission. Declining pays and moves nothing. */
export function playImmediately(zone: "void", filter: CardFilter & { readonly cardType?: "character" } = {}): PlayImmediatelyNode {
  if (zone !== "void" || (filter.cardType !== undefined && filter.cardType !== "character")) throw new Error("Immediate play names owned-void characters only");
  return { op: "playImmediately", filter: { ...filter, cardType: "character" } };
}
