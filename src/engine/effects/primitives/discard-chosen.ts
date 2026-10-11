import { cardMatchesFilter } from "../../continuous/characteristics";
import type { CardFilter } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { discardCard } from "../../rules/resources";
import { opponent } from "../../state/ids";
import { definePrimitive } from "../types";

/** The controller privately chooses one matching card of the opponent's hand to discard. */
export interface DiscardChosenNode {
  readonly op: "discardChosen";
  readonly filter: CardFilter;
}

export const discardChosenPrimitive = definePrimitive<DiscardChosenNode>({
  op: "discardChosen",
  resolve(ctx, node, env) {
    const side = opponent(env.controller);
    const candidates = ctx.state.sides[side].hand.filter((id) =>
      cardMatchesFilter(ctx.state, ctx.catalog, id, node.filter),
    );
    if (candidates.length === 0) return;
    const [chosen] = ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side: env.controller,
      privateTo: env.controller,
      purpose: env.purpose("discardChosen"),
      candidates,
      min: 1,
      max: 1,
    });
    if (chosen === undefined) throw new Error("discardChosen answered with no card");
    discardCard(ctx, side, chosen);
  },
});

export function discardChosen(filter: CardFilter = {}): DiscardChosenNode {
  return { op: "discardChosen", filter };
}
