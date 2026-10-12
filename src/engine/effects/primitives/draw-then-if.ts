import { cardMatchesFilter } from "../../continuous/characteristics";
import { resolvePlayer } from "../../dsl/selectors";
import type { CardFilter, PlayerRef } from "../../dsl/types";
import { drawCard } from "../../rules/resources";
import { resolveChosenEffect } from "../interpreter";
import { definePrimitive, type EffectNode } from "../types";

/** Draw one ordinary top card, then conditionally act on that successful draw's current characteristics. */
export interface DrawThenIfNode {
  readonly op: "drawThenIf";
  readonly filter: CardFilter;
  readonly then: EffectNode;
  readonly player: PlayerRef;
}

export const drawThenIfPrimitive = definePrimitive<DrawThenIfNode>({
  op: "drawThenIf",
  deferConditionalChoices: true,
  // The branch is reached after the draw, including for played cards whose ordinary choices are prepared earlier.
  deferred: (node) => [node.then],
  resolve(ctx, node, env) {
    const drawn = drawCard(ctx, resolvePlayer(env.controller, node.player));
    if (drawn === null || !cardMatchesFilter(ctx.state, ctx.catalog, drawn, node.filter)) return;
    resolveChosenEffect(ctx, node.then, env, true);
  },
});

/** "Draw a card. If it is [filter], [then]." The child's "you" retains the ability's controller. */
export function drawThenIf(filter: CardFilter, then: EffectNode, player: PlayerRef = "you"): DrawThenIfNode {
  return { op: "drawThenIf", filter, then, player };
}
