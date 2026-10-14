import { cardMatchesFilter } from "../../continuous/characteristics";
import type { ValueExpr } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { materialize as enterCharacter } from "../../rules/zones";
import { evaluate } from "../interpreter";
import { definePrimitive } from "../types";

/** Privately choose one current hand character within the resolving copiable-cost maximum. */
export interface MaterializeChosenNode {
  readonly op: "materializeChosen";
  readonly costAtMost: ValueExpr;
}

export const materializeChosenPrimitive = definePrimitive<MaterializeChosenNode>({
  op: "materializeChosen",
  entersPlay: true,
  resolve(ctx, node, env) {
    const side = env.controller;
    const maximum = evaluate(ctx, node.costAtMost, env);
    const candidates = ctx.state.sides[side].hand.filter((id) =>
      cardMatchesFilter(ctx.state, ctx.catalog, id, { cardType: "character", costAtMost: maximum }),
    );
    if (candidates.length === 0) return;
    const [chosen] = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards", side, privateTo: side, purpose: env.purpose("materializeChosen"),
      candidates, min: 1, max: 1,
    });
    if (chosen === undefined) throw new Error("materializeChosen answered without a card");
    enterCharacter(ctx, chosen, side);
  },
});

/** Materialize one character chosen privately from your hand; compose `optional` for "You may". */
export function materializeChosen(costAtMost: ValueExpr): MaterializeChosenNode {
  return { op: "materializeChosen", costAtMost };
}
