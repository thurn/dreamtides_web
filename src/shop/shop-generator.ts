import type { CardData } from "../types/cards";
import type { DreamsignTemplate, PackageTideId } from "../types/content";
import type { DraftState } from "../types/draft";
import type { Dreamsign, RuntimeShopSlot } from "../types/quest";

import { drawAndSpendUniqueCards } from "../draft/draft-engine";
import { drawDreamsignOptions } from "../dreamsign/dreamsign-pool";

/** Fixed price for standard card items. */
const STANDARD_CARD_PRICE = 100;

/** Fixed price for specialty-shop card items. */
const SPECIALTY_CARD_PRICE = 200;

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
   * When provided and non-empty the shop is a Specialty Shop: a single tide is
   * chosen from this list (the dreamcaller's mandatory tides) and the entire
   * inventory is restricted to cards and Dreamsigns of that tide.
   */
  specialtyTides?: readonly PackageTideId[];
  cardCount?: number;
  dreamsignCount?: number;
}

export interface ShopInventoryResult {
  slots: ShopSlot[];
  remainingDreamsignPoolIds: string[];
  spentDreamsignPoolIds: string[];
  /** The draft state after shop card slots were drawn and spent. */
  draftState: DraftState | null;
  /** The single tide this shop is restricted to, or null for a regular shop. */
  restrictedTide: PackageTideId | null;
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

/** Pick one random tide from the dreamcaller's mandatory tides. */
function pickSpecialtyTide(
  specialtyTides: readonly PackageTideId[],
): PackageTideId | null {
  if (specialtyTides.length === 0) {
    return null;
  }
  return specialtyTides[Math.floor(Math.random() * specialtyTides.length)];
}

/** Returns the draft-pool card numbers eligible for the restricted tide. */
function eligibleCardNumbersForTide(
  draftState: DraftState,
  cardDatabase: ReadonlyMap<number, CardData>,
  tide: PackageTideId,
): Set<number> {
  const eligible = new Set<number>();
  for (const cardNumberText of Object.keys(draftState.remainingCopiesByCard)) {
    const cardNumber = Number(cardNumberText);
    const card = cardDatabase.get(cardNumber);
    if (card !== undefined && card.tides.includes(tide)) {
      eligible.add(cardNumber);
    }
  }
  for (const cardNumberText of Object.keys(draftState.draftPoolCopiesByCard)) {
    const cardNumber = Number(cardNumberText);
    const card = cardDatabase.get(cardNumber);
    if (card !== undefined && card.tides.includes(tide)) {
      eligible.add(cardNumber);
    }
  }
  return eligible;
}

/**
 * Generates shop inventory: 3 cards and 2 dreamsigns by default. Cards are
 * drawn from — and spent against — the run draft multiset; dreamsigns are
 * drawn from — and spent against — the run's shared Dreamsign pool. When
 * `specialtyTides` is provided the whole inventory is restricted to a single
 * randomly chosen mandatory tide (Specialty Shop).
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
    specialtyTides = [],
    cardCount = STANDARD_CARD_COUNT,
    dreamsignCount = STANDARD_DREAMSIGN_COUNT,
  } = options;

  const restrictedTide = pickSpecialtyTide(specialtyTides);
  const isSpecialty = restrictedTide !== null;
  const cardPrice = isSpecialty ? SPECIALTY_CARD_PRICE : STANDARD_CARD_PRICE;

  // --- Card slots: drawn from the draft multiset and spent. ---
  const nextDraftState =
    draftState === null ? null : structuredClone(draftState);
  const slots: ShopSlot[] = [];
  if (nextDraftState !== null) {
    const eligible =
      restrictedTide === null
        ? undefined
        : eligibleCardNumbersForTide(
          nextDraftState,
          cardDatabase,
          restrictedTide,
        );
    const drawnCardNumbers = drawAndSpendUniqueCards(
      nextDraftState,
      cardCount,
      eligible,
    );
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
    const templatesById = new Map(
      dreamsignTemplates.map((template) => [template.id, template]),
    );
    // For a Specialty Shop, only Dreamsigns of the restricted tide are
    // eligible to be drawn, but the remaining pool still drops every drawn id.
    const eligiblePool =
      restrictedTide === null
        ? remainingPool
        : remainingPool.filter((id) =>
          templatesById.get(id)?.packageTides.includes(restrictedTide),
        );
    const draw = drawDreamsignOptions(
      eligiblePool,
      dreamsignTemplates,
      dreamsignCount,
      restrictedTide === null ? dreamsignRegenerationPoolIds : undefined,
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
    restrictedTide,
  };
}
