import { effectivePrice } from "../../shop/shop-generator";
import { rerollCost } from "../../shop/shop-pricing";
import type { EconomyData } from "../../types/economy-data";
import type { DreamsignId } from "../../types/identifiers";
import type { DeckEntry, JourneyShopEffect, JourneyShopPurchaseTransfiguration, JourneyState, ShopSiteRuntime, SiteState, RuntimeShopSlot, ShopPurchaseResult } from "../../types/journey";
import { journeyTransfigurationCard } from "./journey-transfiguration";
import type { JourneyModifierDefinition, JourneyModifierRegistry } from "./modifier-registry";

type Lookup = Pick<JourneyModifierRegistry, "lookup">;

/** Quote fresh stock from the site's authored category and physical held copies. */
export function shopStockCounts(journey: Pick<JourneyState, "dreamsigns">, site: SiteState,
  base: { readonly cardCount: number; readonly dreamsignCount: number }, registry: Lookup) {
  let { cardCount, dreamsignCount } = base;
  if (![cardCount, dreamsignCount].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new RangeError("Invalid shop stock count.");
  for (const sign of journey.dreamsigns) {
    const effect = registry.lookup(sign.id)?.journeyShop;
    if (effect?.kind !== "additionalOptions") continue;
    if (site.type === "Shop") cardCount += effect.amount;
    else if (site.type === "DreamsignBazaar") dreamsignCount += effect.amount;
    if (![cardCount, dreamsignCount].every(Number.isSafeInteger)) throw new RangeError("Shop stock exceeds safe arithmetic.");
  }
  return { cardCount, dreamsignCount };
}

/** The same live quote drives the reducer and both Restock affordances. */
export function shopRestockQuote(journey: Pick<JourneyState, "dreamsigns" | "shopModifiers">,
  runtime: ShopSiteRuntime, site: SiteState, config: EconomyData["shop"]["reroll"], registry: Lookup) {
  const useFreeReroll = journey.shopModifiers.freeRerolls > 0;
  const firstFree = (site.type === "Shop" || site.type === "DreamsignBazaar") && runtime.rerollCount === 0 &&
    journey.dreamsigns.some((sign) => registry.lookup(sign.id)?.journeyShop?.kind === "firstRestockFree");
  return { useFreeReroll, price: useFreeReroll || firstFree ? 0 : rerollCost(config, runtime.rerollCount, site.isEnhanced) };
}

/** Live pricing uses successful physical card receipts, independently of shelf changes. */
export function shopCardPurchaseQuote(journey: Pick<JourneyState, "dreamsigns" | "shopModifiers">,
  runtime: ShopSiteRuntime, site: SiteState, slot: RuntimeShopSlot, registry: Lookup) {
  const firstCardPurchase = site.type === "Shop" && slot.itemType === "card" &&
    !runtime.purchaseHistory.some((receipt) => receipt.item.kind === "card");
  const discounts: NonNullable<ShopPurchaseResult["firstCardPurchaseDiscounts"]>[number][] = [];
  if (firstCardPurchase) journey.dreamsigns.forEach((sign, heldIndex) => {
    const effect = registry.lookup(sign.id)?.journeyShop;
    if (effect?.kind === "firstCardPurchase") discounts.push({ dreamsignId: sign.id, heldIndex, discountPercent: effect.discountPercent });
  });
  const essenceDiscountPercent = Math.max(0, journey.shopModifiers.essenceDiscountPercent) +
    discounts.reduce((sum, source) => sum + source.discountPercent, 0);
  return { firstCardPurchase, discounts,
    priceBeforeFree: effectivePrice(slot, { essenceDiscountPercent }),
    pricePaid: effectivePrice(slot, { essenceDiscountPercent,
      freePurchase: runtime.freePurchaseSource !== undefined || (journey.shopModifiers.freePurchaseModifiers?.length ?? 0) > 0 }),
  };
}

/** Prepare the exact physical purchase before any post-domain gain observers. */
export function transfigureShopPurchase(journey: Pick<JourneyState, "dreamsigns">, site: SiteState,
  entry: DeckEntry, registry: Lookup, rng: (index: number) => number, runtime?: ShopSiteRuntime):
  { readonly entry: DeckEntry; readonly application?: JourneyShopPurchaseTransfiguration } | null {
  if (site.type !== "Shop" || entry.transfiguration !== null) return { entry };
  const firstCardPurchase = runtime !== undefined && !runtime.purchaseHistory.some((receipt) => receipt.item.kind === "card");
  const heldIndex = journey.dreamsigns.findIndex((sign) => {
    const kind = registry.lookup(sign.id)?.journeyShop?.kind;
    return kind === "purchasedCardTransfiguration" || kind === "firstCardPurchase" && firstCardPurchase;
  });
  if (heldIndex < 0) return { entry };
  const card = journeyTransfigurationCard(entry);
  if (card === null) return null;
  if (card.forms.length === 0) return { entry };
  const drawIndex = 0, value = rng(drawIndex);
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("Invalid purchased-card transfiguration draw.");
  const type = card.forms[Math.floor(value * card.forms.length)];
  return { entry: { ...entry, transfiguration: type }, application: {
    dreamsignId: journey.dreamsigns[heldIndex].id, heldIndex, entryId: entry.entryId,
    cardId: card.cardId, before: null, type, applicableForms: [...card.forms], drawIndex,
  } };
}

/** Register one bounded clause and report only successful matching operations. */
export function journeyShop(dreamsignId: DreamsignId, descriptor: JourneyShopEffect): JourneyModifierDefinition {
  if (descriptor.kind !== "firstRestockFree" && descriptor.kind !== "purchasedCardTransfiguration" &&
    !(descriptor.kind === "firstCardPurchase" && Number.isFinite(descriptor.discountPercent) && descriptor.discountPercent >= 0 && descriptor.discountPercent <= 100) &&
    (descriptor.kind !== "additionalOptions" || !Number.isSafeInteger(descriptor.amount) || descriptor.amount < 1)) {
    throw new RangeError("Invalid journeyShop catalog clause.");
  }
  const effect = Object.freeze({ ...descriptor });
  return { dreamsignId, journeyShop: effect,
    afterJourneyEvent({ before, journey, eventType, heldIndex, siteId, seq, lookup }): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
      if (siteId === null) return null;
      const old = before.siteRuntime[siteId], runtime = journey.siteRuntime[siteId];
      if (runtime?.kind !== "shop") return null;
      if (effect.kind === "firstCardPurchase") {
        if (eventType !== "BUY_SHOP_SLOT" || old?.kind !== "shop" || runtime.purchaseHistory.length !== old.purchaseHistory.length + 1) return null;
        const receipt = runtime.purchaseHistory[runtime.purchaseHistory.length - 1];
        const discount = receipt.firstCardPurchaseDiscounts?.find((source) => source.dreamsignId === dreamsignId && source.heldIndex === heldIndex);
        if (receipt.eventSeq !== seq || receipt.item.kind !== "card" || discount === undefined) return null;
        const slot = old.slots[receipt.slotIndex];
        const application = receipt.item.journeyShopTransfiguration;
        return { journey,
          before: { basePrice: slot.basePrice, slotDiscountPercent: slot.discountPercent,
            essenceDiscountPercent: before.shopModifiers.essenceDiscountPercent, discountPercent: discount.discountPercent },
          after: { priceBeforeFree: receipt.priceBeforeFree, pricePaid: receipt.pricePaid, essence: receipt.essenceAfter },
          target: { siteIds: [siteId], ...(application?.dreamsignId === dreamsignId && application.heldIndex === heldIndex ? { transfigurations: [application] } : {}) } };
      }
      if (effect.kind === "purchasedCardTransfiguration") {
        if (eventType !== "BUY_SHOP_SLOT" || old?.kind !== "shop" || runtime.purchaseHistory.length !== old.purchaseHistory.length + 1) return null;
        const receipt = runtime.purchaseHistory[runtime.purchaseHistory.length - 1];
        const application = receipt.item.kind === "card" ? receipt.item.journeyShopTransfiguration : undefined;
        if (receipt.eventSeq !== seq || application?.dreamsignId !== dreamsignId || application.heldIndex !== heldIndex ||
          receipt.item.kind !== "card" || application.entryId !== receipt.item.gainedEntryId) return null;
        return { journey, before: { transformed: 0 }, after: { transformed: 1 },
          target: { siteIds: [siteId], transfigurations: [application] } };
      }
      const restocked = eventType === "REROLL_SHOP" && old?.kind === "shop" && runtime.rerollCount === old.rerollCount + 1;
      if (effect.kind === "firstRestockFree") {
        if (!restocked || old.rerollCount !== 0 || before.shopModifiers.freeRerolls > 0 ||
          before.dreamsigns.findIndex((sign) => lookup(sign.id)?.journeyShop?.kind === "firstRestockFree") !== heldIndex) return null;
        return { journey, before: { firstRestockAvailable: 1, essence: before.essence },
          after: { firstRestockAvailable: 0, essence: journey.essence, price: 0 }, target: { siteIds: [siteId] } };
      }
      if (!restocked && !(eventType === "OPEN_SITE" && old === undefined)) return null;
      const preceding = before.dreamsigns.slice(0, heldIndex).reduce((sum, sign) => {
        const clause = lookup(sign.id)?.journeyShop;
        return sum + (clause?.kind === "additionalOptions" ? clause.amount : 0);
      }, 0);
      return { journey, before: { additionalOptions: preceding },
        after: { additionalOptions: preceding + effect.amount, offeredOptions: runtime.slots.length }, target: { siteIds: [siteId] } };
    },
  };
}
