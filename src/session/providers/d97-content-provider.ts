// Real D97ContentProvider: the roster, the reward-bag deal, the starting
// collection's card facts, captured from the loaded content, and the
// registered dreams with their quests, quest items and each resident's
// dialogue. A production build registers the dream catalog; a development
// build passes its development fixtures (src/d97/development-content.ts) and
// registers the development dream beside it. The deal is the
// journey draft's pool construction (the tides4 deal, then the per-card pool
// caps, then the cards of rarities bags never hold left out), keyed by card UUID and with no logging,
// so a fold may call it any number of times.

import { buildD97OpponentDeck, startD97Battle, type D97BattleContent } from "../../battle/integration/d97-battle";
import { resolvePool } from "../../data/cards-v2-database";
import { buildDialogueCatalog } from "../../d97/dialogue/catalog";
import { D97_COLLECTION } from "../../content/d97/collection";
import { D97_DIALOGUE_CONTENT } from "../../content/d97/dialogue";
import { D97_DREAMS } from "../../content/d97/dreams";
import { D97_DREAM_MAPS } from "../../content/d97/maps";
import type { D97DevelopmentContent } from "../../d97/development-content";
import type { JourneyContent } from "../../data/journey-content";
import type { D97DealtCard } from "../../d97/collection/reward-bag";
import { cardPriceFactsOf, type D97CardPriceFacts } from "../../d97/shop/pricing";
import { generatePoolFromData } from "../../draft/pool/generate";
import type { D97ContentProvider, D97RegisteredDream } from "../../rules/d97/d97-content";
import { registerDream } from "../../rules/d97/d97-dreams";
import { buildTideAffinityIndex } from "../../selection/tide-affinity";
import type { CardId } from "../../types/card-identity";
import type { Rarity } from "../../types/cards";
import { identityEntries, type D97DreamId } from "../../types/identifiers";

function codeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * The D97 content of `content`, registering the dream catalog and, when
 * `development` is given (development builds only), the development dream.
 */
export function createD97ContentProvider(
  content: JourneyContent,
  development: D97DevelopmentContent | null,
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
  const battleContent: D97BattleContent = {
    cardDatabase: content.cardDatabase,
    cardsById: new Map([...content.cardDatabase.values()].map((card) => [card.id, card])),
    avatars: content.avatars,
    dreamsignTemplates: content.dreamsignTemplates,
    dreamwellCardIds: content.dreamwellCards.map((card) => card.id),
    opponentsData: content.opponentsData,
    tides4Decks,
    tides4Tuning: pool.tides4Tuning,
  };
  const dialogue = buildDialogueCatalog(development === null ? [D97_DIALOGUE_CONTENT] : [D97_DIALOGUE_CONTENT, development.dialogue]);
  const maps = new Map((development === null ? D97_DREAM_MAPS : [...D97_DREAM_MAPS, development.map]).map((map) => [map.id, map]));
  const dreams = new Map<D97DreamId, D97RegisteredDream>();
  for (const dream of development === null ? D97_DREAMS : [...D97_DREAMS, development.dream]) {
    const anchors = (maps.get(dream.mapId)?.anchors ?? []).map(({ id, kind }) => ({ id, kind }));
    dreams.set(dream.id, registerDream(dream, anchors, dialogue.dialogues));
  }
  return {
    buildOpponentDeck: (input) => buildD97OpponentDeck(battleContent, input),
    startBattle: (input) => startD97Battle(battleContent, input),
    quests: dialogue.quests,
    itemIds: new Set(dialogue.items.keys()),
    dialogue,
    dreams,
    defaultDreamId: D97_DREAMS[0]?.id ?? null,
    avatarIds: new Set(content.avatars.map((avatar) => avatar.id)),
    tideAffinityIndex:
      tides4Decks === undefined
        ? { cardVectors: new Map(), knownTideIds: new Set() }
        : buildTideAffinityIndex(tides4Decks),
    cardRarity: (cardId) => rarityById.get(cardId) ?? null,
    cardPriceFacts: (cardId) => priceFactsById.get(cardId) ?? null,
    starterCardIds: [...new Set(starterCardIds)].sort(codeUnits),
    dealRewardPool: (avatarId, seed) => {
      const generated = generatePoolFromData(
        pool.poolData,
        seed,
        avatarId,
        pool.tides4Tuning,
      );
      const { draftPoolCopiesByCard } = resolvePool(
        generated,
        pool.idIndex,
        pool.defaultPoolCopyCap,
        pool.poolCopyCapsByCardNumber,
      );
      const cards: D97DealtCard[] = [];
      for (const [key, copies] of identityEntries(draftPoolCopiesByCard)) {
        const cardNumber = Number(key);
        const card = content.cardDatabase.get(cardNumber);
        if (
          card === undefined ||
          starterNumbers.has(cardNumber) ||
          card.rarity === undefined ||
          !bagRarities.has(card.rarity)
        ) {
          continue;
        }
        cards.push({ cardId: card.id, copies });
      }
      return {
        joinedTideIds: generated.tides4Provenance.tides
          .filter((tide) => tide.joined)
          .map((tide) => tide.id),
        cards,
      };
    },
  };
}
