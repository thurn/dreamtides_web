import type { CardData } from "../types/cards";
import type { DreamsignTemplate, ResolvedDreamAvatarPackage } from "../types/content";
import type { DraftState, PoolDraftState } from "../types/draft";
import type { Dreamsign, RuntimeShopSlot } from "../types/journey";
import type { EconomyData, EconomyWeightedValue } from "../types/economy-data";

import { drawAndSpendUniqueCards } from "../draft/draft-engine";
import { drawDreamsignOptions } from "../dreamsign/dreamsign-pool";
import { logAffiliationDraw } from "../affiliations/affiliation-weights";

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
}

type ShopPricedSlot = Pick<
  ShopSlot,
  "itemType" | "basePrice" | "discountPercent"
> & Partial<Pick<ShopSlot, "card" | "dreamsign" | "purchased">>;

export interface ShopGenerationOptions {
  economy: EconomyData["shop"];
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
  /**
   * Optional affiliation reweighting (`cardNumber -> multiplier`) for a shop in
   * an affiliated dreamscape (see `src/affiliations/affiliation-weights.ts`).
   * Applied to a regular shop's draft-multiset card draw so the stock leans toward
   * the dreamscape's affiliation without ever removing a card. A Specialty Shop's
   * card slots come from the run's fixed starter decklist and are deliberately
   * left unbiased — that shop already features a curated list by design.
   */
  affiliationNumberWeights?: ReadonlyMap<number, number>;
  /**
   * The id of the affiliation `affiliationNumberWeights` came from, recorded in
   * the reconstruction log. Absent in a neutral dreamscape.
   */
  affiliationId?: string;
  /**
   * Deterministic `[0, 1)` random source for the stock draw, discounts, and the
   * Dreamsign pull. Defaults to `Math.random` (the legacy/UI path); the coop
   * site provider passes a stream derived from `ctx.rng` so two clients folding
   * the same `OPEN_SITE` / `REROLL_SHOP` roll a byte-identical inventory.
   */
  rng?: () => number;
}

function weightedValue(entries: readonly EconomyWeightedValue[], rng: () => number): number {
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  const target = rng() * total;
  let cumulative = 0;
  for (const entry of entries) {
    cumulative += entry.weight;
    if (target < cumulative) return entry.value;
  }
  return entries[entries.length - 1].value;
}

export interface ShopInventoryResult {
  slots: ShopSlot[];
  remainingDreamsignPoolIds: string[];
  spentDreamsignPoolIds: string[];
  reconstructionLog: ShopInventoryReconstructionLog;
  /**
   * The draft multiset after this shop drew its card slots from — and spent —
   * it. Present ONLY for a regular pool-card shop that actually spent the run
   * draft multiset. `undefined` means the shop did not touch the run's draft
   * state at all — a Specialty Shop (draws from the fixed starter decklist), a
   * card-less Dreamsign Market (`cardCount: 0`), or a run with no draft state —
   * and the caller MUST keep its existing draft state rather than persist
   * anything from the result.
   *
   * This deliberately does not reuse `null` for "untouched": a card-less shop
   * is generated with `draftState: null`, and persisting that null back into the
   * run state would wipe the draft pool and leave every later Card Shop empty.
   * `undefined` ("I didn't touch it") is therefore distinct from a real spent
   * state, so the write-back can never silently null the run's draft pool.
   */
  draftState?: DraftState;
}

export interface ShopInventoryReconstructionLog {
  event: "shop_inventory_generated";
  shopType: "specialty" | "regular";
  affiliationId: string | null;
  requestedCardCount: number;
  requestedDreamsignCount: number;
  cardSource: "specialty" | "draft_multiset" | "none";
  drawnCardCount: number;
  cardsMissingFromDatabase: number;
  cardSlotCount: number;
  dreamsignSlotCount: number;
  totalSlotCount: number;
  draftPoolBefore: ReturnType<typeof summarizeDraftPool>;
  draftPoolAfter: ReturnType<typeof summarizeDraftPool>;
  remainingDreamsignPoolCount: number;
}

/**
 * Returns the total discount for a slot after shop-wide modifiers. Every slot
 * is essence-priced, so the shop-wide essence discount applies to cards and
 * Dreamsigns alike.
 */
export function effectiveDiscountPercent(
  slot: ShopPricedSlot,
  modifiers: ShopPriceModifiers = {},
): number {
  const slotDiscount = Math.max(0, slot.discountPercent);
  const essenceDiscount = Math.max(0, modifiers.essenceDiscountPercent ?? 0);
  return Math.min(100, slotDiscount + essenceDiscount);
}

/** Returns the effective essence price of a slot after discount. */
export function effectivePrice(
  slot: ShopPricedSlot,
  modifiers: ShopPriceModifiers = {},
): number {
  const discountPercent = effectiveDiscountPercent(slot, modifiers);
  return discountPercent === 0
    ? slot.basePrice
    : Math.round(slot.basePrice * (1 - discountPercent / 100));
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
  resolvedPackage: ResolvedDreamAvatarPackage | null | undefined,
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
 * Summarizes a draft state's remaining card supply for the shop reconstruction
 * log. For a `pool` draft this is the distinct card count and the total copies
 * still available to draw; other modes report only their `mode` (they draw from
 * a frozen pack/replay sequence rather than a depleting multiset). Returns
 * `{ mode: null }` when the run has no draft state at all. This is what
 * distinguishes a genuinely exhausted pool from a missing card source when a
 * shop renders empty.
 */
function summarizeDraftPool(
  state: DraftState | null,
): { mode: string | null; distinctRemaining?: number; copiesRemaining?: number } {
  if (state === null) return { mode: null };
  if (state.mode !== "pool") return { mode: state.mode };
  const entries = Object.values(state.remainingCopiesByCard);
  let distinctRemaining = 0;
  let copiesRemaining = 0;
  for (const copies of entries) {
    if (copies > 0) {
      distinctRemaining += 1;
      copiesRemaining += copies;
    }
  }
  return { mode: "pool", distinctRemaining, copiesRemaining };
}

function shuffledIndices(length: number, rng: () => number): number[] {
  const indices = Array.from({ length }, (_, index) => index);
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
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
    economy,
    cardDatabase,
    draftState,
    remainingDreamsignPoolIds = [],
    dreamsignTemplates = [],
    dreamsignRegenerationPoolIds,
    starterDecklistCardNumbers = [],
    cardCount = economy.stock.cardShop.cardSlots,
    dreamsignCount = economy.stock.cardShop.dreamsignSlots,
    affiliationNumberWeights,
    affiliationId,
    rng = Math.random,
  } = options;

  const isSpecialty = starterDecklistCardNumbers.length > 0;
  const cardPrice = isSpecialty ? economy.prices.specialtyCard : economy.prices.standardCard;

  const nextDraftState =
    draftState === null ? null : structuredClone(draftState);
  // The spent draft multiset to hand back, set ONLY when the regular pool-card
  // branch below actually draws from and spends it. Left `undefined` for every
  // card-less or fixed-list shop so the caller keeps its own draft state (see
  // `ShopInventoryResult.draftState`).
  let spentDraftState: DraftState | undefined = undefined;
  const slots: ShopSlot[] = [];

  // Reconstruction-log accounting for the card slots. `cardSource` records which
  // supply the shop drew from; `drawnCardNumbers` is how many card numbers the
  // draw yielded; `cardsMissingFromDatabase` counts draws silently dropped
  // because the card number was absent from `cardDatabase`. Together they
  // explain any shortfall between the requested `cardCount` and the card slots
  // that actually appear.
  const poolBefore = summarizeDraftPool(draftState);
  let cardSource: "specialty" | "draft_multiset" | "none" = "none";
  let drawnCardCount = 0;
  let cardsMissingFromDatabase = 0;

  if (isSpecialty) {
    // --- Specialty card slots: drawn from the fixed starter decklist,
    // without touching the draft multiset. ---
    const shuffled = [...starterDecklistCardNumbers];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const drawnCardNumbers = shuffled.slice(0, cardCount);
    cardSource = "specialty";
    drawnCardCount = drawnCardNumbers.length;
    for (const cardNumber of drawnCardNumbers) {
      const card = cardDatabase.get(cardNumber);
      if (card === undefined) {
        cardsMissingFromDatabase += 1;
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
    // --- Regular card slots: drawn from the draft multiset and spent, biased
    // toward the dreamscape's affiliation when one is supplied. This is the
    // only branch that spends the run draft multiset, so it is the only one
    // that hands a draft state back to the caller. ---
    spentDraftState = nextDraftState;
    const drawnCardNumbers = drawAndSpendUniqueCards(
      nextDraftState,
      cardCount,
      undefined,
      affiliationNumberWeights,
      // Explicit randomness source threaded from the caller: the UI path passes
      // `Math.random`, while the coop site provider passes a `ctx.rng`-derived
      // stream so the stock draw is deterministic per event.
      rng,
    );
    cardSource = "draft_multiset";
    drawnCardCount = drawnCardNumbers.length;
    if (affiliationNumberWeights !== undefined) {
      logAffiliationDraw({
        drawSite: "shop_stock",
        affiliationId,
        candidateWeights: affiliationNumberWeights,
        picked: drawnCardNumbers,
      });
    }
    for (const cardNumber of drawnCardNumbers) {
      const card = cardDatabase.get(cardNumber);
      if (card === undefined) {
        cardsMissingFromDatabase += 1;
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

  const cardSlotCount = slots.length;

  // --- Dreamsign slots: drawn from the shared Dreamsign pool and spent. ---
  let remainingPool = [...remainingDreamsignPoolIds];
  const spentDreamsignPoolIds: string[] = [];
  if (dreamsignTemplates.length > 0 && dreamsignCount > 0) {
    const draw = drawDreamsignOptions(
      remainingPool,
      dreamsignTemplates,
      dreamsignCount,
      dreamsignRegenerationPoolIds,
      rng,
    );
    for (const dreamsign of draw.offeredDreamsigns) {
      slots.push({
        itemType: "dreamsign",
        card: null,
        dreamsign,
        basePrice: economy.prices.dreamsign,
        discountPercent: 0,
        purchased: false,
      });
    }
    spentDreamsignPoolIds.push(...draw.offeredIds);
    remainingPool = remainingPool.filter(
      (id) => !draw.offeredIds.includes(id),
    );
  }

  const discountCount = weightedValue(economy.discounts.slotCounts, rng);
  const indices = shuffledIndices(slots.length, rng);
  for (let d = 0; d < discountCount && d < indices.length; d += 1) {
    const idx = indices[d];
    const discount = weightedValue(economy.discounts.percentages, rng);
    slots[idx] = { ...slots[idx], discountPercent: discount };
  }

  const dreamsignSlotCount = slots.length - cardSlotCount;

  // Reconstruction log: one event per generated shop, enough to explain any
  // empty or short shop after the fact. `cardSlotCount === 0` with a non-`none`
  // `cardSource` is the empty-shop signature; cross-check `drawnCardCount`
  // (pool exhausted vs. drew but filtered) and `cardsMissingFromDatabase`
  // (drew valid numbers but the card database lacked them) against the
  // requested `cardCount` to localize the cause.
  const reconstructionLog: ShopInventoryReconstructionLog = {
    event: "shop_inventory_generated",
    shopType: isSpecialty ? "specialty" : "regular",
    affiliationId: affiliationId ?? null,
    requestedCardCount: cardCount,
    requestedDreamsignCount: dreamsignCount,
    cardSource,
    drawnCardCount,
    cardsMissingFromDatabase,
    cardSlotCount,
    dreamsignSlotCount,
    totalSlotCount: slots.length,
    draftPoolBefore: poolBefore,
    draftPoolAfter: summarizeDraftPool(nextDraftState),
    remainingDreamsignPoolCount: remainingPool.length,
  };

  return {
    slots,
    remainingDreamsignPoolIds: remainingPool,
    spentDreamsignPoolIds,
    reconstructionLog,
    draftState: spentDraftState,
  };
}
