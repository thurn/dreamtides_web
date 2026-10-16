import { filterSubjectOf, matchesEveryCard, matchesFilter } from "../../continuous/characteristics";
import { resolvePlayer } from "../../dsl/selectors";
import type { CardFilter, CountedZone, Keyword, PlayerRef } from "../../dsl/types";
import type { InstanceId } from "../../state/ids";
import type { Layer, StaticEnv } from "../types";
import { definePrimitive } from "../types";

/**
 * Every card in one of a player's hidden or void zones that matches a card
 * filter: "cards in your hand", "events in your void". A hand is the hand of
 * the side holding its cards; a deck or void is its owner's.
 */
export interface CardsInZone {
  readonly kind: "cardsInZone";
  readonly player: PlayerRef;
  readonly zone: CountedZone;
  readonly filter: CardFilter;
}

/**
 * "Cards in your hand have Offering" (layer 3): while a static ability holds
 * it, each card in the zone that matches the filter has the keyword, and
 * loses it as it leaves the zone or the ability stops applying (rules §
 * Ability Types → Static abilities, RD-hv-umm2.52-1). The filter reads the
 * type changes of layer 2 through the evaluation expanding the ability. It is
 * a static "have" only (`staticOnly`), so resolving it is an engine error: a
 * floating record would name hidden cards in the public `effectStarted`
 * event.
 */
export interface GrantCardKeywordNode {
  readonly op: "grantCardKeyword";
  readonly cards: CardsInZone;
  readonly keyword: Keyword;
}

const LAYER: Layer = 3;

export const grantCardKeywordPrimitive = definePrimitive<GrantCardKeywordNode>({
  op: "grantCardKeyword",
  staticOnly: true,
  continuous: {
    layer: LAYER,
    changes(node, env) {
      const { keyword } = node;
      return cardsInZone(env, node.cards).map((instance) => ({ kind: "keyword", instance, keyword, gains: true }));
    },
  },
});

/** The cards a `CardsInZone` covers now, in zone order. */
function cardsInZone(env: StaticEnv, cards: CardsInZone): InstanceId[] {
  const side = resolvePlayer(env.controller, cards.player);
  const ids = env.state.sides[side][cards.zone];
  const { filter } = cards;
  if (matchesEveryCard(filter)) return [...ids];
  return ids.filter((id) => matchesFilter(filterSubjectOf(env.state, env.catalog, id, env.read(id)), filter));
}

/** "<cards> in <your> <zone>": `player`'s cards in `zone` matching `filter`. */
export function cardsIn(zone: CountedZone, filter: CardFilter = {}, player: PlayerRef = "you"): CardsInZone {
  return { kind: "cardsInZone", player, zone, filter };
}

/** "<cards> have <keyword>", held by a static ability. */
export function grantCardKeyword(cards: CardsInZone, keyword: Keyword): GrantCardKeywordNode {
  return { op: "grantCardKeyword", cards, keyword };
}
