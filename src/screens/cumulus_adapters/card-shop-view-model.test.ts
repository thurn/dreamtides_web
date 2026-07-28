import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../state/journey-context";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type { ShopSiteRuntime, SiteState } from "../../types/journey";
import {
  buildCardShopOffers,
  buildCardShopRestock,
  buildCardShopSiteView,
} from "./card-shop-view-model";

function makeCard(cardNumber: number, id: string): CardData {
  return {
    name: asCardName(`Fixture ${String(cardNumber)}`),
    id: asCardId(id),
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
  id: "shop-site",
  type: "Shop",
  isEnhanced: false,
  isVisited: false,
};

describe("buildCardShopOffers", () => {
  it("uses UUID-derived tile ids and resolves purchase availability after discounts", () => {
    const offers = buildCardShopOffers(runtime(), database(), 90, {
      essenceDiscountPercent: 10,
    });

    expect(
      offers.map((offer) => ({
        entryId: offer.entryId,
        slotIndex: offer.slotIndex,
        price: offer.price,
        state: offer.state,
      })),
    ).toEqual([
      {
        entryId: "shop-slot-0-card-uuid-a",
        slotIndex: 0,
        price: 70,
        state: "available",
      },
      {
        entryId: "shop-slot-1-card-uuid-b",
        slotIndex: 1,
        price: 180,
        state: "unaffordable",
      },
      {
        entryId: "shop-slot-2-card-uuid-c",
        slotIndex: 2,
        price: 45,
        state: "purchased",
      },
    ]);
  });
});

describe("buildCardShopRestock", () => {
  it("prices a normal restock and makes an enhanced restock free", () => {
    expect(buildCardShopRestock(runtime(), site, 100)).toMatchObject({
      price: 50,
      state: "available",
    });
    expect(
      buildCardShopRestock(runtime(), { ...site, isEnhanced: true }, 0),
    ).toMatchObject({ price: 0, state: "available" });
  });

  it("marks the one-use action spent after a restock", () => {
    expect(
      buildCardShopRestock({ ...runtime(), rerollCount: 1 }, site, 100).state,
    ).toBe("used");
  });
});

describe("buildCardShopSiteView", () => {
  it("builds Tobias, five-slot-compatible offers, and the shared HUD", () => {
    const state = { ...createDefaultState(), essence: 250 };
    const view = buildCardShopSiteView({
      state,
      sceneNode: null,
      site,
      runtime: runtime(),
      cardDatabase: database(),
      guide: {
        id: "fixture-tobias",
        name: "Tobias Fixture",
        homeDreamscapeId: "fixture-dream",
        siteType: "Shop",
        dialog: ["Browse a while."],
        homeSpecialty: "Fixture specialty.",
      },
      guideLine: "A chosen greeting.",
    });

    expect(view.siteId).toBe("shop-site");
    expect(view.guide).toMatchObject({
      id: "fixture-tobias",
      name: "Tobias Fixture",
      line: "A chosen greeting.",
    });
    expect(view.offers).toHaveLength(3);
  });
});
