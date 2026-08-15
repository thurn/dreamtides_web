import { assertLocalized, LocalizedString } from "@trox/runtime";
import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";

expect.addEqualityTesters([localizedStringSourceEquality]);
import { createDefaultState } from "../../state/journey-context";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { artRef } from "../../cumulus/primitives/art";
import { economyFixture } from "../../testing/economy-fixture";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { MINIMAL_SITES_DATA } from "../../__test-helpers__/atlas-fixtures";
import type { ShopSiteRuntime, SiteState } from "../../types/journey";
import {
  buildCardShopOffers,
  buildCardShopRestock,
  buildCardShopSiteView,
  buildCardShopTransfiguredOfferLog,
} from "./card-shop-view-model";
import { parseSiteId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import {
  testCardId,
  testDreamscapeId,
  testExplorationActionId,
  testGuideId,
} from "../../types/test-identities";

function makeCard(cardNumber: number, idSeed: string): CardData {
  return {
    name: parseCardName(`Fixture ${String(cardNumber)}`),
    id: testCardId(idSeed),
    cardNumber,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function runtime(): ShopSiteRuntime {
  return {
    kind: "shop",
    slots: [
      {
        itemType: "card",
        cardNumber: 1,
        basePrice: 100,
        discountPercent: 20,
        purchased: false,
      },
      {
        itemType: "card",
        cardNumber: 2,
        basePrice: 200,
        discountPercent: 0,
        purchased: false,
      },
      {
        itemType: "card",
        cardNumber: 3,
        basePrice: 50,
        discountPercent: 0,
        purchased: true,
      },
    ],
    rerollCount: 0,
    remainingDreamsignPoolIds: [],
    purchaseHistory: [],
  };
}

function database(): Map<number, CardData> {
  return new Map([
    [1, makeCard(1, "card-uuid-a")],
    [2, makeCard(2, "card-uuid-b")],
    [3, makeCard(3, "card-uuid-c")],
  ]);
}

const site: SiteState = {
  id: parseSiteId("shop-site"),
  type: "Shop",
  isEnhanced: false,
  isVisited: false,
};

describe("buildCardShopOffers", () => {
  it("uses UUID-derived tile ids and resolves purchase availability after discounts", () => {
    const cardDatabase = database();
    const offers = buildCardShopOffers(
      transfigurationFixture(),
      runtime(),
      cardDatabase,
      90,
      {
        essenceDiscountPercent: 10,
      },
    );
    const cardA = cardDatabase.get(1);
    const cardB = cardDatabase.get(2);
    const cardC = cardDatabase.get(3);
    if (cardA === undefined || cardB === undefined || cardC === undefined) {
      throw new Error("Expected three card-shop fixture cards");
    }

    expect(
      offers.map((offer) => ({
        entryId: offer.entryId,
        slotIndex: offer.slotIndex,
        price: offer.price,
        state: offer.state,
      })),
    ).toEqual([
      {
        entryId: parseDeckEntryId(`shop-slot-0-${cardA.id}`),
        slotIndex: 0,
        price: 70,
        state: "available",
      },
      {
        entryId: parseDeckEntryId(`shop-slot-1-${cardB.id}`),
        slotIndex: 1,
        price: 180,
        state: "unaffordable",
      },
      {
        entryId: parseDeckEntryId(`shop-slot-2-${cardC.id}`),
        slotIndex: 2,
        price: 45,
        state: "purchased",
      },
    ]);
  });

  it("renders and logs the exact transfiguration persisted on a Shop slot", () => {
    const transfiguredRuntime: ShopSiteRuntime = {
      ...runtime(),
      slots: runtime().slots.map((slot, index) =>
        slot.itemType === "card" && index === 0
          ? { ...slot, transfiguration: "Empowered" }
          : slot,
      ),
    };
    const offers = buildCardShopOffers(
      transfigurationFixture(),
      transfiguredRuntime,
      database(),
      500,
      {
        essenceDiscountPercent: 0,
      },
    );
    expect(offers[0]?.model.transfiguration?.type).toBe("Empowered");
    expect(
      buildCardShopTransfiguredOfferLog(
        {
          presentation: {
            kind: "shop",
            title: assertLocalized("Shop"),
            restocked: assertLocalized("Restocked"),
            restockOffersAction: assertLocalized("Restock Offers"),
            restockAction: assertLocalized("Restock"),
            freePrice: assertLocalized("Free"),
          },
          siteId: parseSiteId("shop-site"),
          scene: null,
          guide: {
            id: testGuideId("guide"),
            name: assertLocalized("Guide"),
            line: assertLocalized("Line"),
            art: artRef.dreamGuide(testGuideId("guide")),
          },
          offers,
          restock: {
            entryId: parseDeckEntryId("restock"),
            price: 0,
            state: "available",
          },
          freePurchaseStatus: {
            freeNextShopSource: null,
            freePurchasesRemaining: 0,
          },
        },
        {
          siteId: parseSiteId("exploration-site"),
          actionId: testExplorationActionId("exploration-action"),
        },
      ),
    ).toMatchObject({
      sourceSiteId: parseSiteId("exploration-site"),
      sourceActionId: testExplorationActionId("exploration-action"),
      cards: [
        {
          cardId: testCardId("card-uuid-a"),
          slotIndex: 0,
          transfiguration: "Empowered",
        },
      ],
    });
  });
});

describe("buildCardShopRestock", () => {
  it("prices a normal restock and makes an enhanced restock free", () => {
    expect(
      buildCardShopRestock(economyFixture().shop.reroll, runtime(), site, 100),
    ).toMatchObject({
      price: 50,
      state: "available",
    });
    expect(
      buildCardShopRestock(
        economyFixture().shop.reroll,
        runtime(),
        { ...site, isEnhanced: true },
        0,
      ),
    ).toMatchObject({ price: 0, state: "available" });
  });

  it("marks the one-use action spent after a restock", () => {
    expect(
      buildCardShopRestock(
        economyFixture().shop.reroll,
        { ...runtime(), rerollCount: 1 },
        site,
        100,
      ).state,
    ).toBe("used");
  });

  it("keeps restock available until an injected visit limit is reached", () => {
    const config = { ...economyFixture().shop.reroll, maxPerVisit: 2 };
    expect(
      buildCardShopRestock(config, { ...runtime(), rerollCount: 1 }, site, 100)
        .state,
    ).toBe("available");
    expect(
      buildCardShopRestock(config, { ...runtime(), rerollCount: 2 }, site, 100)
        .state,
    ).toBe("used");
  });
});

describe("buildCardShopSiteView", () => {
  it("builds Tobias, five-slot-compatible offers, and the shared HUD", () => {
    const state = { ...createDefaultState(), essence: 250 };
    const guideId = testGuideId("fixture-tobias");
    const view = buildCardShopSiteView({
      state,
      sceneNode: null,
      site,
      runtime: runtime(),
      cardDatabase: database(),
      guide: {
        id: guideId,
        name: "Tobias Fixture",
        homeDreamscapeId: testDreamscapeId("fixture-dream"),
        siteType: "Shop",
        portraitSource: "fixture-guide.png",
        dialogue: { site: ["Browse a while."] },
        homeSpecialty: "Fixture specialty.",
      },
      guideLine: assertLocalized("A chosen greeting."),
      economyData: economyFixture(),
      transfigurationData: transfigurationFixture(),
      sitesData: MINIMAL_SITES_DATA,
    });

    expect(view.siteId).toBe(site.id);
    expect(view.guide).toMatchObject({
      id: guideId,
    });
    expect(view.guide.name).toBeInstanceOf(LocalizedString);
    expect(view.guide.line).toBeInstanceOf(LocalizedString);
    expect(view.offers).toHaveLength(3);
  });

  it("projects overlapping Exploration benefits into zero-price offers and status", () => {
    const state = {
      ...createDefaultState(),
      essence: 0,
      shopModifiers: {
        ...createDefaultState().shopModifiers,
        freePurchaseModifiers: [
          {
            kind: "free-purchases" as const,
            sourceSiteId: parseSiteId("exploration-counted"),
            sourceActionId: testExplorationActionId("counted-action"),
            initialCount: 3,
            remainingCount: 2,
          },
        ],
      },
    };
    const view = buildCardShopSiteView({
      state,
      sceneNode: null,
      site,
      runtime: {
        ...runtime(),
        freePurchaseSource: {
          sourceSiteId: parseSiteId("exploration-visit"),
          sourceActionId: testExplorationActionId("visit-action"),
        },
      },
      cardDatabase: database(),
      guide: {
        id: testGuideId("fixture-tobias"),
        name: "Tobias Fixture",
        homeDreamscapeId: testDreamscapeId("fixture-dream"),
        siteType: "Shop",
        portraitSource: "fixture-guide.png",
        dialogue: { site: ["Browse a while."] },
        homeSpecialty: "Fixture specialty.",
      },
      guideLine: assertLocalized("A chosen greeting."),
      economyData: economyFixture(),
      transfigurationData: transfigurationFixture(),
      sitesData: MINIMAL_SITES_DATA,
    });

    expect(view.offers.map((offer) => offer.price)).toEqual([0, 0, 0]);
    expect(
      view.offers.slice(0, 2).every((offer) => offer.state === "available"),
    ).toBe(true);
    expect(view.freePurchaseStatus).toEqual({
      freeNextShopSource: {
        sourceSiteId: parseSiteId("exploration-visit"),
        sourceActionId: testExplorationActionId("visit-action"),
      },
      freePurchasesRemaining: 2,
    });
    expect(view.restock.price).toBeGreaterThan(0);
  });
});
