import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef } from "../../dsl/types";
import { definePrimitive } from "../types";

/** A static instruction to reveal the current top of a player's deck. */
export interface RevealDeckTopNode {
  readonly op: "revealDeckTop";
  readonly player: PlayerRef;
}

export const revealDeckTopPrimitive = definePrimitive<RevealDeckTopNode>({
  op: "revealDeckTop",
  staticOnly: true,
  continuous: {
    layer: 6,
    changes(node, env) { return [{ kind: "revealDeckTop", player: resolvePlayer(env.controller, node.player) }]; },
  },
});

/** Reveal the current top while the enclosing static ability applies; this grants no play permission. */
export function revealDeckTop(player: PlayerRef = "you"): RevealDeckTopNode {
  return { op: "revealDeckTop", player };
}
