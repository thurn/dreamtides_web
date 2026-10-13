import { matchesFilter } from "../../continuous/characteristics";
import { fixedEnergy } from "../../dsl/energy";
import { resolvePlayer } from "../../dsl/selectors";
import { BASE_VARIANT, type CardFilter, type PlayerRef } from "../../dsl/types";
import { createInstance } from "../../rules/zones";
import { definePrimitive } from "../types";

/** One private created base card, sampled uniformly from the holder's matching fixed pool entries (C11). */
export interface CreateRandomFromPoolNode {
  readonly op: "createRandomFromPool";
  readonly filter: CardFilter;
  readonly player: PlayerRef;
}

export const createRandomFromPoolPrimitive = definePrimitive<CreateRandomFromPoolNode>({
  op: "createRandomFromPool",
  resolve(ctx, node, env) {
    const side = resolvePlayer(env.controller, node.player);
    const candidates = (ctx.state.draftPools?.[side] ?? []).filter((cardId) => {
      const card = ctx.catalog.card(cardId);
      return matchesFilter({ ...card, allTypes: false, cost: fixedEnergy(card.costs),
        spark: card.spark === null ? null : Math.max(0, card.spark === "x" ? 0 : card.spark) }, node.filter);
    });
    if (candidates.length === 0) return;
    const cardId = candidates[Math.floor(ctx.random("random:dreamsign") * candidates.length)];
    if (cardId === undefined) throw new Error("Invalid random draft-pool selection");
    const created = createInstance(ctx, { kind: "card", cardId }, side, BASE_VARIANT, "hand");
    ctx.state.sides[side].hand.push(created.id);
  },
});

export function createRandomFromPool(filter: CardFilter = {}, player: PlayerRef = "you"): CreateRandomFromPoolNode {
  return { op: "createRandomFromPool", filter, player };
}
