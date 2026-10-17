// Real D97ContentProvider: the roster, the reward-bag deal and the starting
// collection's card facts, captured from the loaded content. The deal is the
// journey draft's pool construction (the tides4 deal, then the per-card pool
// caps, then the cards of rarities bags never hold left out), keyed by card UUID and with no logging,
// so a fold may call it any number of times.

import { buildD97OpponentDeck, startD97Battle, type D97BattleContent } from "../../battle/integration/d97-battle";
import { resolvePool } from "../../data/cards-v2-database";
import { D97_COLLECTION } from "../../content/d97/collection";
import type { JourneyContent } from "../../data/journey-content";
import type { D97DealtCard } from "../../d97/collection/reward-bag";
import { generatePoolFromData } from "../../draft/pool/generate";
import type { D97ContentProvider } from "../../rules/d97/d97-content";
import { buildTideAffinityIndex } from "../../selection/tide-affinity";
import type { CardId } from "../../types/card-identity";
import type { Rarity } from "../../types/cards";
import { identityEntries } from "../../types/identifiers";

function codeUnits(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

export function createD97ContentProvider(
  content: JourneyContent,
): D97ContentProvider {
  const pool = content.poolContext;
  const tides4Decks = pool.poolData.tides4Decks;
  const rarityById = new Map<CardId, Rarity | null>();
  const starterCardIds: CardId[] = [];
  for (const card of content.cardDatabase.values()) {
    rarityById.set(card.id, card.rarity ?? null);
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
  return {
    buildOpponentDeck: (input) => buildD97OpponentDeck(battleContent, input),
    startBattle: (input) => startD97Battle(battleContent, input),
    avatarIds: new Set(content.avatars.map((avatar) => avatar.id)),
    tideAffinityIndex:
      tides4Decks === undefined
        ? { cardVectors: new Map(), knownTideIds: new Set() }
        : buildTideAffinityIndex(tides4Decks),
    cardRarity: (cardId) => rarityById.get(cardId) ?? null,
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
