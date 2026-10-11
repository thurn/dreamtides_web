import { describe, it, expect } from "vitest";
import {
  effectivePrice,
  runtimeSlotsToShopSlots,
  shopSlotsToRuntime,
} from "./shop-generator";
import { rerollCost } from "./shop-pricing";
import { parseCardName } from "../types/card-identity";
import { testDreamsignId } from "../types/test-identities";
import { ECONOMY, makeCard, makeDatabase } from "./shop-generator-test-fixtures";

describe("effectivePrice", () => {
  it("returns base price when no discount", () => {
    const result = effectivePrice({
      itemType: "card",
      card: null,
      dreamsign: null,
      basePrice: 100,
      discountPercent: 0,
      purchased: false,
    });
    expect(result).toBe(100);
  });

  it("applies discount percentage correctly", () => {
    const result = effectivePrice({
      itemType: "card",
      card: null,
      dreamsign: null,
      basePrice: 200,
      discountPercent: 50,
      purchased: false,
    });
    expect(result).toBe(100);
  });

  it("adds the permanent essence discount to card slot discounts", () => {
    const result = effectivePrice(
      {
        itemType: "card",
        card: null,
        dreamsign: null,
        basePrice: 100,
        discountPercent: 30,
        purchased: false,
      },
      { essenceDiscountPercent: 50 },
    );
    expect(result).toBe(20);
  });

  it("caps combined card discounts at free", () => {
    const result = effectivePrice(
      {
        itemType: "card",
        card: null,
        dreamsign: null,
        basePrice: 100,
        discountPercent: 70,
        purchased: false,
      },
      { essenceDiscountPercent: 50 },
    );
    expect(result).toBe(0);
  });

  it("applies the essence discount to Dreamsign prices", () => {
    const result = effectivePrice(
      {
        itemType: "dreamsign",
        card: null,
        dreamsign: {
          id: testDreamsignId("dreamsign-1"),
          name: "Dreamsign One",
          effectDescription: "First effect.",
        },
        basePrice: 50,
        discountPercent: 0,
        purchased: false,
      },
      { essenceDiscountPercent: 50 },
    );
    expect(result).toBe(25);
  });

  it("leaves free Dreamsign slots free", () => {
    const result = effectivePrice(
      {
        itemType: "dreamsign",
        card: null,
        dreamsign: {
          id: testDreamsignId("dreamsign-1"),
          name: "Dreamsign One",
          effectDescription: "First effect.",
        },
        basePrice: 0,
        discountPercent: 0,
        purchased: false,
      },
      {},
    );
    expect(result).toBe(0);
  });

  it("makes a purchase free after preserving ordinary discount pricing", () => {
    const slot = {
      itemType: "card" as const,
      card: null,
      dreamsign: null,
      basePrice: 200,
      discountPercent: 10,
      purchased: false,
    };
    expect(effectivePrice(slot, { essenceDiscountPercent: 15 })).toBe(150);
    expect(
      effectivePrice(slot, {
        essenceDiscountPercent: 15,
        freePurchase: true,
      }),
    ).toBe(0);
  });
});

describe("rerollCost", () => {
  it("costs essence for a regular shop", () => {
    expect(rerollCost(ECONOMY.shop.reroll, 0, false)).toBeGreaterThan(0);
  });

  it("is free for an enhanced shop", () => {
    expect(rerollCost(ECONOMY.shop.reroll, 0, true)).toBe(0);
  });
});

describe("shop runtime conversion", () => {
  it("round-trips card and Dreamsign slots", () => {
    const card = makeCard({ cardNumber: 7, name: parseCardName("Seven Bells") });
    const dreamsign = {
      id: testDreamsignId("dreamsign-1"),
      name: "Dreamsign One",
      effectDescription: "First effect.",
    };
    const slots = [
      {
        itemType: "card" as const,
        card,
        dreamsign: null,
        basePrice: 100,
        discountPercent: 30,
        purchased: false,
      },
      {
        itemType: "dreamsign" as const,
        card: null,
        dreamsign,
        basePrice: 2,
        discountPercent: 0,
        purchased: true,
      },
    ];

    const runtime = shopSlotsToRuntime(slots);

    expect(runtime).toEqual([
      {
        itemType: "card",
        cardNumber: 7,
        basePrice: 100,
        discountPercent: 30,
        purchased: false,
      },
      {
        itemType: "dreamsign",
        dreamsign,
        basePrice: 2,
        discountPercent: 0,
        purchased: true,
      },
    ]);
    expect(runtimeSlotsToShopSlots(runtime, makeDatabase([card]))).toEqual(
      slots,
    );
  });
});
