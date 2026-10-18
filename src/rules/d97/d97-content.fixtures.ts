// A synthetic D97 content catalog for node tests: a roster, a small tide
// space, a synthetic pinned pool per roster Avatar (ring 1: the pool cards;
// ring 2: the facet cards), synthetic capacity stages, a handful of Starter
// cards and two registered
// synthetic dreams (./d97-dreams.fixtures.ts), the first the default, with no
// catalog dreams for act assembly unless a test passes its own, so a run plays
// its start dream as a one-dream act. Every id is a test UUID.

import type { D97RewardBagTuning } from "../../content/d97/collection";
import type { D97ActCatalog } from "../../d97/assembly/types";
import type { D97AvatarPool } from "../../d97/collection/types";
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

/** The synthetic ring-2 (facet) cards, in card order. */
export function syntheticFacetCardIds(count: number): CardId[] {
  return Array.from({ length: count }, (_, index) =>
    testCardId(`d97-facet-card-${String(index)}`),
  );
}

/** Synthetic capacity stages, not the production table: both rings open at run start. */
export const SYNTHETIC_BAG_TUNING: D97RewardBagTuning = {
  stages: [
    { stage: 1, opensOn: { kind: "runStart" }, ring1Capacity: 2, ring2Capacity: 1 },
    { stage: 2, opensOn: { kind: "actEntered", act: 2 }, ring1Capacity: 3, ring2Capacity: 2 },
    { stage: 3, opensOn: { kind: "apollyonFalls" }, ring1Capacity: 4, ring2Capacity: 4 },
  ],
};

export const SYNTHETIC_STARTERS: readonly CardId[] = Array.from(
  { length: 7 },
  (_, index) => testCardId(`d97-starter-${String(index)}`),
);

/**
 * A D97 content provider over a synthetic catalog. Every roster Avatar's
 * pinned pool has `poolSize` ring-1 cards and `facetSize` ring-2 cards, its
 * tide set the synthetic tides, and deals each ring-1 card once. It
 * registers `dreams` (synthetic dreams A and B by default; the first is the
 * default dream), whose residents speak among `dialogues`.
 */
export function syntheticD97Content(
  options: {
    avatarIds?: readonly AvatarId[];
    poolSize?: number;
    facetSize?: number;
    bagTuning?: D97RewardBagTuning;
    quests?: readonly D97QuestDefinition[];
    itemIds?: readonly D97ItemId[];
    dreams?: readonly D97DreamDefinition[];
    dialogues?: readonly D97DialogueModule[];
    actCatalog?: D97ActCatalog;
  } = {},
): D97ContentProvider {
  const avatarIds = options.avatarIds ?? [testAvatarId("d97-roster-avatar")];
  const poolCards = syntheticPoolCardIds(options.poolSize ?? 40);
  const facetCards = syntheticFacetCardIds(options.facetSize ?? 20);
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
  facetCards.forEach((cardId, index) => {
    const facet = SYNTHETIC_TIDES[2];
    if (facet !== undefined) cardVectors.set(cardId, new Map([[facet, 1]]));
    rarityById.set(cardId, RARITIES[index % RARITIES.length] ?? "Common");
  });
  for (const cardId of SYNTHETIC_STARTERS) rarityById.set(cardId, "Starter");
  const codeUnits = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);
  const pools = new Map<AvatarId, D97AvatarPool>(avatarIds.map((avatarId) => [avatarId, {
    avatarId,
    tideIds: SYNTHETIC_TIDES,
    ring1: [...poolCards].sort(codeUnits),
    ring2: [...facetCards].sort(codeUnits),
    dealt: poolCards.map((cardId) => ({ cardId, copies: 1 })),
  }]));
  const quests = new Map((options.quests ?? []).map((quest) => [quest.id, quest]));
  const dialogues = new Map((options.dialogues ?? []).map((module) => [module.id, module]));
  const dreams = options.dreams ?? [SYNTHETIC_DREAM_A, SYNTHETIC_DREAM_B];
  return {
    avatarIds: new Set(avatarIds),
    tideAffinityIndex: { cardVectors, knownTideIds: new Set(SYNTHETIC_TIDES) },
    cardRarity: (cardId) => rarityById.get(cardId) ?? null,
    cardPriceFacts: (cardId) => {
      const rarity = rarityById.get(cardId);
      const poolIndex = poolCards.indexOf(cardId);
      const index = poolIndex < 0 ? facetCards.indexOf(cardId) : poolIndex;
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
    actCatalog: options.actCatalog ?? { dreams: [], deckSourceAvatarIds: avatarIds },
    rewardPool: (avatarId) => pools.get(avatarId) ?? null,
    rewardBagTuning: options.bagTuning ?? SYNTHETIC_BAG_TUNING,
    buildOpponentDeck: ({ deckSize, signatureCount }) => ({
      deck: poolCards.slice(0, deckSize),
      draftPool: poolCards,
      dreamsignIds: [],
      signatureCardIds: poolCards.slice(0, signatureCount),
    }),
    startBattle: () => null,
  };
}
