import { afterEach, describe, expect, it } from "vitest";
import type { DraftState } from "../../types/draft";
import type { Dreamsign, ShopSiteRuntime } from "../../types/journey";
import { testDreamsignId, testExplorationActionId } from "../../types/test-identities";
import { createSiteContentProvider } from "./site-provider";
import { createJourneyTransfigurationProvider } from "./journey-transfiguration-provider";
import { makeJourneyContent } from "./register-game-providers.fixtures";
import { clearGameProviders } from "./register-game-providers";
import { cardSlot, dreamsignSlot, shopState, SITE_ID, ctx } from "../../rules/journey/shop-fixtures";
import { event } from "../../rules/journey/lifecycle-fixtures";
import { reduceGameEvent } from "../../rules/reducer";
import { journeyShop } from "../../rules/journey/journey-shop";
import { createJourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import { registerSiteContentProvider } from "../../rules/journey/sites";
import { registerJourneyTransfigurationProvider } from "../../rules/journey/journey-transfiguration";

const content = makeJourneyContent();
const numbers = [...content.cardDatabase.keys()].slice(0, 3);
const ids = content.dreamsignTemplates.slice(0, 3).map(({ id }) => id);
function draft(copies = Object.fromEntries(numbers.map((n) => [n, 1]))): DraftState {
  return { mode: "tides4", draftPoolCopiesByCard: { ...copies }, remainingCopiesByCard: { ...copies },
    currentOffer: [], activeSiteId: null, sitePicksCompleted: 0, pickNumber: 1 };
}
const source = testDreamsignId("synthetic-refill"), sourceSign: Dreamsign = { id: source, name: "Same name", effectDescription: "" };
const runtime = (state: ReturnType<typeof shopState>) => state.journey.siteRuntime[SITE_ID] as ShopSiteRuntime;
function fixture(category: "Shop" | "DreamsignBazaar" = "Shop") {
  const state = shopState(category === "Shop" ? [cardSlot({ cardNumber: numbers[0] })] : [dreamsignSlot("purchased")],
    { draftState: draft(), remainingDreamsignPool: [...ids], essence: 1000, dreamsigns: [sourceSign] }, category);
  runtime(state).slots[0].purchased = true;
  return state;
}
function input(category: "Shop" | "DreamsignBazaar" = "Shop", enhanced = false) {
  const state = fixture(category), site = Object.values(state.journey.atlas.nodes)[0].sites[0]; site.isEnhanced = enhanced;
  return { state, value: { journey: state.journey, site, slotIndex: 0, purchasedSlot: { ...runtime(state).slots[0], purchased: false }, random: () => .25 } };
}
afterEach(clearGameProviders);

describe("real one-slot shop provider over synthetic content", () => {
  it.each(["Shop", "DreamsignBazaar"] as const)("draws one ordinary-category %s slot for normal/enhanced sites without mutating input", (category) => {
    for (const enhanced of [false, true]) {
      const { state, value } = input(category, enhanced), saved = structuredClone(state), provider = createSiteContentProvider(content);
      const generated = provider.replacePurchasedShopSlot!(value);
      expect(generated?.slot?.itemType).toBe(category === "Shop" ? "card" : "dreamsign");
      expect(generated?.slot?.purchased).toBe(false); expect(state).toEqual(saved);
      expect(provider.replacePurchasedShopSlot!(value)).toEqual(generated);
      if (category === "Shop") {
        expect(generated?.purchasedItem).toMatchObject({ kind: "card", cardId: content.cardDatabase.get(numbers[0])!.id });
        expect(Object.values(generated!.draftState!.remainingCopiesByCard).reduce((sum, count) => sum + count, 0)).toBe(numbers.length - 1);
        expect(generated?.remainingDreamsignPool).toEqual(ids);
      } else {
        expect(generated?.draftState).toBe(state.journey.draftState);
        expect(generated?.remainingDreamsignPool).toHaveLength(ids.length - 1);
        expect(generated?.remainingDreamsignPoolIds).toEqual(generated?.remainingDreamsignPool);
      }
    }
  });
  it("preserves the bound transfigured-offer mode without consuming another modifier", () => {
    const { state, value } = input();
    runtime(state).transfiguredOfferSource = { siteId: SITE_ID, actionId: testExplorationActionId("prepared-form") };
    const saved = structuredClone(state), generated = createSiteContentProvider(content).replacePurchasedShopSlot!(value);
    expect(generated?.slot?.itemType).toBe("card");
    expect(generated?.replacementItem?.kind === "card" && generated.replacementItem.transfiguration).not.toBeNull();
    expect(state).toEqual(saved);
  });
  it("distinguishes empty valid supply from unavailable draft/card/Dreamsign metadata", () => {
    const emptyCard = input(); emptyCard.state.journey.draftState = draft({});
    const exhausted = createSiteContentProvider(content).replacePurchasedShopSlot!({ ...emptyCard.value, journey: emptyCard.state.journey });
    expect(exhausted?.slot).toBeNull(); expect(exhausted?.draftState).toEqual(draft({}));
    emptyCard.state.journey.draftState = null;
    expect(() => createSiteContentProvider(content).replacePurchasedShopSlot!({ ...emptyCard.value, journey: emptyCard.state.journey })).toThrow();
    const missingCard = input(); missingCard.state.journey.draftState = draft({ 999999: 1 });
    expect(() => createSiteContentProvider(content).replacePurchasedShopSlot!(missingCard.value)).toThrow();
    const signs = input("DreamsignBazaar"); signs.state.journey.remainingDreamsignPool = [];
    expect(createSiteContentProvider(content).replacePurchasedShopSlot!(signs.value)?.slot).toBeNull();
    signs.state.journey.remainingDreamsignPool = [testDreamsignId("missing-template")];
    expect(() => createSiteContentProvider(content).replacePurchasedShopSlot!(signs.value)).toThrow();
  });
  it("replenishes through the actual hook and commits each real renewed Dreamsign remainder", () => {
    const catalog = { ...content, dreamsignTemplates: content.dreamsignTemplates.slice(0, 3) };
    const provider = createSiteContentProvider(catalog), use = createJourneyModifierRegistry([journeyShop(source, { kind: "replacePurchasedItem" })]);
    let state = shopState([dreamsignSlot("purchased", { basePrice: 1 })], { dreamsigns: [sourceSign], essence: 1000,
      remainingDreamsignPool: [], draftState: draft(), resolvedPackage: {
        avatar: catalog.avatars[0], draftPoolCopiesByCard: draft().draftPoolCopiesByCard, dreamsignPoolIds: [...ids],
        mandatoryOnlyPoolSize: 3, draftPoolSize: 3, doubledCardCount: 0, legalSubsetCount: 1, preferredSubsetCount: 1,
      } }, "DreamsignBazaar");
    registerSiteContentProvider(provider); registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(catalog));
    const offered = [];
    for (let count = 0; count < 3; count++) {
      const out = reduceGameEvent(state, event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0, expectedOffer: { purchaseCount: count, rerollCount: 0 } }), ctx({ seq: count + 1 }), use);
      expect(out.outcome).toBe("applied"); state = out.state;
      expect(state.journey.remainingDreamsignPool).toHaveLength(2 - count);
      const slot = runtime(state).slots[0]; if (slot.itemType !== "dreamsign") throw new Error("expected Dreamsign slot"); offered.push(slot.dreamsign.id);
      expect(runtime(state).purchaseHistory[count].slotReplacement?.replacement?.item).toMatchObject({ dreamsignId: slot.dreamsign.id });
    }
    expect(new Set(offered).size).toBe(3); expect(runtime(state).purchaseHistory).toHaveLength(3);
  });
  it("commits a real one-card spend or regeneration while preserving every optional draft field", () => {
    const provider = createSiteContentProvider(content), use = createJourneyModifierRegistry([journeyShop(source, { kind: "replacePurchasedItem" })]);
    registerSiteContentProvider(provider); registerJourneyTransfigurationProvider(createJourneyTransfigurationProvider(content));
    for (const regenerate of [false, true]) {
      const before: DraftState = { ...draft(), remainingCopiesByCard: regenerate ? {} : draft().remainingCopiesByCard,
        currentOffer: [...numbers], currentOfferCount: numbers.length, activeSiteId: SITE_ID, siteShownCardNumbers: [...numbers],
        currentOfferTransfigurations: { [numbers[0]]: "Kindled" as const }, openingDraftOffers: { 1: [...numbers] },
        transfiguredOfferSource: { siteId: SITE_ID, actionId: testExplorationActionId("retained-draft-form") } };
      const state = shopState([cardSlot({ cardNumber: numbers[0], basePrice: 1 })], { draftState: before, essence: 1000, dreamsigns: [sourceSign] }), saved = structuredClone(state);
      const out = reduceGameEvent(state, event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex: 0, expectedOffer: { purchaseCount: 0, rerollCount: 0 } }), ctx(), use);
      expect(out.outcome).toBe("applied"); expect(out.state.journey.draftState).not.toBeNull();
      expect({ ...out.state.journey.draftState, remainingCopiesByCard: null }).toEqual({ ...before, remainingCopiesByCard: null });
      expect(Object.values(out.state.journey.draftState!.remainingCopiesByCard).reduce((sum, n) => sum + n, 0)).toBe(numbers.length - 1);
      expect(state).toEqual(saved);
    }
  });
  it("rejects the dedicated method outside an actual purchased vacancy", () => {
    const { state, value } = input(); runtime(state).slots[0].purchased = false;
    expect(createSiteContentProvider(content).replacePurchasedShopSlot!(value)).toBeNull();
    expect(createSiteContentProvider(content).replacePurchasedShopSlot!({ ...value, slotIndex: -1 })).toBeNull();
    expect(createSiteContentProvider(content).replacePurchasedShopSlot!({ ...value, site: { ...value.site, type: "Essence" } })).toBeNull();
  });
});
