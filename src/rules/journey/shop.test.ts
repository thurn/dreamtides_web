import { afterEach, describe, expect, it } from "vitest";
import type { ShopSiteRuntime } from "../../types/journey";
import { registerSiteContentProvider } from "./sites";
import { registerDeckContentProvider } from "./deck";
import { parseSiteId } from "../../types/identifiers";
import { testDreamsignId, testExplorationActionId } from "../../types/test-identities";
import { SITE_ID, ctx, reduce, cardSlot, dreamsignSlot, shopRuntime, shopModifiers, shopState, rerollProvider } from "./shop-fixtures";



afterEach(() => {
  registerSiteContentProvider(null);
  registerDeckContentProvider(null);
});


// ---------------------------------------------------------------------------
// BUY_SHOP_SLOT
// ---------------------------------------------------------------------------

describe("BUY_SHOP_SLOT", () => {
  it("bounces when the price exceeds current essence, leaving essence unchanged", () => {
    const state = shopState([cardSlot({ basePrice: 100 })], { essence: 50 });
    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(result.outcome).toBe("bounced");
    expect(result.state.journey.essence).toBe(50);
    expect(result.state.journey.deck).toHaveLength(0);
  });

  it("buys a card slot: charges the price, adds the card, marks the slot purchased", () => {
    const state = shopState([cardSlot({ basePrice: 100, cardNumber: 9 })], {
      essence: 300,
    });
    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.essence).toBe(200);
    expect(result.state.journey.deck).toHaveLength(1);
    expect(result.state.journey.deck[0].cardNumber).toBe(9);
    const runtime = result.state.journey.siteRuntime[
      SITE_ID
    ] as ShopSiteRuntime;
    expect(runtime.slots[0].purchased).toBe(true);
  });

  it("preserves a persisted Shop-slot transfiguration on the purchased entry", () => {
    const state = shopState(
      [cardSlot({ cardNumber: 9, transfiguration: "Empowered" })],
      { essence: 300 },
    );
    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.deck).toMatchObject([
      { cardNumber: 9, transfiguration: "Empowered" },
    ]);
  });

  it("charges the discounted price when a slot and shop discount both apply", () => {
    const basePrice = 200;
    const slotDiscount = 10;
    const shopDiscount = 15;
    // ShopModifiers contract: additive discount, clamped to 100, applied as a
    // round(basePrice * (1 - pct/100)) essence charge.
    const expectedPrice = Math.round(
      basePrice * (1 - (slotDiscount + shopDiscount) / 100),
    );
    const state = shopState(
      [cardSlot({ basePrice, discountPercent: slotDiscount })],
      {
        essence: 300,
        shopModifiers: shopModifiers({
          essenceDiscountPercent: shopDiscount,
        }),
      },
    );
    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.essence).toBe(300 - expectedPrice);
  });

  it("keeps a bound Card Shop free across paid rerolls and persists every receipt", () => {
    registerSiteContentProvider(rerollProvider);
    const freePurchaseSource = {
      sourceSiteId: parseSiteId("exploration-free-shop"),
      sourceActionId: testExplorationActionId("action-free-shop"),
    };
    const state = shopState([cardSlot({ cardNumber: 9 })], {
      essence: 300,
      siteRuntime: {
        [SITE_ID]: {
          ...shopRuntime([cardSlot({ cardNumber: 9 })]),
          freePurchaseSource,
        },
      },
    });

    const first = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
    });
    const rerolled = reduce(
      first.state,
      "REROLL_SHOP",
      { siteId: SITE_ID },
      ctx({ seq: 43 }),
    );
    const second = reduce(
      rerolled.state,
      "BUY_SHOP_SLOT",
      {
        siteId: SITE_ID,
        slotIndex: 0,
      },
      ctx({ seq: 44 }),
    );

    expect(first.outcome).toBe("applied");
    expect(first.state.journey.essence).toBe(300);
    expect(rerolled.outcome).toBe("applied");
    expect(rerolled.state.journey.essence).toBe(250);
    expect(second.outcome).toBe("applied");
    expect(second.state.journey.essence).toBe(250);
    const runtime = second.state.journey.siteRuntime[SITE_ID];
    expect(runtime).toMatchObject({
      kind: "shop",
      freePurchaseSource,
      purchaseHistory: [
        {
          eventSeq: 42,
          siteId: SITE_ID,
          slotIndex: 0,
          item: { kind: "card", cardNumber: 9 },
          priceBeforeFree: 100,
          pricePaid: 0,
          essenceBefore: 300,
          essenceAfter: 300,
          freeNextShopSource: freePurchaseSource,
        },
        {
          eventSeq: 44,
          siteId: SITE_ID,
          slotIndex: 0,
          pricePaid: 0,
          essenceBefore: 250,
          essenceAfter: 250,
          freeNextShopSource: freePurchaseSource,
        },
      ],
    });
  });

  it("consumes a T82 purchase at a Dreamsign Bazaar and records replacement identity", () => {
    const modifier = {
      kind: "free-purchases" as const,
      sourceSiteId: parseSiteId("exploration-site"),
      sourceActionId: testExplorationActionId("free-bazaar-action"),
      initialCount: 1,
      remainingCount: 1,
    };
    const state = shopState(
      [dreamsignSlot("offered-dreamsign")],
      {
        essence: 0,
        maxDreamsigns: 1,
        dreamsigns: [
          {
            id: testDreamsignId("replaced-dreamsign"),
            name: "Replaced",
            effectDescription: "Replaced effect",
          },
        ],
        shopModifiers: shopModifiers({ freePurchaseModifiers: [modifier] }),
      },
      "DreamsignBazaar",
    );

    const result = reduce(state, "BUY_SHOP_SLOT", {
      siteId: SITE_ID,
      slotIndex: 0,
      purgeIndex: 0,
    });

    expect(result.outcome).toBe("applied");
    expect(result.state.journey.shopModifiers.freePurchaseModifiers).toEqual(
      [],
    );
    expect(result.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      kind: "shop",
      purchaseHistory: [
        {
          item: {
            kind: "dreamsign",
            dreamsignId: testDreamsignId("offered-dreamsign"),
            replacedDreamsignId: testDreamsignId("replaced-dreamsign"),
          },
          priceBeforeFree: 100,
          pricePaid: 0,
          essenceBefore: 0,
          essenceAfter: 0,
          freePurchaseModifier: {
            sourceActionId: testExplorationActionId("free-bazaar-action"),
            remainingBefore: 1,
            remainingAfter: 0,
          },
        },
      ],
    });
  });
});


// ---------------------------------------------------------------------------
// REROLL_SHOP
// ---------------------------------------------------------------------------

describe("REROLL_SHOP", () => {

  it("consumes a free reroll before charging essence (order)", () => {
    registerSiteContentProvider(rerollProvider);
    const state = shopState([cardSlot()], {
      essence: 300,
      shopModifiers: shopModifiers({ freeRerolls: 1 }),
    });
    const result = reduce(state, "REROLL_SHOP", { siteId: SITE_ID });
    expect(result.outcome).toBe("applied");
    // Free reroll consumed first; essence untouched.
    expect(result.state.journey.shopModifiers.freeRerolls).toBe(0);
    expect(result.state.journey.essence).toBe(300);
    const runtime = result.state.journey.siteRuntime[
      SITE_ID
    ] as ShopSiteRuntime;
    expect(runtime.rerollCount).toBe(1);
  });

  it("charges essence when no free reroll is available", () => {
    registerSiteContentProvider(rerollProvider);
    const cost = 50;
    const state = shopState([cardSlot()], {
      essence: 300,
      shopModifiers: shopModifiers(),
    });
    const result = reduce(state, "REROLL_SHOP", { siteId: SITE_ID });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.shopModifiers.freeRerolls).toBe(0);
    expect(result.state.journey.essence).toBe(300 - cost);
  });
});
