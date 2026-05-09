import type { CardData } from "../types/cards";
import type { DreamsignTemplate, PackageTideId } from "../types/content";
import type { DeckEntry, Dreamsign, RuntimeShopSlot } from "../types/quest";

import { isStarterCard } from "../data/card-database";
import { countPackageOverlap } from "../data/quest-content";
import { pickPackageAdjacentItem } from "../data/tide-weights";
import {
  readDreamsignPool,
  resolveDreamsignTemplates,
} from "../dreamsign/dreamsign-pool";
import { createDreamsign } from "../data/dreamsigns";

/** Fixed price for standard card items. */
const STANDARD_CARD_PRICE = 100;

/** Fixed price for specialty-shop card items. */
const SPECIALTY_CARD_PRICE = 200;

/** Fixed price for dreamsign items. */
const DREAMSIGN_PRICE = 150;

/** Base cost for a shop reroll. */
const REROLL_BASE_COST = 50;

/** Additional cost per previous reroll. */
const REROLL_INCREMENT = 25;

/** Chance (out of 6) for a slot to be a dreamsign. */
const DREAMSIGN_CHANCE = 1 / 6;

/** The types of items that can appear in a shop slot. */
export type ShopItemType = "card" | "dreamsign" | "reroll";

/** A single slot in the shop inventory. */
export interface ShopSlot {
  itemType: ShopItemType;
  card: CardData | null;
  dreamsign: Dreamsign | null;
  basePrice: number;
  discountPercent: number;
  purchased: boolean;
}

export interface ShopGenerationOptions {
  selectedPackageTides?: readonly PackageTideId[];
  remainingDreamsignPoolIds?: readonly string[];
  dreamsignTemplates?: readonly DreamsignTemplate[];
}

export interface ShopInventoryResult {
  slots: ShopSlot[];
  remainingDreamsignPoolIds: string[];
  spentDreamsignPoolIds: string[];
}

/** Returns the effective price of a slot after discount. */
export function effectivePrice(slot: ShopSlot): number {
  if (slot.discountPercent === 0) return slot.basePrice;
  return Math.round(slot.basePrice * (1 - slot.discountPercent / 100));
}

/** Computes reroll cost given the number of previous rerolls. */
export function rerollCost(rerollCount: number, isEnhanced: boolean): number {
  if (isEnhanced) return 0;
  return REROLL_BASE_COST + REROLL_INCREMENT * rerollCount;
}

export function shopSlotsToRuntime(
  slots: readonly ShopSlot[],
): RuntimeShopSlot[] {
  return slots.map((slot) => {
    const base = {
      basePrice: slot.basePrice,
      discountPercent: slot.discountPercent,
      purchased: slot.purchased,
    };

    if (slot.itemType === "card") {
      if (slot.card === null) {
        throw new Error("Cannot convert a card shop slot without a card");
      }
      return {
        itemType: "card",
        cardNumber: slot.card.cardNumber,
        ...base,
      };
    }

    if (slot.itemType === "dreamsign") {
      if (slot.dreamsign === null) {
        throw new Error(
          "Cannot convert a Dreamsign shop slot without a Dreamsign",
        );
      }
      return {
        itemType: "dreamsign",
        dreamsign: slot.dreamsign,
        ...base,
      };
    }

    return {
      itemType: "reroll",
      ...base,
    };
  });
}

export function runtimeSlotsToShopSlots(
  slots: readonly RuntimeShopSlot[],
  cardDatabase: ReadonlyMap<number, CardData>,
): ShopSlot[] {
  return slots.map((slot) => {
    const base = {
      basePrice: slot.basePrice,
      discountPercent: slot.discountPercent,
      purchased: slot.purchased,
    };

    if (slot.itemType === "card") {
      return {
        itemType: "card",
        card: cardDatabase.get(slot.cardNumber) ?? null,
        dreamsign: null,
        ...base,
      };
    }

    if (slot.itemType === "dreamsign") {
      return {
        itemType: "dreamsign",
        card: null,
        dreamsign: slot.dreamsign,
        ...base,
      };
    }

    return {
      itemType: "reroll",
      card: null,
      dreamsign: null,
      ...base,
    };
  });
}

function selectWeightedCard(
  cardDatabase: ReadonlyMap<number, CardData>,
  playerDeck: readonly DeckEntry[],
  cards: readonly CardData[],
  selectedPackageTides: readonly PackageTideId[] = [],
  excludedCardNumbers: ReadonlySet<number> = new Set(),
): CardData | null {
  const availableCards = cards.filter(
    (card) => !excludedCardNumbers.has(card.cardNumber),
  );
  const fallbackCards = availableCards.length > 0 ? availableCards : cards;

  if (fallbackCards.length === 0) {
    return null;
  }

  const deckPackageWeights = buildDeckPackageWeights(cardDatabase, playerDeck);
  const scoredCards = fallbackCards.map((card) => ({
    card,
    deckAffinity: card.tides.reduce(
      (sum, tide) => sum + (deckPackageWeights.get(tide) ?? 0),
      0,
    ),
    overlapCount: countPackageOverlap(card.tides, selectedPackageTides),
  }));
  const maxOverlapCount = Math.max(
    ...scoredCards.map((candidate) => candidate.overlapCount),
  );
  const packageMatchedCards = maxOverlapCount > 0
    ? scoredCards.filter((candidate) => candidate.overlapCount === maxOverlapCount)
    : scoredCards;
  const maxDeckAffinity = Math.max(
    ...packageMatchedCards.map((candidate) => candidate.deckAffinity),
  );
  const deckMatchedCards = maxDeckAffinity > 0
    ? packageMatchedCards.filter(
      (candidate) => candidate.deckAffinity >= maxDeckAffinity - 1,
    )
    : packageMatchedCards;

  return pickWeightedCard(deckMatchedCards);
}

function buildDeckPackageWeights(
  cardDatabase: ReadonlyMap<number, CardData>,
  playerDeck: readonly DeckEntry[],
): Map<PackageTideId, number> {
  const weights = new Map<PackageTideId, number>();

  for (const entry of playerDeck) {
    const card = cardDatabase.get(entry.cardNumber);
    if (card === undefined) {
      continue;
    }

    for (const tide of new Set(card.tides)) {
      weights.set(tide, (weights.get(tide) ?? 0) + 1);
    }
  }

  return weights;
}

function pickWeightedCard(
  candidates: ReadonlyArray<{
    card: CardData;
    deckAffinity: number;
    overlapCount: number;
  }>,
): CardData | null {
  const totalWeight = candidates.reduce(
    (sum, candidate) =>
      sum +
      Math.max(
        1,
        candidate.overlapCount * 10 +
        candidate.deckAffinity * 3,
      ),
    0,
  );

  if (totalWeight <= 0) {
    return candidates[0]?.card ?? null;
  }

  let roll = Math.random() * totalWeight;
  for (const candidate of candidates) {
    roll -= Math.max(
      1,
      candidate.overlapCount * 10 +
      candidate.deckAffinity * 3,
    );
    if (roll <= 0) {
      return candidate.card;
    }
  }

  return candidates[candidates.length - 1]?.card ?? null;
}
/**
 * Generates shop inventory with 6 slots. Each slot can be a card,
 * dreamsign, or reroll option.
 */
export function generateShopInventory(
  cardDatabase: Map<number, CardData>,
  playerDeck: DeckEntry[],
  options: ShopGenerationOptions = {},
): ShopInventoryResult {
  const selectedPackageTides = options.selectedPackageTides ?? [];
  const allCards = Array.from(cardDatabase.values()).filter(
    (card) => !isStarterCard(card),
  );
  const slots: ShopSlot[] = [];
  const selectedCardNumbers = new Set<number>();
  let remainingDreamsignPoolIds = [...(options.remainingDreamsignPoolIds ?? [])];
  const spentDreamsignPoolIds: string[] = [];

  // Decide if reroll slot appears (50% chance)
  const hasRerollSlot = Math.random() < 0.5;
  const rerollSlotIndex = hasRerollSlot
    ? Math.floor(Math.random() * 6)
    : -1;

  for (let i = 0; i < 6; i++) {
    if (i === rerollSlotIndex) {
      slots.push({
        itemType: "reroll",
        card: null,
        dreamsign: null,
        basePrice: REROLL_BASE_COST,
        discountPercent: 0,
        purchased: false,
      });
      continue;
    }

    // Roll for dreamsign
    if (
      Math.random() < DREAMSIGN_CHANCE &&
      options.dreamsignTemplates !== undefined &&
      remainingDreamsignPoolIds.length > 0
    ) {
      const dreamsignPoolState = readDreamsignPool(
        remainingDreamsignPoolIds,
        options.dreamsignTemplates,
      );
      const template = pickPackageAdjacentItem(
        resolveDreamsignTemplates(
          dreamsignPoolState.availableIds,
          options.dreamsignTemplates,
        ),
        (candidate) => candidate.packageTides,
        selectedPackageTides,
      );
      if (template !== null) {
        remainingDreamsignPoolIds = dreamsignPoolState.availableIds.filter(
          (id) => id !== template.id,
        );
        spentDreamsignPoolIds.push(template.id);
        slots.push({
          itemType: "dreamsign",
          card: null,
          dreamsign: createDreamsign(template),
          basePrice: DREAMSIGN_PRICE,
          discountPercent: 0,
          purchased: false,
        });
        continue;
      }
    }

    // Default: card slot
    const card = selectWeightedCard(
      cardDatabase,
      playerDeck,
      allCards,
      selectedPackageTides,
      selectedCardNumbers,
    );
    if (card) {
      selectedCardNumbers.add(card.cardNumber);
      slots.push({
        itemType: "card",
        card,
        dreamsign: null,
        basePrice: STANDARD_CARD_PRICE,
        discountPercent: 0,
        purchased: false,
      });
    }
  }

  // Apply discounts to 1-2 random non-reroll slots
  const discountableIndices = slots
    .map((s, i) => (s.itemType !== "reroll" ? i : -1))
    .filter((i) => i >= 0);

  const discountCount = Math.random() < 0.5 ? 1 : 2;
  const shuffled = discountableIndices.sort(() => Math.random() - 0.5);
  for (let d = 0; d < discountCount && d < shuffled.length; d++) {
    const idx = shuffled[d];
    // 30-90% discount in increments of 10
    const discount = 30 + Math.floor(Math.random() * 7) * 10;
    slots[idx] = { ...slots[idx], discountPercent: discount };
  }

  return {
    slots,
    remainingDreamsignPoolIds,
    spentDreamsignPoolIds,
  };
}

/**
 * Generates specialty shop inventory: 4 curated cards weighted
 * toward the player's drafted tides.
 */
export function generateSpecialtyShopInventory(
  cardDatabase: Map<number, CardData>,
  playerDeck: DeckEntry[],
  selectedPackageTides: readonly PackageTideId[] = [],
): ShopSlot[] {
  const specialtyCards = Array.from(cardDatabase.values()).filter(
    (card) => !isStarterCard(card),
  );
  const slots: ShopSlot[] = [];
  const selectedCardNumbers = new Set<number>();

  for (let i = 0; i < 4; i += 1) {
    const card = selectWeightedCard(
      cardDatabase,
      playerDeck,
      specialtyCards,
      selectedPackageTides,
      selectedCardNumbers,
    );
    if (card) {
      selectedCardNumbers.add(card.cardNumber);
      slots.push({
        itemType: "card",
        card,
        dreamsign: null,
        basePrice: SPECIALTY_CARD_PRICE,
        discountPercent: 0,
        purchased: false,
      });
    }
  }

  return slots;
}
