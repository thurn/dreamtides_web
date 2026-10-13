import { resolvePlayer } from "../../dsl/selectors";
import type { PlayerRef } from "../../dsl/types";
import type { ChooseCardsPrompt } from "../../prompts/types";
import { discardCards, drawCard } from "../../rules/resources";
import { definePrimitive } from "../types";

/** The holder chooses any hand subset, discards it once, then draws that completed count. */
export interface RedrawChosenHandNode {
  readonly op: "redrawChosenHand";
  readonly player: PlayerRef;
}

export const redrawChosenHandPrimitive = definePrimitive<RedrawChosenHandNode>({
  op: "redrawChosenHand",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const hand = [...ctx.state.sides[side].hand];
    const selected = new Set(ctx.choose<ChooseCardsPrompt>({
      kind: "chooseCards",
      side,
      purpose: env.purpose("discard"),
      candidates: hand,
      min: 0,
      max: hand.length,
    }));
    const discarded = discardCards(ctx, side, hand.filter((id) => selected.has(id)));
    for (let index = 0; index < discarded; index++) drawCard(ctx, side);
  },
});

export function redrawChosenHand(player: PlayerRef = "you"): RedrawChosenHandNode {
  return { op: "redrawChosenHand", player };
}
