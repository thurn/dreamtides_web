import { describe, it, expect } from "vitest";
import { getLogEntries, resetLog } from "../logging";
import type { DreamsignTemplate } from "../types/content";
import { serializeCardNumber, type PoolDraftState } from "../types/draft";
import {
  generateShopInventory as generateShopInventoryRaw,
  type ShopGenerationOptions,
} from "./shop-generator";
import { testDreamsignId } from "../types/test-identities";
import { ECONOMY, makeCard, makeDatabase } from "./shop-generator-test-fixtures";

function generateShopInventory(
  options: Omit<ShopGenerationOptions, "economy">,
) {
  return generateShopInventoryRaw({ ...options, economy: ECONOMY.shop });
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
    id: testDreamsignId("dreamsign-1"),
    name: "Dreamsign One",
    effectDescription: "First effect.",
  },
  {
    id: testDreamsignId("dreamsign-2"),
    name: "Dreamsign Two",
    effectDescription: "Second effect.",
  },
];

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
        testDreamsignId("dreamsign-1"),
        testDreamsignId("dreamsign-2"),
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
        resultPoolState?.remainingCopiesByCard[serializeCardNumber(cardNumber)],
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
        testDreamsignId("dreamsign-1"),
        testDreamsignId("dreamsign-2"),
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

  it("retains regenerated unoffered Dreamsign supply for the next draw", () => {
    const templates = [...DREAMSIGN_TEMPLATES, { ...DREAMSIGN_TEMPLATES[0], id: testDreamsignId("dreamsign-3") }];
    const ids = templates.map(({ id }) => id);
    for (const regeneration of [ids, [...ids].reverse()]) {
      const options = { cardDatabase: db, draftState: null, remainingDreamsignPoolIds: [],
        dreamsignTemplates: templates, dreamsignRegenerationPoolIds: regeneration,
        cardCount: 0, dreamsignCount: 1, rng: () => 0 };
      const first = generateShopInventory(options);
      expect(first.spentDreamsignPoolIds).toHaveLength(1);
      expect(first.remainingDreamsignPoolIds).toEqual(regeneration.filter((id) => !first.spentDreamsignPoolIds.includes(id)));
      const second = generateShopInventory({ ...options, remainingDreamsignPoolIds: first.remainingDreamsignPoolIds });
      expect(second.spentDreamsignPoolIds).toHaveLength(1);
      expect(second.spentDreamsignPoolIds[0]).not.toBe(first.spentDreamsignPoolIds[0]);
      expect(second.remainingDreamsignPoolIds).toEqual(first.remainingDreamsignPoolIds.filter((id) => !second.spentDreamsignPoolIds.includes(id)));
      expect(second.remainingDreamsignPoolIds).toHaveLength(1);
      expect(options.remainingDreamsignPoolIds).toEqual([]);
    }
  });

  it("dreamsign slots are priced in essence", () => {
    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1 }),
      remainingDreamsignPoolIds: [
        testDreamsignId("dreamsign-1"),
        testDreamsignId("dreamsign-2"),
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
          testDreamsignId("dreamsign-1"),
          testDreamsignId("dreamsign-2"),
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
      remainingDreamsignPoolIds: [testDreamsignId("dreamsign-1")],
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
      remainingDreamsignPoolIds: [testDreamsignId("dreamsign-1")],
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
      remainingDreamsignPoolIds: [testDreamsignId("dreamsign-1")],
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
