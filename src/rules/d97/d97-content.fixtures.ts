// A synthetic D97 content catalog for node tests: a roster, a small tide
// space, a dealt pool, a handful of Starter cards and two registered
// synthetic dreams (./d97-dreams.fixtures.ts), the first the default. Every id
// is a test UUID.

import type { CardId } from "../../types/card-identity";
import type { Rarity } from "../../types/cards";
import type { D97DialogueModule, D97QuestDefinition } from "../../content/d97/dialogue/schema";
import type { D97DreamDefinition } from "../../content/d97/dreams/schema";
import type { AvatarId, D97ItemId, TideId } from "../../types/identifiers";
import {
  testAvatarId,
  testCardId,
  testTideId,
} from "../../types/test-identities";
import type { D97ContentProvider } from "./d97-content";
import { registerDream } from "./d97-dreams";
import { SYNTHETIC_DREAM_A, SYNTHETIC_DREAM_B, syntheticDreamAnchors } from "./d97-dreams.fixtures";

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
 * `poolSize` cards (every third one dealt twice) whatever the seed. It
 * registers `dreams` (synthetic dreams A and B by default; the first is the
 * default dream), whose residents speak among `dialogues`.
 */
export function syntheticD97Content(
  options: {
    avatarIds?: readonly AvatarId[];
    poolSize?: number;
    quests?: readonly D97QuestDefinition[];
    itemIds?: readonly D97ItemId[];
    dreams?: readonly D97DreamDefinition[];
    dialogues?: readonly D97DialogueModule[];
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
  const quests = new Map((options.quests ?? []).map((quest) => [quest.id, quest]));
  const dialogues = new Map((options.dialogues ?? []).map((module) => [module.id, module]));
  const dreams = options.dreams ?? [SYNTHETIC_DREAM_A, SYNTHETIC_DREAM_B];
  return {
    avatarIds: new Set(avatarIds),
    tideAffinityIndex: { cardVectors, knownTideIds: new Set(SYNTHETIC_TIDES) },
    cardRarity: (cardId) => rarityById.get(cardId) ?? null,
    cardPriceFacts: (cardId) => {
      const rarity = rarityById.get(cardId);
      const index = poolCards.indexOf(cardId);
      if (rarity === undefined) return null;
      return {
        energyCost: index < 0 ? 0 : index % 5,
        spark: index < 0 ? null : index % 4,
        character: index % 2 === 0,
        fast: index >= 0 && index % 7 === 0,
        rarity,
      };
    },
    starterCardIds: SYNTHETIC_STARTERS,
    quests,
    itemIds: new Set(options.itemIds ?? []),
    dialogue: { dialogues, quests, items: new Map() },
    dreams: new Map(dreams.map((dream) => [dream.id, registerDream(dream, syntheticDreamAnchors(dream), dialogues)])),
    defaultDreamId: dreams[0]?.id ?? null,
    dealRewardPool: () => ({
      joinedTideIds: SYNTHETIC_TIDES.slice(0, 2),
      cards: poolCards.map((cardId, index) => ({
        cardId,
        copies: index % 3 === 0 ? 2 : 1,
      })),
    }),
    buildOpponentDeck: ({ deckSize, signatureCount }) => ({
      deck: poolCards.slice(0, deckSize),
      draftPool: poolCards,
      dreamsignIds: [],
      signatureCardIds: poolCards.slice(0, signatureCount),
    }),
    startBattle: () => null,
  };
}
