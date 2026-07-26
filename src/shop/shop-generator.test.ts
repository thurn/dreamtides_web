import { describe, it, expect } from "vitest";
import { getLogEntries, resetLog } from "../logging";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate, ResolvedDreamAvatarPackage } from "../types/content";
import type { PoolDraftState, ReplayDraftState } from "../types/draft";
import {
  generateShopInventory,
  effectivePrice,
  replayShopDraftState,
  rerollCost,
  runtimeSlotsToShopSlots,
  shopSlotsToRuntime,
  STANDARD_CARD_PRICE,
  SPECIALTY_CARD_PRICE,
} from "./shop-generator";
import { asCardId, asCardName } from "../types/card-identity";

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

  it("applies the essence discount to Dreamsign prices", () => {
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
          id: "dreamsign-1",
          name: "Dreamsign One",
          effectDescription: "First effect.",
          isBane: false,
        },
        basePrice: 0,
        discountPercent: 0,
        purchased: false,
      },
      { },
    );
    expect(result).toBe(0);
  });
});

describe("rerollCost", () => {
  it("costs essence for a regular shop", () => {
    expect(rerollCost(0, false)).toBeGreaterThan(0);
  });

  it("is free for an enhanced shop", () => {
    expect(rerollCost(0, true)).toBe(0);
  });
});

describe("shop runtime conversion", () => {
  it("round-trips card and Dreamsign slots", () => {
    const card = makeCard({ cardNumber: 7, name: asCardName("Seven Bells") });
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

  it("generates a Card Shop of card slots with no dreamsigns by default", () => {
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
    expect(cardSlots.length).toBeGreaterThan(0);
    // A Card Shop never offers dreamsigns; those are sold at the Dreamsign
    // Market, which requests dreamsign slots explicitly.
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
    const resultPoolState = result.draftState as PoolDraftState | undefined;
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
      remainingDreamsignPoolIds: ["dreamsign-1", "dreamsign-2"],
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

  it("uses a deterministic Fisher-Yates pass for discount slot selection", () => {
    const draws = [
      // Specialty stock shuffle.
      0, 0, 0, 0,
      // One discounted slot, then discount-index Fisher-Yates.
      0, 0, 0, 0, 0,
      // 30% discount.
      0,
    ];
    let calls = 0;
    const rng = () => {
      const value = draws[calls];
      if (value === undefined) {
        throw new Error(`unexpected rng call ${String(calls)}`);
      }
      calls += 1;
      return value;
    };

    const result = generateShopInventory({
      cardDatabase: db,
      draftState: makeDraftState({ 1: 1, 2: 1, 3: 1, 4: 1, 5: 1 }),
      remainingDreamsignPoolIds: [],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
      starterDecklistCardNumbers: [1, 2, 3, 4, 5],
      cardCount: 5,
      rng,
    });

    expect(calls).toBe(draws.length);
    expect(
      result.slots.map((slot) => ({
        cardNumber: slot.card?.cardNumber ?? null,
        discountPercent: slot.discountPercent,
      })),
    ).toEqual([
      { cardNumber: 2, discountPercent: 0 },
      { cardNumber: 3, discountPercent: 30 },
      { cardNumber: 4, discountPercent: 0 },
      { cardNumber: 5, discountPercent: 0 },
      { cardNumber: 1, discountPercent: 0 },
    ]);
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
      getLogEntries().some((entry) => entry.event === "shop_inventory_generated"),
    ).toBe(false);
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
    // A Specialty Shop never spends the run draft multiset, so it hands back no
    // draft state: the caller keeps its own untouched, and nothing the shop
    // returns can overwrite the run's draft pool.
    expect(result.draftState).toBeUndefined();
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
        (result.draftState as PoolDraftState | undefined)?.remainingCopiesByCard ??
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

function makeReplayState(): ReplayDraftState {
  return {
    mode: "replay",
    recordId: "record-0",
    packSequence: [[1, 2, 3, 4]],
    signatureCardNumbers: [],
    currentOffer: [1, 2, 3, 4],
    activeSiteId: "site-1",
    pickNumber: 1,
    sitePicksCompleted: 0,
  };
}

function makePackage(
  draftPoolCopiesByCard: Record<string, number>,
): ResolvedDreamAvatarPackage {
  return {
    dreamAvatar: {
      id: "dream-avatar-0",
      name: "Test",
      title: "Test",
      renderedText: "",
      imageNumber: "0001",
      startingEssence: 250,
      signatureCards: [],
    },
    draftPoolCopiesByCard,
    dreamsignPoolIds: [],
    mandatoryOnlyPoolSize: 0,
    draftPoolSize: 0,
    doubledCardCount: 0,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
    starterDecklistCardNumbers: [],
  };
}

describe("replayShopDraftState", () => {
  it("builds a fresh pool draft state from the package draft pool", () => {
    const copies = { "1": 1, "2": 2, "3": 1 };
    const state = replayShopDraftState(makePackage(copies));

    expect(state).not.toBeNull();
    expect(state?.mode).toBe("pool");
    expect(state?.draftPoolCopiesByCard).toEqual(copies);
    expect(state?.remainingCopiesByCard).toEqual(copies);
    // remainingCopiesByCard is a fresh copy, not the same reference.
    expect(state?.remainingCopiesByCard).not.toBe(
      state?.draftPoolCopiesByCard,
    );
    expect(state?.currentOffer).toEqual([]);
    expect(state?.activeSiteId).toBeNull();
  });

  it("returns null for a missing or empty package pool", () => {
    expect(replayShopDraftState(null)).toBeNull();
    expect(replayShopDraftState(undefined)).toBeNull();
    expect(replayShopDraftState(makePackage({}))).toBeNull();
  });

  it("lets a replay shop draw card slots from the substituted package pool", () => {
    // A replay draft state has no card multiset; substituting the package pool
    // (the caller's behavior) lets generateShopInventory populate card slots,
    // which it cannot do off the replay state directly.
    const cards = makeDatabase([
      makeCard({ cardNumber: 1 }),
      makeCard({ cardNumber: 2 }),
      makeCard({ cardNumber: 3 }),
      makeCard({ cardNumber: 4 }),
      makeCard({ cardNumber: 5 }),
    ]);
    const replayState = makeReplayState();
    const shopPool = replayShopDraftState(
      makePackage({ "1": 1, "2": 1, "3": 1, "4": 1, "5": 1 }),
    );

    // Sanity: feeding the replay state directly throws (no multiset to draw).
    expect(() =>
      generateShopInventory({
        cardDatabase: cards,
        draftState: replayState,
        remainingDreamsignPoolIds: [],
        dreamsignTemplates: DREAMSIGN_TEMPLATES,
      }),
    ).toThrow();

    const result = generateShopInventory({
      cardDatabase: cards,
      draftState: shopPool,
      remainingDreamsignPoolIds: [],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
    });
    const cardSlots = result.slots.filter((slot) => slot.itemType === "card");
    expect(cardSlots.length).toBeGreaterThan(0);
    for (const slot of cardSlots) {
      expect(slot.basePrice).toBe(STANDARD_CARD_PRICE);
    }
  });
});
