import type { ValueExpr } from "../../dsl/types";
import type { ArrangePrompt } from "../../prompts/types";
import { instanceOf, moveInstance } from "../../rules/zones";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** "Foresee N": look at the top N cards, put any into the void, and the rest back on top in any order. */
export interface ForeseeNode {
  readonly op: "foresee";
  readonly count: ValueExpr;
}

export const foreseePrimitive = definePrimitive<ForeseeNode>({
  op: "foresee",
  resolve(ctx, node, env) {
    const side = env.controller;
    const cards = ctx.state.sides[side].deck.slice(0, evaluate(ctx, node.count, env));
    if (cards.length === 0) return;
    const arrangement = ctx.choose<ArrangePrompt>({
      kind: "arrange",
      side,
      privateTo: side,
      purpose: { source: env.source, cardId: instanceOf(ctx.state, env.source).cardId, ability: 0, role: "foresee" },
      cards,
      destinations: [
        { to: "top", min: 0, max: cards.length },
        { to: "void", min: 0, max: cards.length },
      ],
    });
    const top = arrangement.filter((entry) => entry.to === "top").map((entry) => entry.card);
    for (const entry of arrangement) {
      if (entry.to === "void") moveInstance(ctx, entry.card, "void");
    }
    const deck = ctx.state.sides[side].deck;
    ctx.state.sides[side].deck = [...top, ...deck.filter((card) => !top.includes(card))];
  },
});

export function foresee(count: ValueExpr): ForeseeNode {
  return { op: "foresee", count };
}
