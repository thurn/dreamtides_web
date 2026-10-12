import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef } from "../../dsl/types";
import { drawDreamwell as drawNextDreamwell } from "../../rules/dreamwell";
import { definePrimitive } from "../types";

/** Draws one additional shared Dreamwell card, including its energy and bonus. */
export interface DrawDreamwellNode {
  readonly op: "drawDreamwell";
  readonly player: PlayerRef;
}

export const drawDreamwellPrimitive = definePrimitive<DrawDreamwellNode>({
  op: "drawDreamwell",
  resolve(ctx, node, env) {
    drawNextDreamwell(ctx, resolvePlayer(env.controller, node.player));
  },
});

export function drawDreamwell(player: PlayerRef = "you"): DrawDreamwellNode {
  return { op: "drawDreamwell", player };
}
