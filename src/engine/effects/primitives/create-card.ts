import { resolvePlayer } from "../../dsl/selectors";
import { BASE_VARIANT, type PlayerRef } from "../../dsl/types";
import { createInstance } from "../../rules/zones";
import type { CardId } from "../../state/ids";
import { definePrimitive } from "../types";

/**
 * "Create 'Contemplation' in your hand": `count` new created cards of the
 * catalog card `card`, base variant, each added to the hand `player` holds
 * (rules § Created Cards). Each one is a created card from the start, so it
 * ceases to exist instead of moving to a deck, a hand, a void, or the
 * Banished zone. Its `cardCreated` event is private to the side holding it.
 */
export interface CreateCardNode {
  readonly op: "createCard";
  readonly card: CardId;
  readonly count: number;
  readonly player: PlayerRef;
}

export const createCardPrimitive = definePrimitive<CreateCardNode>({
  op: "createCard",
  resolve(ctx, node, env) {
    // An unknown card fails the step before any card is created.
    ctx.catalog.card(node.card);
    const side = resolvePlayer(env.controller, node.player);
    for (let index = 0; index < node.count; index++) {
      const created = createInstance(ctx, { kind: "card", cardId: node.card }, side, BASE_VARIANT, "hand");
      ctx.state.sides[side].hand.push(created.id);
    }
  },
});

export function createCard(card: CardId, count = 1, player: PlayerRef = "you"): CreateCardNode {
  if (!Number.isInteger(count) || count < 1) throw new Error(`createCard: expected a positive whole count, got ${count}`);
  return { op: "createCard", card, count, player };
}
