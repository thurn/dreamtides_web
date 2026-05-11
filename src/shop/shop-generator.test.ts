import { describe, it, expect, vi } from "vitest";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate } from "../types/content";
import type { DeckEntry } from "../types/quest";
import {
  generateShopInventory,
  generateSpecialtyShopInventory,
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

function makeDeckEntry(cardNumber: number): DeckEntry {
  return {
    entryId: `entry-${String(cardNumber)}`,
    cardNumber,
    transfiguration: null,
    isBane: false,
  };
}

const DREAMSIGN_TEMPLATES: DreamsignTemplate[] = [
  {
    id: "dreamsign-1",
    name: "Dreamsign One",
    packageTides: ["alpha"],
    effectDescription: "First effect.",
  },
  {
    id: "dreamsign-2",
    name: "Dreamsign Two",
    packageTides: ["beta"],
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

  it("rounds to nearest integer", () => {
    const result = effectivePrice({
      itemType: "card",
      card: null,
      dreamsign: null,
      basePrice: 100,
      discountPercent: 30,
      purchased: false,
    });
    expect(result).toBe(70);
  });
});

describe("rerollCost", () => {
  it("returns base cost for first reroll", () => {
    expect(rerollCost(0, false)).toBe(50);
  });

  it("increments cost by 25 per previous reroll", () => {
    expect(rerollCost(1, false)).toBe(75);
    expect(rerollCost(2, false)).toBe(100);
    expect(rerollCost(3, false)).toBe(125);
  });

  it("returns 0 when enhanced", () => {
    expect(rerollCost(0, true)).toBe(0);
    expect(rerollCost(5, true)).toBe(0);
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
        basePrice: 150,
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
        basePrice: 150,
        discountPercent: 0,
        purchased: true,
      },
    ]);
    expect(runtimeSlotsToShopSlots(runtime, makeDatabase([card]))).toEqual(slots);
  });

  it("uses a null display card when runtime card data is missing", () => {
    expect(
      runtimeSlotsToShopSlots(
        [
          {
            itemType: "card",
            cardNumber: 404,
            basePrice: 100,
            discountPercent: 0,
            purchased: false,
          },
        ],
        makeDatabase([]),
      ),
    ).toEqual([
      {
        itemType: "card",
        card: null,
        dreamsign: null,
        basePrice: 100,
        discountPercent: 0,
        purchased: false,
      },
    ]);
  });
});

describe("generateShopInventory", () => {
  const cards = [
    makeCard({ cardNumber: 1, tides: ["tide_alpha"] }),
    makeCard({ cardNumber: 2, tides: ["tide_beta"] }),
    makeCard({ cardNumber: 3, tides: ["tide_gamma"] }),
  ];
  const db = makeDatabase(cards);

  it("generates exactly 6 slots", () => {
    const result = generateShopInventory(db, []);
    expect(result.slots).toHaveLength(6);
  });

  it("all slots start as not purchased", () => {
    const result = generateShopInventory(db, []);
    for (const slot of result.slots) {
      expect(slot.purchased).toBe(false);
    }
  });

  it("never includes a reroll slot in the grid inventory", () => {
    // The reroll affordance lives outside the grid so every inventory
    // slot is a card or Dreamsign.
    for (let i = 0; i < 20; i++) {
      const result = generateShopInventory(db, []);
      for (const slot of result.slots) {
        expect(["card", "dreamsign"]).toContain(slot.itemType);
      }
    }
  });

  it("applies 1-2 discounts to inventory slots", () => {
    for (let i = 0; i < 20; i++) {
      const result = generateShopInventory(db, []);
      const discounted = result.slots.filter((s) => s.discountPercent > 0);
      expect(discounted.length).toBeGreaterThanOrEqual(1);
      expect(discounted.length).toBeLessThanOrEqual(2);
      for (const slot of discounted) {
        expect(slot.discountPercent).toBeGreaterThanOrEqual(30);
        expect(slot.discountPercent).toBeLessThanOrEqual(90);
      }
    }
  });

  it("card slots have a fixed base price", () => {
    for (let i = 0; i < 20; i++) {
      const result = generateShopInventory(db, []);
      for (const slot of result.slots) {
        if (slot.itemType === "card" && slot.card) {
          expect(slot.basePrice).toBe(100);
        }
      }
    }
  });

  it("dreamsign slots have price 150", () => {
    for (let i = 0; i < 50; i++) {
      const result = generateShopInventory(db, [], {
        remainingDreamsignPoolIds: ["dreamsign-1", "dreamsign-2"],
        dreamsignTemplates: DREAMSIGN_TEMPLATES,
      });
      for (const slot of result.slots) {
        if (slot.itemType === "dreamsign") {
          expect(slot.basePrice).toBe(150);
          expect(slot.dreamsign).not.toBeNull();
        }
      }
    }
  });

  it("spends revealed Dreamsign ids from the shared pool", () => {
    const result = generateShopInventory(db, [], {
      remainingDreamsignPoolIds: ["dreamsign-1", "dreamsign-2"],
      dreamsignTemplates: DREAMSIGN_TEMPLATES,
    });

    const dreamsignSlots = result.slots.filter((slot) => slot.itemType === "dreamsign");
    expect(result.remainingDreamsignPoolIds.length + dreamsignSlots.length).toBe(2);
    expect(result.spentDreamsignPoolIds).toHaveLength(dreamsignSlots.length);
  });

  it("filters cards to the selected package when adjacent cards exist", () => {
    const adjacentDb = makeDatabase([
      makeCard({ cardNumber: 1, tides: ["tide_beta"] }),
      makeCard({ cardNumber: 2, tides: ["tide_beta"] }),
      makeCard({ cardNumber: 3, tides: ["tide_beta"] }),
      makeCard({ cardNumber: 4, tides: ["tide_beta"] }),
      makeCard({ cardNumber: 5, tides: ["tide_beta"] }),
      makeCard({ cardNumber: 6, tides: ["tide_beta"] }),
      makeCard({ cardNumber: 7, tides: ["tide_alpha"] }),
    ]);
    const result = generateShopInventory(adjacentDb, [], {
      selectedPackageTides: ["tide_beta"],
    });

    for (const slot of result.slots) {
      if (slot.itemType === "card" && slot.card !== null) {
        expect(slot.card.tides).toContain("tide_beta");
      }
    }
  });

  it("prefers cards with the strongest package overlap in shop inventory", () => {
    const overlapDb = makeDatabase(
      Array.from({ length: 6 }, (_, index) =>
        makeCard({
          cardNumber: index + 1,
          tides: ["tide_beta", "tide_alpha"],
        }),
      ).concat([
        makeCard({ cardNumber: 11, tides: ["tide_beta"] }),
        makeCard({ cardNumber: 12, tides: ["tide_alpha"] }),
      ]),
    );

    const result = generateShopInventory(overlapDb, [], {
      selectedPackageTides: ["tide_beta", "tide_alpha"],
    });

    for (const slot of result.slots) {
      if (slot.itemType === "card" && slot.card !== null) {
        expect(slot.card.tides).toContain("tide_beta");
        expect(slot.card.tides).toContain("tide_alpha");
      }
    }
  });

  it("avoids duplicate card offers when enough cards match the theme", () => {
    const uniqueDb = makeDatabase(
      Array.from({ length: 8 }, (_, index) =>
        makeCard({
          cardNumber: index + 1,
          tides: ["tide_beta"],
        }),
      ),
    );

    const result = generateShopInventory(uniqueDb, [], {
      selectedPackageTides: ["tide_beta"],
    });

    const cardNumbers = result.slots
      .filter((slot) => slot.itemType === "card" && slot.card !== null)
      .map((slot) => slot.card!.cardNumber);

    expect(new Set(cardNumbers).size).toBe(cardNumbers.length);
  });

  it("never offers starter cards in normal shop inventory", () => {
    const starterDb = makeDatabase([
      makeCard({ cardNumber: 1, isStarter: true, tides: ["tide_alpha"] }),
      makeCard({ cardNumber: 2, tides: ["tide_beta"] }),
    ]);

    for (let i = 0; i < 10; i += 1) {
      const result = generateShopInventory(starterDb, []);
      for (const slot of result.slots) {
        if (slot.itemType === "card" && slot.card !== null) {
          expect(slot.card.isStarter).toBe(false);
        }
      }
    }
  });
});

describe("generateShopInventory with empty database", () => {
  it("does not crash on an empty card database", () => {
    const emptyDb = new Map<number, CardData>();
    const result = generateShopInventory(emptyDb, []);
    // Should still produce valid non-card slots without falling over on an
    // empty pool.
    for (const slot of result.slots) {
      if (slot.itemType === "card") {
        expect(slot.card).not.toBeNull();
      }
    }
  });

  it("generates valid inventory when run many times with empty database", () => {
    const emptyDb = new Map<number, CardData>();
    for (let i = 0; i < 20; i++) {
      expect(() => generateShopInventory(emptyDb, [])).not.toThrow();
    }
  });
});

describe("generateSpecialtyShopInventory", () => {
  const cards = [
    makeCard({ cardNumber: 1, tides: ["tide_alpha"] }),
    makeCard({ cardNumber: 2, tides: ["tide_beta"] }),
    makeCard({ cardNumber: 3, tides: ["tide_gamma"] }),
    makeCard({ cardNumber: 4, tides: ["tide_zeta"] }),
  ];
  const db = makeDatabase(cards);

  it("generates exactly 4 slots", () => {
    const slots = generateSpecialtyShopInventory(db, []);
    expect(slots).toHaveLength(4);
  });

  it("all slots are non-starter cards", () => {
    const slots = generateSpecialtyShopInventory(db, []);
    for (const slot of slots) {
      expect(slot.itemType).toBe("card");
      expect(slot.card).not.toBeNull();
      expect(slot.card!.isStarter).toBe(false);
    }
  });

  it("all slots are priced at 200", () => {
    const slots = generateSpecialtyShopInventory(db, []);
    for (const slot of slots) {
      expect(slot.basePrice).toBe(200);
    }
  });

  it("all slots start as not purchased", () => {
    const slots = generateSpecialtyShopInventory(db, []);
    for (const slot of slots) {
      expect(slot.purchased).toBe(false);
    }
  });

  it("fills all 4 slots when 4 eligible cards exist", () => {
    const deckEntries = Array.from({ length: 20 }, () => makeDeckEntry(2));
    const slots = generateSpecialtyShopInventory(db, deckEntries);
    expect(slots).toHaveLength(4);
  });

  it("returns empty slots when no non-starter cards exist", () => {
    const noEligibleDb = makeDatabase([
      makeCard({ cardNumber: 10, isStarter: true, tides: ["tide_alpha"] }),
    ]);
    const slots = generateSpecialtyShopInventory(noEligibleDb, []);
    expect(slots).toHaveLength(0);
  });

  it("does not crash on an empty card database", () => {
    const emptyDb = new Map<number, CardData>();
    expect(() => generateSpecialtyShopInventory(emptyDb, [])).not.toThrow();
    const slots = generateSpecialtyShopInventory(emptyDb, []);
    expect(slots).toHaveLength(0);
  });

  it("uses package-adjacent cards when available", () => {
    const adjacentDb = makeDatabase([
      makeCard({ cardNumber: 1, tides: ["tide_beta"] }),
      makeCard({ cardNumber: 2, tides: ["tide_beta"] }),
      makeCard({ cardNumber: 3, tides: ["tide_beta"] }),
      makeCard({ cardNumber: 4, tides: ["tide_beta"] }),
      makeCard({ cardNumber: 5, tides: ["tide_zeta"] }),
    ]);
    const slots = generateSpecialtyShopInventory(adjacentDb, [], ["tide_beta"]);
    expect(slots).toHaveLength(4);
    for (const slot of slots) {
      expect(slot.card?.tides).toContain("tide_beta");
    }
  });

  it("falls back to the broader pool when no package-adjacent cards exist", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const slots = generateSpecialtyShopInventory(db, [], ["tide_epsilon"]);
    expect(slots).toHaveLength(4);
    expect(
      slots.some((slot) => slot.card?.tides.includes("tide_beta") ?? false),
    ).toBe(true);
  });
});
