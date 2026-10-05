import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef, ValueExpr } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { discardCard } from "../../rules/resources";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/**
 * "Discard N cards": the discarding player chooses, or with `random` the
 * cards come from the `random:discard` stream. With fewer cards in hand, the
 * whole hand is discarded.
 */
export interface DiscardNode {
  readonly op: "discard";
  readonly count: ValueExpr;
  readonly player: PlayerRef;
  readonly random: boolean;
}

export const discardPrimitive = definePrimitive<DiscardNode>({
  op: "discard",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const hand = ctx.state.sides[side].hand.filter((card) => card !== env.source);
    const count = Math.min(evaluate(ctx, node.count, env), hand.length);
    if (count <= 0) return;
    let chosen: readonly (typeof hand)[number][];
    if (node.random) {
      const pool = [...hand];
      chosen = Array.from({ length: count }, () => {
        const [card] = pool.splice(Math.floor(ctx.random("random:discard") * pool.length), 1);
        if (card === undefined) throw new Error("random discard from an empty pool");
        return card;
      });
    } else {
      chosen = ctx.choose<ChooseCardsPrompt>({
        kind: "chooseCards",
        side,
        purpose: env.purpose("discard"),
        candidates: hand,
        min: count,
        max: count,
      });
    }
    for (const card of chosen) discardCard(ctx, side, card);
  },
});

export function discard(count: ValueExpr, player: PlayerRef = "you"): DiscardNode {
  return { op: "discard", count, player, random: false };
}

export function discardRandom(count: ValueExpr, player: PlayerRef = "you"): DiscardNode {
  return { op: "discard", count, player, random: true };
}
