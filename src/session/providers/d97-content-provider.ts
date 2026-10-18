// Real D97ContentProvider: the roster, every Avatar's pinned reward-bag pool
// (src/content/d97/pools/, its rings over the tide catalog's eligible cards),
// the capacity stages, the starting collection's card facts, captured from
// the loaded content, and the registered dreams with their quests, quest
// items and each resident's dialogue. A production build registers the dream
// catalog; a development build passes its development fixtures
// (src/d97/development-content.ts) and registers the development dream beside
// it.

import { buildD97OpponentDeck, startD97Battle, type D97BattleContent } from "../../battle/integration/d97-battle";
import { buildDialogueCatalog } from "../../d97/dialogue/catalog";
import { D97_COLLECTION, D97_REWARD_BAG } from "../../content/d97/collection";
import { D97_PINNED_POOLS } from "../../content/d97/pools";
import type { D97PinnedPool } from "../../content/d97/pools/schema";
import { avatarPoolOf } from "../../d97/collection/avatar-pool";
import type { D97AvatarPool } from "../../d97/collection/types";
import { D97_DIALOGUE_CONTENT } from "../../content/d97/dialogue";
import { D97_DREAMS } from "../../content/d97/dreams";
import { D97_TILESETS } from "../../content/d97/dreams/tilesets";
import type { D97ActCatalogDream } from "../../d97/assembly/types";
import { D97_DREAM_MAPS } from "../../content/d97/maps";
import type { D97DevelopmentContent } from "../../d97/development-content";
import type { JourneyContent } from "../../data/journey-content";
import { cardPriceFactsOf, type D97CardPriceFacts } from "../../d97/shop/pricing";
import type { D97ContentProvider, D97RegisteredDream } from "../../rules/d97/d97-content";
import { dreamMapAnchors, registerDream } from "../../rules/d97/d97-dreams";
import { buildTideAffinityIndex } from "../../selection/tide-affinity";
import type { CardId } from "../../types/card-identity";
import type { Rarity } from "../../types/cards";
import type { AvatarId, D97DreamId, TideId } from "../../types/identifiers";

function codeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * The D97 content of `content`, registering the dream catalog and, when
 * `development` is given (development builds only), the development dream,
 * with `pinnedPools` (the pinned-pool catalog by default) as the Avatars'
 * reward-bag pools.
 */
export function createD97ContentProvider(
  content: JourneyContent,
  development: D97DevelopmentContent | null,
  pinnedPools: readonly D97PinnedPool[] = D97_PINNED_POOLS,
): D97ContentProvider {
  const pool = content.poolContext;
  const tides4Decks = pool.poolData.tides4Decks;
  const rarityById = new Map<CardId, Rarity | null>();
  const priceFactsById = new Map<CardId, D97CardPriceFacts>();
  const starterCardIds: CardId[] = [];
  for (const card of content.cardDatabase.values()) {
    rarityById.set(card.id, card.rarity ?? null);
    priceFactsById.set(card.id, cardPriceFactsOf(card));
    if (card.isStarter || card.rarity === "Starter") starterCardIds.push(card.id);
  }
  const starterNumbers = new Set(pool.starterCardNumbers);
  const bagRarities = new Set<Rarity>(D97_COLLECTION.bagRarities);
  const cardsById = new Map([...content.cardDatabase.values()].map((card) => [card.id, card]));
  // Eligible cards (Appendix A §A1): Common, Uncommon and Rare supply cards.
  const eligible = (cardId: CardId): boolean => {
    const card = cardsById.get(cardId);
    return card !== undefined && !card.isStarter && !starterNumbers.has(card.cardNumber) && card.rarity !== undefined && bagRarities.has(card.rarity);
  };
  const tideCards = new Map<TideId, readonly CardId[]>((tides4Decks?.tides ?? []).map((tide) => [tide.id, tide.cards.map((card) => card.id)]));
  const rewardPools = new Map<AvatarId, D97AvatarPool>();
  for (const pinned of pinnedPools) {
    const avatarPool = avatarPoolOf(pinned, (tideId) => tideCards.get(tideId) ?? null, eligible, (cardId) => cardsById.has(cardId));
    if (avatarPool !== null) rewardPools.set(pinned.avatarId, avatarPool);
  }
  const battleContent: D97BattleContent = {
    cardDatabase: content.cardDatabase,
    cardsById,
    avatars: content.avatars,
    dreamsignTemplates: content.dreamsignTemplates,
    dreamwellCardIds: content.dreamwellCards.map((card) => card.id),
    opponentsData: content.opponentsData,
    tides4Decks,
    tides4Tuning: pool.tides4Tuning,
    pinnedDealtPool: (avatarId) => rewardPools.get(avatarId)?.dealt ?? [],
  };
  const dialogue = buildDialogueCatalog(development === null ? [D97_DIALOGUE_CONTENT] : [D97_DIALOGUE_CONTENT, development.dialogue]);
  const maps = new Map((development === null ? D97_DREAM_MAPS : [...D97_DREAM_MAPS, development.map]).map((map) => [map.id, map]));
  const dreams = new Map<D97DreamId, D97RegisteredDream>();
  for (const dream of development === null ? D97_DREAMS : [...D97_DREAMS, development.dream]) {
    const anchors = dreamMapAnchors(dream, (mapId) => maps.get(mapId)?.anchors).map((anchor) => ({
      id: anchor.id,
      kind: anchor.kind,
      roomId: anchor.roomId,
      ...(anchor.kind === "guardian" ? { blocksDoor: anchor.blocksDoor } : {}),
    }));
    dreams.set(dream.id, registerDream(dream, anchors, dialogue.dialogues));
  }
  // Act assembly draws catalog dreams whose tileset is known; the catalog
  // validator reports any other.
  const categories = new Map(D97_TILESETS.map((tileset) => [tileset.id, tileset.category]));
  const actDreams = D97_DREAMS.flatMap((dream): D97ActCatalogDream[] => {
    const category = categories.get(dream.tilesetId);
    const registered = dreams.get(dream.id);
    return category === undefined || registered === undefined ? [] : [{ dream, category, anchors: registered.anchors }];
  });
  return {
    buildOpponentDeck: (input) => buildD97OpponentDeck(battleContent, input),
    startBattle: (input) => startD97Battle(battleContent, input),
    quests: dialogue.quests,
    itemIds: new Set(dialogue.items.keys()),
    dialogue,
    dreams,
    defaultDreamId: D97_DREAMS[0]?.id ?? null,
    actCatalog: { dreams: actDreams, deckSourceAvatarIds: [...rewardPools.keys()].sort(codeUnits) },
    avatarIds: new Set(content.avatars.map((avatar) => avatar.id)),
    tideAffinityIndex:
      tides4Decks === undefined
        ? { cardVectors: new Map(), knownTideIds: new Set() }
        : buildTideAffinityIndex(tides4Decks),
    cardRarity: (cardId) => rarityById.get(cardId) ?? null,
    cardPriceFacts: (cardId) => priceFactsById.get(cardId) ?? null,
    starterCardIds: [...new Set(starterCardIds)].sort(codeUnits),
    rewardPool: (avatarId) => rewardPools.get(avatarId) ?? null,
    rewardBagTuning: D97_REWARD_BAG,
  };
}
