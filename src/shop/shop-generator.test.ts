import { describe, it, expect } from "vitest";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { DraftState } from "../types/draft";
import {
  generateShopInventory,
  effectivePrice,
  rerollCost,
  runtimeSlotsToShopSlots,
  shopSlotsToRuntime,
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
    tides: ["tide_alpha"],
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

function makeDraftState(copies: Record<number, number>): DraftState {
  const draftPoolCopiesByCard: Record<string, number> = {};
  for (const [cardNumber, count] of Object.entries(copies)) {
    draftPoolCopiesByCard[cardNumber] = count;
  }
  return {
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
    packageTides: ["tide_alpha"],
    effectDescription: "First effect.",
  },
  {
    id: "dreamsign-2",
    name: "Dreamsign Two",
    packageTides: ["tide_beta"],
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
    makeCard({ cardNumber: 1, tides: ["tide_alpha"] }),
    makeCard({ cardNumber: 2, tides: ["tide_beta"] }),
    makeCard({ cardNumber: 3, tides: ["tide_gamma"] }),
    makeCard({ cardNumber: 4, tides: ["tide_alpha"] }),
    makeCard({ cardNumber: 5, tides: ["tide_beta"] }),
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
    for (const cardNumber of drawnCardNumbers) {
      expect(
        result.draftState?.remainingCopiesByCard[String(cardNumber)],
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

  it("restricts a Specialty Shop to a single mandatory tide", () => {
    const specialtyDb = makeDatabase([
      makeCard({ cardNumber: 1, tides: ["tide_alpha"] }),
      makeCard({ cardNumber: 2, tides: ["tide_alpha"] }),
      makeCard({ cardNumber: 3, tides: ["tide_alpha"] }),
      makeCard({ cardNumber: 4, tides: ["tide_beta"] }),
    ]);
    const result = generateShopInventory({
      cardDatabase: specialtyDb,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1 }),
      remainingDreamsignPoolIds: ["dreamsign-1"],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      specialtyTides: ["tide_alpha"],
    });
    expect(result.restrictedTide).toBe("tide_alpha");
    for (const slot of result.slots) {
      if (slot.itemType === "card" && slot.card !== null) {
        expect(slot.card.tides).toContain("tide_alpha");
      }
    }
  });

  it("returns a null restrictedTide for a regular shop", () => {
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1 }),
      remainingDreamsignPoolIds: [],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
    });
    expect(result.restrictedTide).toBeNull();
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
