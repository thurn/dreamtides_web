import { cardMatchesFilter } from "../../continuous/characteristics";
import type { ZoneCardSpec } from "../../dsl/types";
import type { InstanceId } from "../../state/ids";
import { materialize as enterCharacter } from "../../rules/zones";
import { resolveCards } from "../interpreter";
import { cardTarget, definePrimitive } from "../types";
import type { DiscoverNode } from "./discover";

/**
 * Put the referenced zone cards, or the character just discovered, into
 * play; "… with awakened" (`awakened`) enters them without the exhausted
 * status (RD-hv-umm2.93-2). `zeroSpark` sets a permanent zero base before
 * entry observers, preserving additive spark (RD-hv-umm2.625-1).
 */
export interface MaterializeNode {
  readonly op: "materialize";
  readonly from: ZoneCardSpec | DiscoverNode;
  readonly awakened?: true;
  readonly zeroSpark?: true;
}

export const materializePrimitive = definePrimitive<MaterializeNode>({
  op: "materialize",
  entersPlay: true,
  children: (node) => "op" in node.from ? [node.from] : [],
  targets: (node) => "op" in node.from ? [] : cardTarget(node.from),
  resolve(ctx, node, env) {
    let candidates: InstanceId[];
    if ("op" in node.from) {
      const since = ctx.state.clock;
      env.run(node.from);
      candidates = ctx.state.sides[env.controller].hand.filter((id) => ctx.state.instances[id].enteredZoneAt > since);
    } else {
      const ref = node.from;
      const selected = new Set(resolveCards(ctx, ref, env));
      // Zone references name one source zone. Its physical order controls
      // placement and which characters fit when only part can enter.
      candidates = (["player", "enemy"] as const).flatMap((side) => ctx.state.sides[side][ref.zone].filter((id) => selected.has(id)));
    }
    for (const id of candidates) {
      if (cardMatchesFilter(ctx.state, ctx.catalog, id, { cardType: "character" })) enterCharacter(ctx, id, env.controller, undefined, node.awakened === true, node.zeroSpark === true ? env.source : undefined);
    }
  },
});

export function materialize(from: ZoneCardSpec | DiscoverNode, options: { readonly awakened?: boolean; readonly zeroSpark?: boolean } = {}): MaterializeNode {
  return { op: "materialize", from, ...(options.awakened === true ? { awakened: true } : {}), ...(options.zeroSpark === true ? { zeroSpark: true } : {}) };
}
