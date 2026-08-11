import { requireDreamsignId } from "../../data/dreamsigns";
import { effectivePrice } from "../../shop/shop-generator";
import type { CardData } from "../../types/cards";
import type {
  JourneyState,
  ShopPurchaseResult,
  ShopSiteRuntime,
} from "../../types/journey";
import { hasFreePurchase } from "./shop-free-purchase-view-model";

/** Reconstructable inventory and modifier state recorded when a merchant opens. */
export function buildShopSiteEntryLog(
  runtime: ShopSiteRuntime,
  shopModifiers: JourneyState["shopModifiers"],
  cardDatabase: ReadonlyMap<number, CardData>,
) {
  const ordinaryPriceModifiers = {
    essenceDiscountPercent: shopModifiers.essenceDiscountPercent,
  };
  const finalPriceModifiers = {
    ...ordinaryPriceModifiers,
    freePurchase: hasFreePurchase(runtime, shopModifiers),
  };
  return {
    freeNextShopSource: runtime.freePurchaseSource ?? null,
    freePurchaseModifiers: (shopModifiers.freePurchaseModifiers ?? []).map(
      (modifier) => ({ ...modifier }),
    ),
    slots: runtime.slots.map((slot, slotIndex) => ({
      slotIndex,
      item:
        slot.itemType === "card"
          ? {
              kind: "card" as const,
              cardId: cardDatabase.get(slot.cardNumber)?.id ?? null,
              cardNumber: slot.cardNumber,
            }
          : {
              kind: "dreamsign" as const,
              dreamsignId: requireDreamsignId(
                slot.dreamsign,
                "Dreamsign Bazaar entry log",
              ),
            },
      purchased: slot.purchased,
      basePrice: slot.basePrice,
      slotDiscountPercent: slot.discountPercent,
      essenceDiscountPercent: shopModifiers.essenceDiscountPercent,
      priceBeforeFree: effectivePrice(slot, ordinaryPriceModifiers),
      finalPrice: effectivePrice(slot, finalPriceModifiers),
    })),
  };
}

/** Exact UUID-resolved purchase receipts retained across merchant rerolls. */
export function buildShopPurchaseLogs(
  purchaseHistory: readonly ShopPurchaseResult[],
  cardDatabase: ReadonlyMap<number, CardData>,
) {
  return purchaseHistory.map((receipt) => ({
    eventSeq: receipt.eventSeq,
    siteId: receipt.siteId,
    slotIndex: receipt.slotIndex,
    item:
      receipt.item.kind === "card"
        ? {
            kind: "card" as const,
            cardId: cardDatabase.get(receipt.item.cardNumber)?.id ?? null,
            cardNumber: receipt.item.cardNumber,
            gainedEntryId: receipt.item.gainedEntryId,
          }
        : {
            kind: "dreamsign" as const,
            dreamsignId: receipt.item.dreamsignId,
            replacedDreamsignId: receipt.item.replacedDreamsignId ?? null,
          },
    priceBeforeFree: receipt.priceBeforeFree,
    chargedPrice: receipt.pricePaid,
    essenceBefore: receipt.essenceBefore,
    essenceAfter: receipt.essenceAfter,
    freeNextShopSource: receipt.freeNextShopSource ?? null,
    freePurchaseModifier: receipt.freePurchaseModifier ?? null,
  }));
}
