import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import { createDefaultState } from "../../state/journey-context";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { artRef } from "../../cumulus/primitives/art";
import { economyFixture } from "../../testing/economy-fixture";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { MINIMAL_SITES_DATA } from "../../testing/atlas-fixtures";
import type {
  ShopSiteRuntime,
  SiteState,
  Dreamsign,
} from "../../types/journey";
import {
  buildCardShopOffers,
  buildCardShopRestock,
  buildCardShopSiteView,
  buildCardShopTransfiguredOfferLog,
} from "./card-shop-view-model";
import { parseSiteId, parseDeckEntryId } from "../../types/identifiers";
import {
  testCardId,
  testDreamscapeId,
  testExplorationActionId,
  testGuideId,
  testDreamsignId,
} from "../../types/test-identities";
import {
  buildDreamsignBazaarOffers,
  buildDreamsignBazaarSiteView,
} from "./dreamsign-bazaar-view-model";

describe("card-shop-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

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
              title: "Shop",
              restocked: "Restocked",
              restockOffersAction: "Restock Offers",
              restockAction: "Restock",
              freePrice: "Free",
            },
            siteId: parseSiteId("shop-site"),
            scene: null,
            guide: {
              id: testGuideId("guide"),
              name: "Guide",
              line: "Line",
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
        buildCardShopRestock(
          economyFixture().shop.reroll,
          runtime(),
          site,
          100,
        ),
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
  });

  describe("buildCardShopSiteView", () => {
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
        guideLine: "A chosen greeting.",
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
});

describe("dreamsign-bazaar-view-model", () => {
  expect.addEqualityTesters([annotatedTextEquality]);

  function sign(idSeed: string, name: string): Dreamsign {
    return {
      id: testDreamsignId(idSeed),
      name,
      imageName: `${idSeed}.png`,
      imageAlt: `${name} fixture art`,
      effectDescription: "Draw a card.",
    };
  }

  function runtime(): ShopSiteRuntime {
    return {
      kind: "shop",
      slots: [
        {
          itemType: "dreamsign",
          dreamsign: {
            ...sign("dreamsign-uuid-a", "Fixture Alpha"),
            id: OFFER_A_ID,
          },
          basePrice: 100,
          discountPercent: 20,
          purchased: false,
        },
        {
          itemType: "dreamsign",
          dreamsign: {
            ...sign("dreamsign-uuid-b", "Fixture Beta"),
            id: OFFER_B_ID,
          },
          basePrice: 200,
          discountPercent: 0,
          purchased: false,
        },
        {
          itemType: "dreamsign",
          dreamsign: {
            ...sign("dreamsign-uuid-c", "Fixture Gamma"),
            id: OFFER_C_ID,
          },
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

  const site: SiteState = {
    id: parseSiteId("dreamsign-bazaar-site"),
    type: "DreamsignBazaar",
    isEnhanced: false,
    isVisited: false,
  };

  describe("buildDreamsignBazaarOffers", () => {
    it("keys offers by Dreamsign UUID and resolves price, affordability, and cap replacement", () => {
      const offers = buildDreamsignBazaarOffers(
        runtime(),
        {
          essence: 90,
          dreamsigns: [sign("owned-uuid", "Owned Fixture")],
          maxDreamsigns: 1,
        },
        { essenceDiscountPercent: 10 },
      );

      expect(
        offers.map((offer) => ({
          entryId: offer.entryId,
          slotIndex: offer.slotIndex,
          price: offer.price,
          state: offer.state,
          requiresReplacement: offer.requiresReplacement,
        })),
      ).toEqual([
        {
          entryId: offerEntryId(0, OFFER_A_ID),
          slotIndex: 0,
          price: 70,
          state: "available",
          requiresReplacement: true,
        },
        {
          entryId: offerEntryId(1, OFFER_B_ID),
          slotIndex: 1,
          price: 180,
          state: "unaffordable",
          requiresReplacement: true,
        },
        {
          entryId: offerEntryId(2, OFFER_C_ID),
          slotIndex: 2,
          price: 45,
          state: "purchased",
          requiresReplacement: false,
        },
      ]);
    });
  });

  describe("buildDreamsignBazaarSiteView", () => {
    it("uses counted free purchases for Bazaar wares while preserving reroll pricing", () => {
      const state = {
        ...createDefaultState(),
        essence: 0,
        shopModifiers: {
          ...createDefaultState().shopModifiers,
          freePurchaseModifiers: [
            {
              kind: "free-purchases" as const,
              sourceSiteId: parseSiteId("exploration-site"),
              sourceActionId: testExplorationActionId("exploration-action"),
              initialCount: 4,
              remainingCount: 3,
            },
          ],
        },
      };
      const view = buildDreamsignBazaarSiteView({
        state,
        sceneNode: null,
        site,
        runtime: runtime(),
        guide: {
          id: testGuideId("fixture-amunet"),
          name: "Amunet Fixture",
          homeDreamscapeId: testDreamscapeId("fixture-dream"),
          siteType: "DreamsignBazaar",
          portraitSource: "fixture-guide.png",
          dialogue: { site: ["Choose carefully."] },
          homeSpecialty: "Fixture specialty.",
        },
        guideLine: "A chosen greeting.",
        pendingDreamsign: null,
        economyData: economyFixture(),
        sitesData: MINIMAL_SITES_DATA,
      });

      expect(view.offers.map((offer) => offer.price)).toEqual([0, 0, 0]);
      expect(view.freePurchaseStatus).toEqual({
        freeNextShopSource: null,
        freePurchasesRemaining: 3,
      });
      expect(view.restock.price).toBeGreaterThan(0);
    });
  });

  const OFFER_A_ID = testDreamsignId("dreamsign-uuid-a");

  const OFFER_B_ID = testDreamsignId("dreamsign-uuid-b");

  const OFFER_C_ID = testDreamsignId("dreamsign-uuid-c");

  function offerEntryId(slotIndex: number, dreamsignId: Dreamsign["id"]) {
    return parseDeckEntryId(`shop-slot-${String(slotIndex)}-${dreamsignId}`);
  }
});
