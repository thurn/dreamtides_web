import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef } from "../../dsl/types";
import { definePrimitive } from "../types";

/**
 * "Cards you reclaim are not banished when they leave play" (rules §
 * Reclaim), layer 6: while a static ability holds it, a reclaimed card
 * `player` owns (only its owner can play it from the void by Reclaim) does
 * not have the reclaimed status while it is in play or on the stack, so it
 * goes where it normally would as it leaves: a character to the void when it
 * is dissolved, an event to the void as it resolves or is Prevented. Whether
 * a card is banished is decided as it would leave (rules/zones.ts
 * `banishedAsReclaimed`), so a card leaving after the ability stops applying
 * is banished. It is a static "have" only (`staticOnly`): resolving it is an
 * engine error.
 */
export interface ReclaimNotBanishedNode {
  readonly op: "reclaimNotBanished";
  readonly player: PlayerRef;
}

export const reclaimNotBanishedPrimitive = definePrimitive<ReclaimNotBanishedNode>({
  op: "reclaimNotBanished",
  staticOnly: true,
  continuous: {
    layer: 6,
    changes(node, env) {
      return [{ kind: "reclaimNotBanished", player: resolvePlayer(env.controller, node.player) }];
    },
  },
});

/** "Cards <you> reclaim are not banished when they leave play", held by a static ability. */
export function reclaimNotBanished(player: PlayerRef = "you"): ReclaimNotBanishedNode {
  return { op: "reclaimNotBanished", player };
}
