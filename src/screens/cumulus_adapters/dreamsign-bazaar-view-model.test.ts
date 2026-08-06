import { describe, expect, it } from "vitest";
import { createDefaultState } from "../../state/journey-context";
import { economyFixture } from "../../testing/economy-fixture";
import type { Dreamsign, ShopSiteRuntime, SiteState } from "../../types/journey";
import {
  buildDreamsignBazaarOffers,
  buildDreamsignBazaarRestock,
  buildDreamsignBazaarSiteView,
} from "./dreamsign-bazaar-view-model";

function sign(id: string, name: string): Dreamsign {
  return {
    id,
    name,
    imageName: `${id}.png`,
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
        dreamsign: sign("dreamsign-uuid-a", "Fixture Alpha"),
        basePrice: 100,
        discountPercent: 20,
        purchased: false,
      },
      {
        itemType: "dreamsign",
        dreamsign: sign("dreamsign-uuid-b", "Fixture Beta"),
        basePrice: 200,
        discountPercent: 0,
        purchased: false,
      },
      {
        itemType: "dreamsign",
        dreamsign: sign("dreamsign-uuid-c", "Fixture Gamma"),
        basePrice: 50,
        discountPercent: 0,
        purchased: true,
      },
    ],
    rerollCount: 0,
    remainingDreamsignPoolIds: [],
  };
}

const site: SiteState = {
  id: "dreamsign-bazaar-site",
  type: "DreamsignMarket",
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
        entryId: "shop-slot-0-dreamsign-uuid-a",
        slotIndex: 0,
        price: 70,
        state: "available",
        requiresReplacement: true,
      },
      {
        entryId: "shop-slot-1-dreamsign-uuid-b",
        slotIndex: 1,
        price: 180,
        state: "unaffordable",
        requiresReplacement: true,
      },
      {
        entryId: "shop-slot-2-dreamsign-uuid-c",
        slotIndex: 2,
        price: 45,
        state: "purchased",
        requiresReplacement: false,
      },
    ]);
  });
});

describe("buildDreamsignBazaarRestock", () => {
  it("prices a normal restock, makes an enhanced one free, and marks a used one", () => {
    expect(buildDreamsignBazaarRestock(economyFixture().shop.reroll, runtime(), site, 100)).toMatchObject({
      price: 50,
      state: "available",
    });
    expect(
      buildDreamsignBazaarRestock(economyFixture().shop.reroll, runtime(), { ...site, isEnhanced: true }, 0),
    ).toMatchObject({ price: 0, state: "available" });
    expect(
      buildDreamsignBazaarRestock(economyFixture().shop.reroll, { ...runtime(), rerollCount: 1 }, site, 100)
        .state,
    ).toBe("used");
  });

  it("keeps restock available until an injected visit limit is reached", () => {
    const config = { ...economyFixture().shop.reroll, maxPerVisit: 2 };
    expect(buildDreamsignBazaarRestock(config, { ...runtime(), rerollCount: 1 }, site, 100).state)
      .toBe("available");
    expect(buildDreamsignBazaarRestock(config, { ...runtime(), rerollCount: 2 }, site, 100).state)
      .toBe("used");
  });
});

describe("buildDreamsignBazaarSiteView", () => {
  it("builds Amunet, the Dreamsign shelf, and replacement state without production-data assertions", () => {
    const state = {
      ...createDefaultState(),
      essence: 250,
      maxDreamsigns: 1,
      dreamsigns: [sign("owned-uuid", "Owned Fixture")],
    };
    const pendingDreamsign = sign("pending-uuid", "Pending Fixture");
    const view = buildDreamsignBazaarSiteView({
      state,
      sceneNode: null,
      site,
      runtime: runtime(),
      guide: {
        id: "fixture-amunet",
        name: "Amunet Fixture",
        homeDreamscapeId: "fixture-dream",
        siteType: "DreamsignMarket",
        dialog: ["Choose carefully."],
        homeSpecialty: "Fixture specialty.",
      },
      guideLine: "A chosen greeting.",
      pendingDreamsign,
      economyData: economyFixture(),
    });

    expect(view.siteId).toBe("dreamsign-bazaar-site");
    expect(view.guide).toMatchObject({
      id: "fixture-amunet",
      name: "Amunet Fixture",
      line: "A chosen greeting.",
    });
    expect(view.offers).toHaveLength(3);
    expect(view.purge?.pendingDreamsign.id).toBe("pending-uuid");
  });
});
