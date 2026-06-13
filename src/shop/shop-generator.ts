import type { CardData } from "../types/cards";
import type { DreamsignTemplate, ResolvedDreamcallerPackage } from "../types/content";
import type { DraftState, PoolDraftState } from "../types/draft";
import type { Dreamsign, RuntimeShopSlot } from "../types/quest";

import { drawAndSpendUniqueCards } from "../draft/draft-engine";
import { drawDreamsignOptions } from "../dreamsign/dreamsign-pool";

/** Fixed price for standard card items. */
export const STANDARD_CARD_PRICE = 100;

/** Fixed price for specialty-shop card items. */
export const SPECIALTY_CARD_PRICE = 200;

/** Fixed price for dreamsign items, paid in omens. */
const DREAMSIGN_OMEN_PRICE = 2;

/** Base cost for a shop reroll, paid in omens. */
const REROLL_OMEN_COST = 1;

/** Standard shop composition: 3 cards and 2 dreamsigns to purchase. */
const STANDARD_CARD_COUNT = 3;
const STANDARD_DREAMSIGN_COUNT = 2;

/** The types of items that can appear in a shop slot. */
export type ShopItemType = "card" | "dreamsign";

/** A single slot in the shop inventory. */
export interface ShopSlot {
  itemType: ShopItemType;
  card: CardData | null;
  dreamsign: Dreamsign | null;
  basePrice: number;
  discountPercent: number;
  purchased: boolean;
}

export interface ShopPriceModifiers {
  essenceDiscountPercent?: number;
  upcomingOmenDiscounts?: number;
}

type ShopPricedSlot = Pick<
  ShopSlot,
  "itemType" | "basePrice" | "discountPercent"
> & Partial<Pick<ShopSlot, "card" | "dreamsign" | "purchased">>;

export interface ShopGenerationOptions {
  cardDatabase: ReadonlyMap<number, CardData>;
  /**
   * The run draft state. Shop cards are drawn from — and spent against — the
   * draft multiset, just like draft picks. The mutated draft state is returned
   * on the result.
   */
  draftState: DraftState | null;
  remainingDreamsignPoolIds?: readonly string[];
  dreamsignTemplates?: readonly DreamsignTemplate[];
  /** The run's full Dreamsign pool, used to regenerate an exhausted pool. */
  dreamsignRegenerationPoolIds?: readonly string[];
  /**
   * When provided and non-empty the shop is a Specialty Shop: its card slots
   * are drawn from this fixed list (the run's chosen idf3 starter decklist)
   * instead of the depleting draft multiset, and they do not spend the draft
   * pool.
   */
  starterDecklistCardNumbers?: readonly number[];
  cardCount?: number;
  dreamsignCount?: number;
}

export interface ShopInventoryResult {
  slots: ShopSlot[];
  remainingDreamsignPoolIds: string[];
  spentDreamsignPoolIds: string[];
  /** The draft state after shop card slots were drawn and spent. */
  draftState: DraftState | null;
}

/** Returns the total discount for a slot after shop-wide modifiers. */
export function effectiveDiscountPercent(
  slot: ShopPricedSlot,
  modifiers: ShopPriceModifiers = {},
): number {
  const slotDiscount = Math.max(0, slot.discountPercent);
  const essenceDiscount =
    slot.itemType === "card"
      ? Math.max(0, modifiers.essenceDiscountPercent ?? 0)
      : 0;
  return Math.min(100, slotDiscount + essenceDiscount);
}

/** Returns the effective price of a slot after discount. */
export function effectivePrice(
  slot: ShopPricedSlot,
  modifiers: ShopPriceModifiers = {},
): number {
  const discountPercent = effectiveDiscountPercent(slot, modifiers);
  const percentDiscountedPrice =
    discountPercent === 0
      ? slot.basePrice
      : Math.round(slot.basePrice * (1 - discountPercent / 100));
  if (
    slot.itemType === "dreamsign" &&
    percentDiscountedPrice > 0 &&
    (modifiers.upcomingOmenDiscounts ?? 0) > 0
  ) {
    return percentDiscountedPrice - 1;
  }
  return percentDiscountedPrice;
}

/** Computes the omen reroll cost. Enhanced shops reroll for free. */
export function rerollCost(_rerollCount: number, isEnhanced: boolean): number {
  if (isEnhanced) return 0;
  return REROLL_OMEN_COST;
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

    return {
      itemType: "dreamsign",
      card: null,
      dreamsign: slot.dreamsign,
      ...base,
    };
  });
}

/**
 * Build a transient pool {@link PoolDraftState} for shops to draw from when the
 * run's live draft state is a replay state (which has no card multiset of its
 * own). The pool comes from the resolved package's idf3 draft pool. Returns
 * `null` when there is no package or the pool is empty. The caller passes this
 * to {@link generateShopInventory} in place of the replay draft state, and on
 * write-back keeps the replay state (it does NOT persist the spent pool), so
 * replay shops draw fresh from the package pool each generation — acceptable,
 * since the draft pool is not shared with the replay draft.
 */
export function replayShopDraftState(
  resolvedPackage: ResolvedDreamcallerPackage | null | undefined,
): PoolDraftState | null {
  const copies = resolvedPackage?.draftPoolCopiesByCard;
  if (copies === undefined || Object.keys(copies).length === 0) {
    return null;
  }
  return {
    mode: "pool",
    draftPoolCopiesByCard: copies,
    remainingCopiesByCard: { ...copies },
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
    siteShownCardNumbers: [],
  };
}

/**
 * Generates shop inventory: 3 cards and 2 dreamsigns by default. Dreamsigns are
 * drawn from — and spent against — the run's shared Dreamsign pool. A regular
 * shop's card slots are drawn from — and spent against — the run draft
 * multiset. When `starterDecklistCardNumbers` is non-empty the shop is a
 * Specialty Shop whose card slots are instead drawn from that fixed list
 * without touching the draft multiset.
 */
export function generateShopInventory(
  options: ShopGenerationOptions,
): ShopInventoryResult {
  const {
    cardDatabase,
    draftState,
    remainingDreamsignPoolIds = [],
    dreamsignTemplates = [],
    dreamsignRegenerationPoolIds,
    starterDecklistCardNumbers = [],
    cardCount = STANDARD_CARD_COUNT,
    dreamsignCount = STANDARD_DREAMSIGN_COUNT,
  } = options;

  const isSpecialty = starterDecklistCardNumbers.length > 0;
  const cardPrice = isSpecialty ? SPECIALTY_CARD_PRICE : STANDARD_CARD_PRICE;

  const nextDraftState =
    draftState === null ? null : structuredClone(draftState);
  const slots: ShopSlot[] = [];

  if (isSpecialty) {
    // --- Specialty card slots: drawn from the fixed starter decklist,
    // without touching the draft multiset. ---
    const shuffled = [...starterDecklistCardNumbers];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const drawnCardNumbers = shuffled.slice(0, cardCount);
    for (const cardNumber of drawnCardNumbers) {
      const card = cardDatabase.get(cardNumber);
      if (card === undefined) {
        continue;
      }
      slots.push({
        itemType: "card",
        card,
        dreamsign: null,
        basePrice: cardPrice,
        discountPercent: 0,
        purchased: false,
      });
    }
  } else if (nextDraftState !== null) {
    // --- Regular card slots: drawn from the draft multiset and spent. ---
    const drawnCardNumbers = drawAndSpendUniqueCards(nextDraftState, cardCount);
    for (const cardNumber of drawnCardNumbers) {
      const card = cardDatabase.get(cardNumber);
      if (card === undefined) {
        continue;
      }
      slots.push({
        itemType: "card",
        card,
        dreamsign: null,
        basePrice: cardPrice,
        discountPercent: 0,
        purchased: false,
      });
    }
  }

  // --- Dreamsign slots: drawn from the shared Dreamsign pool and spent. ---
  let remainingPool = [...remainingDreamsignPoolIds];
  const spentDreamsignPoolIds: string[] = [];
  if (dreamsignTemplates.length > 0 && dreamsignCount > 0) {
    const draw = drawDreamsignOptions(
      remainingPool,
      dreamsignTemplates,
      dreamsignCount,
      dreamsignRegenerationPoolIds,
    );
    for (const dreamsign of draw.offeredDreamsigns) {
      slots.push({
        itemType: "dreamsign",
        card: null,
        dreamsign,
        basePrice: DREAMSIGN_OMEN_PRICE,
        discountPercent: 0,
        purchased: false,
      });
    }
    spentDreamsignPoolIds.push(...draw.offeredIds);
    remainingPool = remainingPool.filter(
      (id) => !draw.offeredIds.includes(id),
    );
  }

  // --- Discounts: 1-2 random slots between 30% and 90% off. ---
  const discountCount = Math.random() < 0.5 ? 1 : 2;
  const indices = slots.map((_, index) => index).sort(() => Math.random() - 0.5);
  for (let d = 0; d < discountCount && d < indices.length; d += 1) {
    const idx = indices[d];
    const discount = 30 + Math.floor(Math.random() * 7) * 10;
    slots[idx] = { ...slots[idx], discountPercent: discount };
  }

  return {
    slots,
    remainingDreamsignPoolIds: remainingPool,
    spentDreamsignPoolIds,
    draftState: nextDraftState,
  };
}
