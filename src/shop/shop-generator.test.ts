import { describe, it, expect } from "vitest";
import { getLogEntries, resetLog } from "../logging";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { PoolDraftState } from "../types/draft";
import {
  generateShopInventory as generateShopInventoryRaw,
  effectivePrice,
  runtimeSlotsToShopSlots,
  shopSlotsToRuntime,
  type ShopGenerationOptions,
} from "./shop-generator";
import { rerollCost } from "./shop-pricing";
import { asCardId, asCardName } from "../types/card-identity";
import { economyFixture } from "../testing/economy-fixture";
import { asDreamsignId } from "../types/identifiers";

const ECONOMY = economyFixture();
function generateShopInventory(
  options: Omit<ShopGenerationOptions, "economy">,
) {
  return generateShopInventoryRaw({ ...options, economy: ECONOMY.shop });
}

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Test Card"),
    id: asCardId("test-id"),
    cardNumber: 1,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 1,
    isFast: false,
    renderedText: "Test text",
    imageNumber: 1,
    artOwned: false,
    ...overrides,
  };
}

function makeDatabase(cards: CardData[]): Map<number, CardData> {
  const db = new Map<number, CardData>();
  for (const card of cards) {
    db.set(card.cardNumber, card);
  }
  return db;
}

function makeDraftState(copies: Record<number, number>): PoolDraftState {
  const draftPoolCopiesByCard: Record<string, number> = {};
  for (const [cardNumber, count] of Object.entries(copies)) {
    draftPoolCopiesByCard[cardNumber] = count;
  }
  return {
    mode: "tides4",
    draftPoolCopiesByCard,
    remainingCopiesByCard: { ...draftPoolCopiesByCard },
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
  };
}

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: asDreamsignId("dreamsign-1"),
    name: "Dreamsign One",
    effectDescription: "First effect.",
  },
  {
    id: asDreamsignId("dreamsign-2"),
    name: "Dreamsign Two",
    effectDescription: "Second effect.",
  },
];

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
          id: asDreamsignId("dreamsign-1"),
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
          id: asDreamsignId("dreamsign-1"),
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
    const card = makeCard({ cardNumber: 7, name: asCardName("Seven Bells") });
    const dreamsign = {
      id: asDreamsignId("dreamsign-1"),
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

describe("generateShopInventory", () => {
  const db = makeDatabase([
    makeCard({ cardNumber: 1 }),
    makeCard({ cardNumber: 2 }),
    makeCard({ cardNumber: 3 }),
    makeCard({ cardNumber: 4 }),
    makeCard({ cardNumber: 5 }),
  ]);

  it("samples the injected weighted discount distributions", () => {
    const economy = structuredClone(ECONOMY.shop);
    economy.discounts.slotCounts = [{ value: 3, weight: 1 }];
    economy.discounts.percentages = [{ value: 77, weight: 1 }];
    const result = generateShopInventoryRaw({
      economy,
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1 }),
      remainingDreamsignPoolIds: [],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      cardCount: 3,
      rng: () => 0,
    });

    expect(result.slots).toHaveLength(3);
    expect(result.slots.map((slot) => slot.discountPercent)).toEqual([
      77, 77, 77,
    ]);
  });

  it("generates a Card Shop of card slots with no dreamsigns by default", () => {
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }),
      remainingDreamsignPoolIds: [
        asDreamsignId("dreamsign-1"),
        asDreamsignId("dreamsign-2"),
      ],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
    });
    const cardSlots = result.slots.filter((slot) => slot.itemType === "card");
    const dreamsignSlots = result.slots.filter(
      (slot) => slot.itemType === "dreamsign",
    );
    expect(cardSlots.length).toBeGreaterThan(0);
    // A Card Shop never offers dreamsigns; those are sold at the Dreamsign
    // Bazaar, which requests dreamsign slots explicitly.
    expect(dreamsignSlots).toHaveLength(0);
  });

  it("draws shop cards from and spends them against the draft pool", () => {
    const draftState = makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
    const result = generateShopInventory({
      cardDatabase: db,
      draftState,
      remainingDreamsignPoolIds: [],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
    });
    const drawnCardNumbers = result.slots
      .filter((slot) => slot.itemType === "card" && slot.card !== null)
      .map((slot) => slot.card!.cardNumber);
    expect(drawnCardNumbers.length).toBeGreaterThan(0);
    // Spent cards were removed from the returned draft state.
    const resultPoolState = result.draftState;
    for (const cardNumber of drawnCardNumbers) {
      expect(
        resultPoolState?.remainingCopiesByCard[String(cardNumber)],
      ).toBeUndefined();
    }
    // The original draft state is not mutated.
    expect(Object.keys(draftState.remainingCopiesByCard)).toHaveLength(5);
  });

  it("spends revealed Dreamsign ids from the shared pool", () => {
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }),
      remainingDreamsignPoolIds: [
        asDreamsignId("dreamsign-1"),
        asDreamsignId("dreamsign-2"),
      ],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      dreamsignCount: 2,
    });
    const dreamsignSlots = result.slots.filter(
      (slot) => slot.itemType === "dreamsign",
    );
    expect(result.spentDreamsignPoolIds).toHaveLength(dreamsignSlots.length);
    expect(
      result.remainingDreamsignPoolIds.length + dreamsignSlots.length,
    ).toBe(2);
  });

  it("dreamsign slots are priced in essence", () => {
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1 }),
      remainingDreamsignPoolIds: [
        asDreamsignId("dreamsign-1"),
        asDreamsignId("dreamsign-2"),
      ],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      dreamsignCount: 2,
    });
    for (const slot of result.slots) {
      if (slot.itemType === "dreamsign") {
        expect(slot.basePrice).toBeGreaterThan(0);
      }
    }
  });

  it("applies 1-2 discounts within the 30-90% range", () => {
    for (let i = 0; i < 20; i += 1) {
      const result = generateShopInventory({
        cardDatabase: db,
        draftState: makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }),
        remainingDreamsignPoolIds: [
          asDreamsignId("dreamsign-1"),
          asDreamsignId("dreamsign-2"),
        ],
        dreamsignTemplates: DREAMSIGN_TEMPLATES,
      });
      const discounted = result.slots.filter((s) => s.discountPercent > 0);
      expect(discounted.length).toBeGreaterThanOrEqual(1);
      expect(discounted.length).toBeLessThanOrEqual(2);
      for (const slot of discounted) {
        expect(slot.discountPercent).toBeGreaterThanOrEqual(30);
        expect(slot.discountPercent).toBeLessThanOrEqual(90);
      }
    }
  });

  it("uses the supplied random stream deterministically", () => {
    const options = {
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }),
      remainingDreamsignPoolIds: [],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      cardCount: 5,
      rng: () => 0.25,
    };
    const first = generateShopInventory(options);
    const second = generateShopInventory({
      ...options,
      draftState: structuredClone(options.draftState),
    });
    expect(first.slots).toEqual(second.slots);
  });

  it("returns shop reconstruction data without emitting the inventory log during generation", () => {
    resetLog();

    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1 }),
      remainingDreamsignPoolIds: [],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      cardCount: 3,
      rng: () => 0,
    });

    expect(result.reconstructionLog.event).toBe("shop_inventory_generated");
    expect(result.reconstructionLog.cardSlotCount).toBe(result.slots.length);
    expect(
      getLogEntries().some(
        (entry) => entry.event === "shop_inventory_generated",
      ),
    ).toBe(false);
  });

  it("draws Specialty Shop card slots from the current run pool", () => {
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 3: 1, 5: 1 }),
      remainingDreamsignPoolIds: [asDreamsignId("dreamsign-1")],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      isSpecialty: true,
      cardCount: 2,
    });
    const cardSlots = result.slots.filter((slot) => slot.itemType === "card");
    expect(cardSlots.length).toBeGreaterThan(0);
    for (const slot of cardSlots) {
      expect(slot.card).not.toBeNull();
      expect([1, 3, 5]).toContain(slot.card!.cardNumber);
    }
  });

  it("spends the draft pool for a Specialty Shop", () => {
    const draftState = makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
    const before = structuredClone(draftState.remainingCopiesByCard);
    const result = generateShopInventory({
      cardDatabase: db,
      draftState,
      remainingDreamsignPoolIds: [asDreamsignId("dreamsign-1")],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      isSpecialty: true,
    });
    // The original passed-in object is unchanged.
    expect(draftState.remainingCopiesByCard).toEqual(before);
    expect(result.draftState).toBeDefined();
    expect(result.draftState?.mode).toBe("tides4");
    if (result.draftState?.mode !== "tides4")
      throw new Error("expected pool state");
    expect(result.draftState.remainingCopiesByCard).not.toEqual(before);
  });

  it("prices Specialty Shop card slots at the specialty price", () => {
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }),
      remainingDreamsignPoolIds: [asDreamsignId("dreamsign-1")],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      isSpecialty: true,
    });
    for (const slot of result.slots) {
      if (slot.itemType === "card") {
        expect(slot.basePrice).toBe(ECONOMY.shop.prices.specialtyCard);
      }
    }
  });

  it("prices regular shop card slots at the standard price and spends the pool", () => {
    const draftState = makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
    const result = generateShopInventory({
      cardDatabase: db,
      draftState,
      remainingDreamsignPoolIds: [],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
    });
    const cardSlots = result.slots.filter((slot) => slot.itemType === "card");
    for (const slot of cardSlots) {
      expect(slot.basePrice).toBe(ECONOMY.shop.prices.standardCard);
    }
    // The regular shop spends drawn cards from the draft multiset.
    expect(
      Object.keys(result.draftState?.remainingCopiesByCard ?? {}).length,
    ).toBeLessThan(Object.keys(draftState.remainingCopiesByCard).length);
  });

  it("does not crash with a null draft state", () => {
    expect(() =>
      generateShopInventory({
        cardDatabase: db,
        draftState: null,
        remainingDreamsignPoolIds: [],
        dreamsignTemplates: DREAMSIGN_TEMPLATES,
      }),
    ).not.toThrow();
  });
});
