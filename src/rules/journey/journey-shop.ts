import { hashState, assertJsonSafe } from "../../eventlog/hash";
import { serializeCardNumber, type DraftPoolCopiesByCard, type DraftState } from "../../types/draft";
import { cardIdFromUnknown } from "../../types/card-identity";
import { dreamsignIdFromUnknown } from "../../types/identifiers";
import type { JourneyShopSlotReplacement, ShopOfferRevision, ShopReplacementItem } from "../../types/journey";
import { findSite, getSiteContentProvider } from "./sites";
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

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const ordinal = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const forms: ReadonlySet<string> = new Set(["Empowered", "Amplified", "Kindled", "Inspired", "Enduring", "Hastened", "Resonant", "Attuned", "Perfected"]);
const revision = (value: unknown): value is ShopOfferRevision => record(value) &&
  Object.keys(value).length === 2 && ordinal(value.purchaseCount) && ordinal(value.rerollCount);
const itemIdentity = (value: unknown): value is ShopReplacementItem => record(value) &&
  (value.kind === "dreamsign" ? dreamsignIdFromUnknown(value.dreamsignId) !== null :
    value.kind === "card" && cardIdFromUnknown(value.cardId) !== null && ordinal(value.cardNumber) &&
    (value.transfiguration === null || typeof value.transfiguration === "string" && forms.has(value.transfiguration)));
const poolIds = (value: unknown): boolean => Array.isArray(value) && value.every((id) => dreamsignIdFromUnknown(id) !== null);
const supply = (value: unknown): boolean => record(value) && (value.mode === null
  ? value.distinctRemaining === undefined && value.copiesRemaining === undefined
  : value.mode === "tides4" && ordinal(value.distinctRemaining) && ordinal(value.copiesRemaining) && value.distinctRemaining <= value.copiesRemaining);

/** Validate the exact copy-map boundary returned by the one-slot provider. */
function shopDraftCopies(value: unknown): value is DraftPoolCopiesByCard {
  if (!record(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) return false;
  let total = 0;
  for (const [key, count] of Object.entries(value)) {
    const number = Number(key);
    if (!ordinal(number) || serializeCardNumber(number) !== key || !ordinal(count)) return false;
    total += count;
    if (!Number.isSafeInteger(total)) return false;
  }
  return true;
}

function shopDraftSupply(state: Pick<DraftState, "mode" | "remainingCopiesByCard"> | null): JourneyShopSlotReplacement["draftSupplyBefore"] {
  if (state === null) return { mode: null };
  const counts = Object.values(state.remainingCopiesByCard).filter((count) => count > 0);
  return { mode: state.mode, distinctRemaining: counts.length, copiesRemaining: counts.reduce((sum, count) => sum + count, 0) };
}

/** A Shop draw may change only remaining copies; Bazaar keeps its exact draft. */
function validShopReplacementDraft(before: DraftState | null, after: unknown, bazaar: boolean, reportedBefore: unknown, reportedAfter: unknown): boolean {
  if (!supply(reportedBefore) || !supply(reportedAfter) || (bazaar ? after !== before : before === null || after === null)) return false;
  assertJsonSafe({ draftState: after, reportedBefore, reportedAfter }, "shopReplacement");
  if (before === null || after === null) return before === null && after === null &&
    hashState(reportedBefore) === hashState(shopDraftSupply(null)) && hashState(reportedAfter) === hashState(shopDraftSupply(null));
  if (!record(after) || Object.getPrototypeOf(after) !== Object.prototype && Object.getPrototypeOf(after) !== null ||
    before.mode !== "tides4" || after.mode !== "tides4" || !shopDraftCopies(before.draftPoolCopiesByCard) ||
    !shopDraftCopies(before.remainingCopiesByCard) || !shopDraftCopies(after.draftPoolCopiesByCard) || !shopDraftCopies(after.remainingCopiesByCard)) return false;
  for (const copies of [before.remainingCopiesByCard, after.remainingCopiesByCard]) {
    if (Object.entries(copies).some(([key, count]) => !Object.prototype.hasOwnProperty.call(before.draftPoolCopiesByCard, key) ||
      count > before.draftPoolCopiesByCard[serializeCardNumber(Number(key))])) return false;
  }
  return hashState({ ...before, remainingCopiesByCard: null }) === hashState({ ...after, remainingCopiesByCard: null }) &&
    hashState(reportedBefore) === hashState(shopDraftSupply(before)) &&
    hashState(reportedAfter) === hashState(shopDraftSupply({ mode: "tides4", remainingCopiesByCard: after.remainingCopiesByCard }));
}

/** Stable identity of the rendered shelf, including Restocks without purchases. */
export function shopOfferRevision(runtime: Pick<ShopSiteRuntime, "purchaseHistory" | "rerollCount">): ShopOfferRevision {
  if (!Array.isArray(runtime.purchaseHistory) || !ordinal(runtime.rerollCount)) throw new Error("Invalid shop offer revision.");
  return { purchaseCount: runtime.purchaseHistory.length, rerollCount: runtime.rerollCount };
}

/** Validate only this protocol's optional receipt fields; legacy absence is stable. */
export function validShopReplenishmentRuntime(value: unknown): boolean {
  if (!record(value) || value.kind !== "shop") return true;
  if (!Array.isArray(value.purchaseHistory)) return false;
  for (const [index, receipt] of value.purchaseHistory.entries()) {
    if (!record(receipt)) continue;
    const expected = receipt.expectedOffer;
    if (expected !== undefined && (!revision(expected) || expected.purchaseCount !== index ||
      !ordinal(value.rerollCount) || expected.rerollCount > value.rerollCount)) return false;
    const applied = receipt.slotReplacement;
    if (applied === undefined) continue;
    if (!record(applied) || !revision(expected) || !revision(applied.revisionBefore) || !revision(applied.revisionAfter) ||
      applied.revisionBefore.purchaseCount !== expected.purchaseCount || applied.revisionBefore.rerollCount !== expected.rerollCount ||
      applied.revisionAfter.purchaseCount !== index + 1 || applied.revisionAfter.rerollCount !== expected.rerollCount ||
      dreamsignIdFromUnknown(applied.dreamsignId) === null || !ordinal(applied.heldIndex) ||
      !ordinal(receipt.eventSeq) || !ordinal(receipt.slotIndex) || !itemIdentity(applied.purchased) || !record(receipt.item) ||
      (applied.purchased.kind === "card" ? receipt.item.kind !== "card" || receipt.item.cardNumber !== applied.purchased.cardNumber
        : receipt.item.kind !== "dreamsign" || receipt.item.dreamsignId !== applied.purchased.dreamsignId) ||
      !Array.isArray(applied.drawIndices) || applied.drawIndices.some((n, i, all) => !ordinal(n) || i > 0 && n <= all[i - 1]) ||
      !poolIds(applied.remainingDreamsignPoolBefore) || !poolIds(applied.remainingDreamsignPoolAfter) ||
      !supply(applied.draftSupplyBefore) || !supply(applied.draftSupplyAfter)) return false;
    const replacement = applied.replacement;
    if (replacement !== null && (!record(replacement) || !itemIdentity(replacement.item) || replacement.item.kind !== applied.purchased.kind ||
      typeof replacement.basePrice !== "number" || !Number.isFinite(replacement.basePrice) || replacement.basePrice < 0 ||
      typeof replacement.discountPercent !== "number" || !Number.isFinite(replacement.discountPercent) || replacement.discountPercent < 0 || replacement.discountPercent > 100)) return false;
  }
  return true;
}

/** Optional receipt provenance survives the compacted-state JSON boundary. */
export function assertShopReplenishmentCheckpoint(state: unknown): void {
  if (!record(state) || !record(state.journey) || !record(state.journey.siteRuntime)) return;
  if (Object.values(state.journey.siteRuntime).some((runtime) => !validShopReplenishmentRuntime(runtime))) {
    throw new Error("Invalid shop replenishment checkpoint.");
  }
}

function sameSlotItem(slot: RuntimeShopSlot, item: ShopReplacementItem): boolean {
  return slot.itemType === "card" ? item.kind === "card" && item.cardNumber === slot.cardNumber &&
    item.transfiguration === (slot.transfiguration ?? null) : item.kind === "dreamsign" && item.dreamsignId === slot.dreamsign.id;
}

function replacePurchasedItem(input: Parameters<JourneyModifierDefinition["afterJourneyEvent"]>[0], dreamsignId: DreamsignId): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
  const { before, journey, eventType, siteId, seq, heldIndex, random } = input;
  if (eventType !== "BUY_SHOP_SLOT" || siteId === null) return null;
  const old = before.siteRuntime[siteId], runtime = journey.siteRuntime[siteId];
  if (old?.kind !== "shop" || runtime?.kind !== "shop" || runtime.purchaseHistory.length !== old.purchaseHistory.length + 1) return null;
  const receipt = runtime.purchaseHistory[runtime.purchaseHistory.length - 1];
  if (receipt.eventSeq !== seq || receipt.siteId !== siteId || receipt.slotReplacement !== undefined) return null;
  const purchasedSlot = old.slots[receipt.slotIndex], vacancy = runtime.slots[receipt.slotIndex];
  if (purchasedSlot === undefined || purchasedSlot.purchased || vacancy === undefined || !vacancy.purchased) return null;
  const site = findSite(journey, siteId), provider = getSiteContentProvider();
  if (site === null || (site.type !== "Shop" && site.type !== "DreamsignBazaar") || provider?.replacePurchasedShopSlot === undefined || !revision(receipt.expectedOffer)) {
    throw new Error("Required purchased-slot replacement content is unavailable.");
  }
  const drawIndices: number[] = [];
  const result = provider.replacePurchasedShopSlot({ journey, site, slotIndex: receipt.slotIndex, purchasedSlot, random: () => {
    const draw = random();
    if (!ordinal(draw.drawIndex) || !Number.isFinite(draw.value) || draw.value < 0 || draw.value >= 1) throw new RangeError("Invalid shop replacement draw.");
    drawIndices.push(draw.drawIndex); return draw.value;
  } });
  if (result === null || !itemIdentity(result.purchasedItem) || !sameSlotItem(purchasedSlot, result.purchasedItem) ||
    !poolIds(result.remainingDreamsignPoolIds) || !poolIds(result.remainingDreamsignPool) ||
    result.remainingDreamsignPoolIds.length !== result.remainingDreamsignPool.length || result.remainingDreamsignPoolIds.some((id, i) => id !== result.remainingDreamsignPool[i]) ||
    !validShopReplacementDraft(journey.draftState, result.draftState, site.type === "DreamsignBazaar", result.draftSupplyBefore, result.draftSupplyAfter) ||
    (site.type === "Shop" && result.draftState === null) ||
    (site.type === "DreamsignBazaar" && result.draftState !== journey.draftState) ||
    (result.slot === null ? result.replacementItem !== null : !record(result.slot) || result.slot.purchased !== false ||
      result.slot.itemType !== (site.type === "Shop" ? "card" : "dreamsign") || !itemIdentity(result.replacementItem) || !sameSlotItem(result.slot, result.replacementItem))) {
    throw new Error("Invalid purchased-slot replacement result.");
  }
  const applied: JourneyShopSlotReplacement = {
    dreamsignId, heldIndex, revisionBefore: { ...receipt.expectedOffer }, revisionAfter: shopOfferRevision(runtime),
    purchased: result.purchasedItem,
    replacement: result.slot === null ? null : { item: result.replacementItem!, basePrice: result.slot.basePrice, discountPercent: result.slot.discountPercent },
    drawIndices, remainingDreamsignPoolBefore: [...journey.remainingDreamsignPool], remainingDreamsignPoolAfter: [...result.remainingDreamsignPool],
    draftSupplyBefore: result.draftSupplyBefore, draftSupplyAfter: result.draftSupplyAfter,
  };
  const nextRuntime: ShopSiteRuntime = { ...runtime,
    slots: runtime.slots.map((slot, i) => i === receipt.slotIndex && result.slot !== null ? result.slot : slot),
    remainingDreamsignPoolIds: [...result.remainingDreamsignPoolIds],
    purchaseHistory: [...runtime.purchaseHistory.slice(0, -1), { ...receipt, slotReplacement: applied }],
  };
  if (!validShopReplenishmentRuntime(nextRuntime)) throw new Error("Invalid shop replacement receipt.");
  return { journey: { ...journey, draftState: result.draftState, remainingDreamsignPool: [...result.remainingDreamsignPool],
    siteRuntime: { ...journey.siteRuntime, [siteId]: nextRuntime } },
    before: { vacantPositions: 1 }, after: { vacantPositions: result.slot === null ? 1 : 0, replenishedPositions: result.slot === null ? 0 : 1 },
    target: { siteIds: [siteId], shopReplacements: [applied] } };
}

/** Register one bounded clause and report only successful matching operations. */
export function journeyShop(dreamsignId: DreamsignId, descriptor: JourneyShopEffect): JourneyModifierDefinition {
  if (descriptor.kind !== "firstRestockFree" && descriptor.kind !== "purchasedCardTransfiguration" && descriptor.kind !== "replacePurchasedItem" &&
    !(descriptor.kind === "firstCardPurchase" && Number.isFinite(descriptor.discountPercent) && descriptor.discountPercent >= 0 && descriptor.discountPercent <= 100) &&
    (descriptor.kind !== "additionalOptions" || !Number.isSafeInteger(descriptor.amount) || descriptor.amount < 1)) {
    throw new RangeError("Invalid journeyShop catalog clause.");
  }
  const effect = Object.freeze({ ...descriptor });
  return { dreamsignId, journeyShop: effect,
    afterJourneyEvent(input): ReturnType<JourneyModifierDefinition["afterJourneyEvent"]> {
      if (effect.kind === "replacePurchasedItem") return replacePurchasedItem(input, dreamsignId);
      const { before, journey, eventType, heldIndex, siteId, seq, lookup } = input;
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
