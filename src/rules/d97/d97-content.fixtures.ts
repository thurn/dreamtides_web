// A synthetic D97 content catalog for node tests: a roster, a small tide
// space, a dealt pool and a handful of Starter cards. Every id is a test UUID.

import type { CardId } from "../../types/card-identity";
import type { Rarity } from "../../types/cards";
import type { AvatarId, TideId } from "../../types/identifiers";
import {
  testAvatarId,
  testCardId,
  testTideId,
} from "../../types/test-identities";
import type { D97ContentProvider } from "./d97-content";

export const SYNTHETIC_TIDES: readonly TideId[] = [
  testTideId("d97-tide-a"),
  testTideId("d97-tide-b"),
  testTideId("d97-tide-c"),
];

const RARITIES: readonly Rarity[] = ["Common", "Uncommon", "Rare"];

/** The synthetic pool cards, in deal order. */
export function syntheticPoolCardIds(count: number): CardId[] {
  return Array.from({ length: count }, (_, index) =>
    testCardId(`d97-pool-card-${String(index)}`),
  );
}

export const SYNTHETIC_STARTERS: readonly CardId[] = Array.from(
  { length: 7 },
  (_, index) => testCardId(`d97-starter-${String(index)}`),
);

/**
 * A D97 content provider over a synthetic catalog. The deal returns
 * `poolSize` cards (every third one dealt twice) whatever the seed.
 */
export function syntheticD97Content(
  options: {
    avatarIds?: readonly AvatarId[];
    poolSize?: number;
  } = {},
): D97ContentProvider {
  const avatarIds = options.avatarIds ?? [testAvatarId("d97-roster-avatar")];
  const poolCards = syntheticPoolCardIds(options.poolSize ?? 40);
  const cardVectors = new Map<CardId, Map<TideId, number>>();
  const rarityById = new Map<CardId, Rarity>();
  poolCards.forEach((cardId, index) => {
    const vector = new Map<TideId, number>();
    const home = SYNTHETIC_TIDES[index % SYNTHETIC_TIDES.length];
    const second = SYNTHETIC_TIDES[(index * 7) % SYNTHETIC_TIDES.length];
    if (home !== undefined) vector.set(home, 1 + (index % 2));
    if (second !== undefined) vector.set(second, (vector.get(second) ?? 0) + 1);
    cardVectors.set(cardId, vector);
    rarityById.set(cardId, RARITIES[index % RARITIES.length] ?? "Common");
  });
  for (const cardId of SYNTHETIC_STARTERS) rarityById.set(cardId, "Starter");
  return {
    avatarIds: new Set(avatarIds),
    tideAffinityIndex: { cardVectors, knownTideIds: new Set(SYNTHETIC_TIDES) },
    cardRarity: (cardId) => rarityById.get(cardId) ?? null,
    starterCardIds: SYNTHETIC_STARTERS,
    dealRewardPool: () => ({
      joinedTideIds: SYNTHETIC_TIDES.slice(0, 2),
      cards: poolCards.map((cardId, index) => ({
        cardId,
        copies: index % 3 === 0 ? 2 : 1,
      })),
    }),
  };
}
