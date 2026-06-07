import { describe, it, expect } from "vitest";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { PoolDraftState } from "../types/draft";
import {
  generateShopInventory,
  effectivePrice,
  rerollCost,
  runtimeSlotsToShopSlots,
  shopSlotsToRuntime,
  STANDARD_CARD_PRICE,
  SPECIALTY_CARD_PRICE,
} from "./shop-generator";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: "Test Card",
    id: "test-id",
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
    mode: "pool",
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
    id: "dreamsign-1",
    name: "Dreamsign One",
    effectDescription: "First effect.",
  },
  {
    id: "dreamsign-2",
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

  it("does not apply the essence discount to Dreamsign omen prices", () => {
    const result = effectivePrice(
      {
        itemType: "dreamsign",
        card: null,
        dreamsign: {
          id: "dreamsign-1",
          name: "Dreamsign One",
          effectDescription: "First effect.",
          isBane: false,
        },
        basePrice: 2,
        discountPercent: 0,
        purchased: false,
      },
      { essenceDiscountPercent: 50 },
    );
    expect(result).toBe(2);
  });

  it("applies one upcoming omen discount to positive Dreamsign omen prices", () => {
    const result = effectivePrice(
      {
        itemType: "dreamsign",
        card: null,
        dreamsign: {
          id: "dreamsign-1",
          name: "Dreamsign One",
          effectDescription: "First effect.",
          isBane: false,
        },
        basePrice: 2,
        discountPercent: 0,
        purchased: false,
      },
      { upcomingOmenDiscounts: 1 },
    );
    expect(result).toBe(1);
  });

  it("leaves free Dreamsign slots free without spending an omen discount", () => {
    const result = effectivePrice(
      {
        itemType: "dreamsign",
        card: null,
        dreamsign: {
          id: "dreamsign-1",
          name: "Dreamsign One",
          effectDescription: "First effect.",
          isBane: false,
        },
        basePrice: 0,
        discountPercent: 0,
        purchased: false,
      },
      { upcomingOmenDiscounts: 1 },
    );
    expect(result).toBe(0);
  });
});

describe("rerollCost", () => {
  it("costs 1 omen for a regular shop", () => {
    expect(rerollCost(0, false)).toBe(1);
  });

  it("is free for an enhanced shop", () => {
    expect(rerollCost(0, true)).toBe(0);
  });
});

describe("shop runtime conversion", () => {
  it("round-trips card and Dreamsign slots", () => {
    const card = makeCard({ cardNumber: 7, name: "Seven Bells" });
    const dreamsign = {
      id: "dreamsign-1",
      name: "Dreamsign One",
      effectDescription: "First effect.",
      isBane: false,
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
    expect(runtimeSlotsToShopSlots(runtime, makeDatabase([card]))).toEqual(slots);
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

  it("generates 3 card slots and 2 dreamsign slots by default", () => {
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }),
      remainingDreamsignPoolIds: ["dreamsign-1", "dreamsign-2"],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
    });
    const cardSlots = result.slots.filter((slot) => slot.itemType === "card");
    const dreamsignSlots = result.slots.filter(
      (slot) => slot.itemType === "dreamsign",
    );
    expect(cardSlots).toHaveLength(3);
    expect(dreamsignSlots).toHaveLength(2);
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
    expect(drawnCardNumbers).toHaveLength(3);
    // Spent cards were removed from the returned draft state.
    const resultPoolState = result.draftState as PoolDraftState | null;
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
      remainingDreamsignPoolIds: ["dreamsign-1", "dreamsign-2"],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
    });
    const dreamsignSlots = result.slots.filter(
      (slot) => slot.itemType === "dreamsign",
    );
    expect(result.spentDreamsignPoolIds).toHaveLength(dreamsignSlots.length);
    expect(
      result.remainingDreamsignPoolIds.length + dreamsignSlots.length,
    ).toBe(2);
  });

  it("dreamsign slots are priced in omens", () => {
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1 }),
      remainingDreamsignPoolIds: ["dreamsign-1", "dreamsign-2"],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
    });
    for (const slot of result.slots) {
      if (slot.itemType === "dreamsign") {
        expect(slot.basePrice).toBe(2);
      }
    }
  });

  it("applies 1-2 discounts within the 30-90% range", () => {
    for (let i = 0; i < 20; i += 1) {
      const result = generateShopInventory({
        cardDatabase: db,
        draftState: makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }),
        remainingDreamsignPoolIds: ["dreamsign-1", "dreamsign-2"],
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

  it("draws Specialty Shop card slots from the starter decklist", () => {
    const starterDecklistCardNumbers = [2, 4];
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 3: 1, 5: 1 }),
      remainingDreamsignPoolIds: ["dreamsign-1"],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      starterDecklistCardNumbers,
      cardCount: 2,
    });
    const cardSlots = result.slots.filter((slot) => slot.itemType === "card");
    expect(cardSlots.length).toBeGreaterThan(0);
    for (const slot of cardSlots) {
      expect(slot.card).not.toBeNull();
      expect(starterDecklistCardNumbers).toContain(slot.card!.cardNumber);
    }
  });

  it("does not deplete the draft pool for a Specialty Shop", () => {
    const draftState = makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 });
    const before = structuredClone(draftState.remainingCopiesByCard);
    const result = generateShopInventory({
      cardDatabase: db,
      draftState,
      remainingDreamsignPoolIds: ["dreamsign-1"],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      starterDecklistCardNumbers: [1, 2, 3, 4, 5],
    });
    // The original passed-in object is unchanged.
    expect(draftState.remainingCopiesByCard).toEqual(before);
    // The returned draft state still has the full multiset.
    expect(
      (result.draftState as PoolDraftState | null)?.remainingCopiesByCard,
    ).toEqual(before);
  });

  it("prices Specialty Shop card slots at the specialty price", () => {
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }),
      remainingDreamsignPoolIds: ["dreamsign-1"],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      starterDecklistCardNumbers: [1, 2, 3, 4, 5],
    });
    for (const slot of result.slots) {
      if (slot.itemType === "card") {
        expect(slot.basePrice).toBe(SPECIALTY_CARD_PRICE);
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
      expect(slot.basePrice).toBe(STANDARD_CARD_PRICE);
    }
    // The regular shop spends drawn cards from the draft multiset.
    expect(
      Object.keys(
        (result.draftState as PoolDraftState | null)?.remainingCopiesByCard ??
          {},
      ).length,
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
