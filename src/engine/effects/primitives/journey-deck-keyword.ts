import type { CardFilter, PlayerRef } from "../../dsl/types";
import { definePrimitive } from "../types";

/** C4: matching original physical journey-deck cards, wherever they are. */
export interface JourneyDeckKeywordNode {
  readonly op: "journeyDeckKeyword";
  readonly player: PlayerRef;
  readonly filter: CardFilter;
  readonly keyword: "awakened";
}

export const journeyDeckKeywordPrimitive = definePrimitive<JourneyDeckKeywordNode>({
  op: "journeyDeckKeyword",
  staticOnly: true,
  resolve() { throw new Error("Journey-deck keywords belong to a static ability"); },
  continuous: {
    layer: 3,
    changes(node, env) {
      return env.journeyDeckCards(node.player, node.filter).map(instance => ({ kind: "keyword", instance, keyword: node.keyword, gains: true }));
    },
  },
});

/** Static "matching cards from your journey deck have Awakened"; never a floating grant. */
export function journeyDeckKeyword(player: PlayerRef, filter: CardFilter, keyword: "awakened"): JourneyDeckKeywordNode {
  return { op: "journeyDeckKeyword", player, filter, keyword };
}
