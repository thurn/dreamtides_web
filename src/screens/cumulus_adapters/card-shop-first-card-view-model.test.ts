import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { makeAuguryTestCard } from "../../journey_v2/testing/fixtures";
import { economyFixture } from "../../testing/economy-fixture";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { parseCardName, parseCardSubtype } from "../../types/card-identity";
import { testCardId, testDreamsignId, testExplorationActionId, testGuideId, testGuideArtKey, testDreamscapeId } from "../../types/test-identities";
import type { ShopSiteRuntime } from "../../types/journey";
import { journeyShop, shopCardPurchaseQuote } from "../../rules/journey/journey-shop";
import { createJourneyModifierRegistry } from "../../rules/journey/modifier-registry";
import { registerJourneyTransfigurationProvider } from "../../rules/journey/journey-transfiguration";
import { reduceGameEvent } from "../../rules/reducer";
import { cardSlot, shopState, makeSite, shopModifiers, SITE_ID, ctx } from "../../rules/journey/shop-fixtures";
import { event } from "../../rules/journey/lifecycle-fixtures";
import { buildCardShopOffers, buildCardShopSiteView } from "./card-shop-view-model";

const A = testDreamsignId("offer-first-a"), B = testDreamsignId("offer-first-b"), OTHER = testDreamsignId("offer-other");
const registry = createJourneyModifierRegistry([journeyShop(A, { kind: "firstCardPurchase", discountPercent: 19 }), journeyShop(B, { kind: "firstCardPurchase", discountPercent: 31 })]);
const card = makeAuguryTestCard({ id: testCardId("first-offer"), cardNumber: 7, name: parseCardName("Same fixture name") });
const database = new Map([[7, card]]), forms = transfigurationFixture();
beforeEach(() => registerJourneyTransfigurationProvider({ resolve: () => ({ cardId: card.id, cardType: "Character", subtype: parseCardSubtype("Warrior"), forms: [] }) }));
afterEach(clearGameProviders);

describe("Card Shop live first-card offers", () => {
  it("uses the same live quote and exact payment for each available offer across source, free and ordinal states", () => {
    for (const enhanced of [false, true]) for (const held of [[], [OTHER], [A], [A, A], [A, B, A, B]])
      for (const prior of [false, true]) for (const free of [false, true]) for (const essence of [0, 20, 100]) {
        const initial = shopState([cardSlot({ basePrice: 37, discountPercent: 13 }), cardSlot({ basePrice: 23 })], {
          essence, dreamsigns: held.map((id) => ({ id, name: "Same fixture name", effectDescription: "" })),
          shopModifiers: shopModifiers({ essenceDiscountPercent: 9, freePurchaseModifiers: free ? [{ kind: "free-purchases", initialCount: 1, remainingCount: 1, sourceSiteId: SITE_ID, sourceActionId: testExplorationActionId("offer-free") }] : [] }),
        });
        const runtime = initial.journey.siteRuntime[SITE_ID] as ShopSiteRuntime, site = makeSite("Shop", { isEnhanced: enhanced });
        Object.values(initial.journey.atlas.nodes)[0].sites[0] = site;
        if (prior) runtime.purchaseHistory = [{ eventSeq: 1, siteId: SITE_ID, slotIndex: 9,
          item: { kind: "card", cardNumber: 7, gainedEntryId: buildCardShopOffers(forms, runtime, database, 100, {})[0].entryId },
          priceBeforeFree: 1, pricePaid: 1, essenceBefore: 2, essenceAfter: 1 }];
        const view = buildCardShopOffers(forms, runtime, database, essence, {}, { journey: initial.journey, site, registry });
        const saved = structuredClone(initial);
        view.forEach((offer, slotIndex) => {
          const quote = shopCardPurchaseQuote(initial.journey, runtime, site, runtime.slots[slotIndex], registry);
          const totalDiscount = 13 * Number(slotIndex === 0) + 9 + (prior ? 0 : held.reduce((sum, id) => sum + (id === A ? 19 : id === B ? 31 : 0), 0));
          const expected = free ? 0 : Math.round((slotIndex === 0 ? 37 : 23) * (1 - Math.min(100, totalDiscount) / 100));
          expect(offer.price).toBe(expected); expect(offer.price).toBe(quote.pricePaid);
          expect(offer.state).toBe(expected <= essence ? "available" : "unaffordable");
          const out = reduceGameEvent(initial, event("BUY_SHOP_SLOT", { siteId: SITE_ID, slotIndex }), ctx(), registry);
          if (offer.state === "available") {
            expect(out.outcome).toBe("applied"); expect(out.state.journey.essence).toBe(essence - offer.price);
            const receipts = (out.state.journey.siteRuntime[SITE_ID] as ShopSiteRuntime).purchaseHistory;
            expect(receipts[receipts.length - 1].pricePaid).toBe(offer.price);
          } else expect(out.state).toBe(initial);
        });
        expect(initial).toEqual(saved);
      }
  });
  it("preserves the optional legacy price contract, purchased state and preformed display", () => {
    const state = shopState([cardSlot({ basePrice: 37, discountPercent: 13, transfiguration: "Empowered" }), cardSlot({ purchased: true })]);
    const runtime = state.journey.siteRuntime[SITE_ID] as ShopSiteRuntime;
    const offers = buildCardShopOffers(forms, runtime, database, 25, { essenceDiscountPercent: 9 });
    expect(offers[0]).toMatchObject({ price: 29, state: "unaffordable", model: { transfiguration: { type: "Empowered" } } });
    expect(offers[1].state).toBe("purchased");
    expect(buildCardShopOffers(forms, runtime, database, 0, { freePurchase: true })[0]).toMatchObject({ price: 0, state: "available" });
    expect(buildCardShopOffers(forms, runtime, new Map(), 100, {})).toEqual([]);
  });
  it("plumbs live first-card holdings into the complete production view builder", () => {
    const state = shopState([cardSlot({ basePrice: 37, discountPercent: 13 })], { essence: 25,
      dreamsigns: [{ id: A, name: "Same fixture name", effectDescription: "" }] });
    const runtime = state.journey.siteRuntime[SITE_ID] as ShopSiteRuntime;
    const params = { state: state.journey, scene: null, site: makeSite("Shop"), runtime, cardDatabase: database,
      guide: { id: testGuideId("first-offer-guide"), name: "Fixture", homeDreamscapeId: testDreamscapeId("first-offer-dream"), siteType: "Shop" as const,
        portraitSource: "fixture.png", artKey: testGuideArtKey("first-offer-guide"), headTargetX: .5, dialogue: { site: [] }, homeSpecialty: "" },
      guideLine: "", economyData: economyFixture(), transfigurationData: forms, sitesData: MINIMAL_SITES_DATA };
    expect(buildCardShopSiteView({ ...params, registry }).offers[0]).toMatchObject({ price: 25, state: "available" });
    expect(buildCardShopSiteView(params).offers[0]).toMatchObject({ price: 32, state: "unaffordable" });
  });
});
