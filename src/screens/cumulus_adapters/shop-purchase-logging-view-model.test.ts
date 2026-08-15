import { describe, expect, it } from "vitest";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { ShopModifiers, ShopSiteRuntime } from "../../types/journey";
import {
  buildShopPurchaseLogs,
  buildShopSiteEntryLog,
} from "./shop-purchase-logging-view-model";
import { parseSiteId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { testDreamsignId, testCardId, testExplorationActionId } from "../../types/test-identities";

const card: CardData = {
  id: testCardId("00000000-0000-4000-8000-000000000001"),
  name: parseCardName("Fixture Card"),
  cardNumber: 7,
  cardType: "Event",
  subtype: "",
  isStarter: false,
  energyCost: 1,
  spark: null,
  isFast: false,
  renderedText: "Draw a card.",
  imageNumber: 7,
  artOwned: true,
};

const source = {
  sourceSiteId: parseSiteId("00000000-0000-4000-8000-000000000002"),
  sourceActionId: testExplorationActionId("00000000-0000-4000-8000-000000000003"),
} as const;

const shopModifiers: ShopModifiers = {
  freeRerolls: 0,
  essenceDiscountPercent: 10,
  freeNextShopModifiers: [],
  freePurchaseModifiers: [
    {
      kind: "free-purchases",
      ...source,
      initialCount: 3,
      remainingCount: 2,
    },
  ],
};

function runtime(): ShopSiteRuntime {
  return {
    kind: "shop",
    slots: [
      {
        itemType: "card",
        cardNumber: card.cardNumber,
        basePrice: 100,
        discountPercent: 20,
        purchased: false,
      },
    ],
    rerollCount: 0,
    remainingDreamsignPoolIds: [],
    freePurchaseSource: source,
    purchaseHistory: [
      {
        eventSeq: 18,
        siteId: parseSiteId("shop-site"),
        slotIndex: 0,
        item: {
          kind: "card",
          cardNumber: card.cardNumber,
          gainedEntryId: parseDeckEntryId("deck-entry-uuid"),
        },
        priceBeforeFree: 70,
        pricePaid: 0,
        essenceBefore: 240,
        essenceAfter: 240,
        freeNextShopSource: source,
        freePurchaseModifier: {
          ...source,
          initialCount: 3,
          remainingBefore: 2,
          remainingAfter: 1,
        },
      },
    ],
  };
}

describe("shop purchase logging view model", () => {
  it("records reconstructable entry inventory, prices, and overlapping sources", () => {
    expect(
      buildShopSiteEntryLog(
        runtime(),
        shopModifiers,
        new Map([[card.cardNumber, card]]),
      ),
    ).toEqual({
      freeNextShopSource: source,
      freePurchaseModifiers: shopModifiers.freePurchaseModifiers,
      slots: [
        {
          slotIndex: 0,
          item: {
            kind: "card",
            cardId: card.id,
            cardNumber: card.cardNumber,
          },
          purchased: false,
          basePrice: 100,
          slotDiscountPercent: 20,
          essenceDiscountPercent: 10,
          priceBeforeFree: 70,
          finalPrice: 0,
        },
      ],
    });
  });

  it("resolves retained purchase receipts to canonical UUID identities", () => {
    expect(
      buildShopPurchaseLogs(
        runtime().purchaseHistory,
        new Map([[card.cardNumber, card]]),
      ),
    ).toEqual([
      {
        eventSeq: 18,
        siteId: parseSiteId("shop-site"),
        slotIndex: 0,
        item: {
          kind: "card",
          cardId: card.id,
          cardNumber: card.cardNumber,
          gainedEntryId: parseDeckEntryId("deck-entry-uuid"),
        },
        priceBeforeFree: 70,
        chargedPrice: 0,
        essenceBefore: 240,
        essenceAfter: 240,
        freeNextShopSource: source,
        freePurchaseModifier: {
          ...source,
          initialCount: 3,
          remainingBefore: 2,
          remainingAfter: 1,
        },
      },
    ]);
  });

  it("retains Dreamsign purchase and replacement UUIDs without display names", () => {
    const receipt = {
      eventSeq: 19,
      siteId: parseSiteId("bazaar-site"),
      slotIndex: 1,
      item: {
        kind: "dreamsign" as const,
        dreamsignId: testDreamsignId("dreamsign-gained-uuid"),
        replacedDreamsignId: testDreamsignId("dreamsign-replaced-uuid"),
      },
      priceBeforeFree: 180,
      pricePaid: 0,
      essenceBefore: 240,
      essenceAfter: 240,
      freePurchaseModifier: {
        ...source,
        initialCount: 3,
        remainingBefore: 1,
        remainingAfter: 0,
      },
    };

    expect(buildShopPurchaseLogs([receipt], new Map())).toEqual([
      {
        eventSeq: 19,
        siteId: parseSiteId("bazaar-site"),
        slotIndex: 1,
        item: {
          kind: "dreamsign",
          dreamsignId: testDreamsignId("dreamsign-gained-uuid"),
          replacedDreamsignId: testDreamsignId("dreamsign-replaced-uuid"),
        },
        priceBeforeFree: 180,
        chargedPrice: 0,
        essenceBefore: 240,
        essenceAfter: 240,
        freeNextShopSource: null,
        freePurchaseModifier: {
          ...source,
          initialCount: 3,
          remainingBefore: 1,
          remainingAfter: 0,
        },
      },
    ]);
  });
});
