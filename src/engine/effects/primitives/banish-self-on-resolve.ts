import { banish } from "../../rules/zones";
import { sourceInstance } from "../../state/ids";
import { definePrimitive } from "../types";

/**
 * "Banish this card" on an event (rules § Keywords and Effects → Banish,
 * RD-hv-umm2.475-1). As the instruction resolves, in printed order, the
 * event moves from the stack to its owner's Banished zone, announced by
 * `banished`; having left the stack, it is not then put into its void as it
 * finishes resolving (`resolveTop`). Until then it is on the stack, so an
 * earlier "shuffle your void into your deck" in the same effect never moves
 * it. The ordinary zone change applies its replacements: a copy or other
 * created card ceases to exist instead, and a reclaimed card is banished
 * either way. A source no longer on the stack is not moved, and an emblem
 * holding this effect is a definition error.
 */
export interface BanishSelfOnResolveNode {
  readonly op: "banishSelfOnResolve";
}

export const banishSelfOnResolvePrimitive = definePrimitive<BanishSelfOnResolveNode>({
  op: "banishSelfOnResolve",
  resolve(ctx, _node, env) {
    const source = sourceInstance(env.source);
    if (source === null) throw new Error("an emblem has no card to banish");
    if (ctx.state.instances[source]?.zone !== "stack") return;
    banish(ctx, source);
  },
});

/** "Banish this card" on a resolving event. */
export function banishSelfOnResolve(): BanishSelfOnResolveNode {
  return { op: "banishSelfOnResolve" };
}
