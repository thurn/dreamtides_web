// Appendix A §A3–A5 prices over synthetic cards: base value from energy, spark
// (Characters only), Fast and rarity multiplier and floor; the buy quote's
// band scaling and clamp; the sale quote's missing clamp; and the resale
// guard, which caps only copies bought for Essence.

import { describe, expect, it } from "vitest";
import { D97_SHOP } from "../../content/d97/shop";
import { parseCardId } from "../../types/card-identity";
import { parseD97OwnedCopyId } from "../../types/identifiers";
import type { D97OwnedCopy } from "../collection/types";
import { buyQuote, cardBaseValue, restockPrice, saleQuote, shopSlotCount, slotCeiling, type D97CardPriceFacts } from "./pricing";

const facts = (overrides: Partial<D97CardPriceFacts>): D97CardPriceFacts => ({
  energyCost: 2,
  spark: 1,
  character: true,
  fast: false,
  rarity: "Common",
  ...overrides,
});

function copy(channel: D97OwnedCopy["provenance"]["channel"], price?: number): D97OwnedCopy {
  return {
    copyId: parseD97OwnedCopyId("00000000-0000-4000-8000-0000000000c1"),
    cardId: parseCardId("00000000-0000-4000-8000-0000000000c2"),
    zone: "reserve",
    modifications: [],
    provenance: { channel, battleCount: 0, ...(price === undefined ? {} : { price }) },
  };
}

describe("cardBaseValue", () => {
  it("prices energy, a Character's spark, X costs and Fast", () => {
    expect(cardBaseValue(facts({}), D97_SHOP)).toBe(20 * 3 + 5);
    expect(cardBaseValue(facts({ character: false }), D97_SHOP)).toBe(60);
    expect(cardBaseValue(facts({ energyCost: null, spark: null }), D97_SHOP)).toBe(80);
    expect(cardBaseValue(facts({ character: false, fast: true }), D97_SHOP)).toBe(90);
  });

  it("applies the rarity multiplier, raised to the rarity floor", () => {
    expect(cardBaseValue(facts({ character: false, rarity: "Uncommon" }), D97_SHOP)).toBe(120);
    expect(cardBaseValue(facts({ character: false, energyCost: 0, rarity: "Uncommon" }), D97_SHOP)).toBe(100);
    expect(cardBaseValue(facts({ character: false, energyCost: 0, rarity: "Rare" }), D97_SHOP)).toBe(200);
  });
});

describe("quotes", () => {
  it("scales by band and clamps buy quotes but not sale quotes", () => {
    expect(buyQuote(65, 1, D97_SHOP)).toBe(5 * Math.floor((65 * 3) / 50));
    expect(buyQuote(1, 1, D97_SHOP)).toBe(D97_SHOP.minQuote);
    expect(buyQuote(100000, 1, D97_SHOP)).toBe(D97_SHOP.maxQuote);
    expect(saleQuote(copy("bundle"), 100000, 1, D97_SHOP)).toBe(5 * Math.floor((100000 * 3) / 50));
  });

  it("caps a copy bought for Essence at the Essence paid; other channels sell freely", () => {
    const quote = saleQuote(copy("bundle"), 200, 1, D97_SHOP);
    expect(quote).toBe(60);
    expect(saleQuote(copy("shop", 40), 200, 1, D97_SHOP)).toBe(40);
    expect(saleQuote(copy("shop", 500), 200, 1, D97_SHOP)).toBe(quote);
    for (const channel of ["starting", "bag", "ante", "bundle"] as const) {
      expect(saleQuote(copy(channel), 200, 1, D97_SHOP)).toBe(quote);
    }
  });

  it("sizes the shop and its restock by band, and cycles slot ceilings", () => {
    expect(shopSlotCount(1, D97_SHOP)).toBe(4);
    expect(restockPrice(1, D97_SHOP)).toBe(30);
    expect([0, 1, 2, 3, 4, 5].map((index) => slotCeiling(index, D97_SHOP))).toEqual([1, 2, 3, 1, 2, 3]);
  });
});
