import { describe, expect, it } from "vitest";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { buildAiConfiguredDeck } from "./deck";
import { testCardId } from "../../types/test-identities";

/** Minimal valid CardData for test fixtures. */
function makeCard(
  cardNumber: number,
  name: string,
  isStarter: boolean,
): CardData {
  return {
    name: parseCardName(name),
    id: testCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "Warrior",
    isStarter,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: `${name} text`,
    imageNumber: cardNumber,
    artOwned: true,
  };
}

/**
 * Fixture with 3 starter cards and 2 non-starter cards. All assertions are
 * invariants over this fixture so the test does not depend on the real card
 * database, which can grow or shrink over time.
 */
function makeFixture(): ReadonlyMap<number, CardData> {
  const cards: CardData[] = [
    makeCard(10, "Starter Alpha", true),
    makeCard(20, "Non-Starter One", false),
    makeCard(30, "Starter Beta", true),
    makeCard(40, "Non-Starter Two", false),
    makeCard(50, "Starter Gamma", true),
  ];
  return new Map(cards.map((c) => [c.cardNumber, c]));
}

function configuredDeck(db: ReadonlyMap<number, CardData>, count = 3) {
  return buildAiConfiguredDeck(
    db,
    [...db.values()]
      .filter((card) => card.isStarter)
      .sort((a, b) => a.cardNumber - b.cardNumber)
      .map((card) => ({ cardId: card.id, count })),
  );
}

const STARTER_CARD_NUMBERS = new Set([10, 30, 50]);
const NON_STARTER_CARD_NUMBERS = new Set([20, 40]);
const STARTER_COUNT = STARTER_CARD_NUMBERS.size;

describe("configuredDeck", () => {
  describe("default copies (3 per card)", () => {
    const db = makeFixture();
    const result = configuredDeck(db);

    it("output length equals starters × 3", () => {
      expect(result).toHaveLength(STARTER_COUNT * 3);
    });

    it("each starter card appears exactly 3 times", () => {
      for (const cardNumber of STARTER_CARD_NUMBERS) {
        const count = result.filter((d) => d.cardNumber === cardNumber).length;
        expect(count).toBe(3);
      }
    });

    it("no non-starter card appears in the output", () => {
      for (const cardNumber of NON_STARTER_CARD_NUMBERS) {
        const count = result.filter((d) => d.cardNumber === cardNumber).length;
        expect(count).toBe(0);
      }
    });
  });

  describe("custom copies (2 per card)", () => {
    const db = makeFixture();
    const result = configuredDeck(db, 2);

    it("output length equals starters × 2", () => {
      expect(result).toHaveLength(STARTER_COUNT * 2);
    });

    it("each starter card appears exactly 2 times", () => {
      for (const cardNumber of STARTER_CARD_NUMBERS) {
        const count = result.filter((d) => d.cardNumber === cardNumber).length;
        expect(count).toBe(2);
      }
    });

    it("no non-starter card appears in the output", () => {
      for (const cardNumber of NON_STARTER_CARD_NUMBERS) {
        const count = result.filter((d) => d.cardNumber === cardNumber).length;
        expect(count).toBe(0);
      }
    });
  });

  describe("edge cases", () => {
    it("empty database returns empty array", () => {
      expect(configuredDeck(new Map())).toHaveLength(0);
    });

    it("database with no starters returns empty array", () => {
      const db: ReadonlyMap<number, CardData> = new Map([
        [20, makeCard(20, "Non-Starter One", false)],
        [40, makeCard(40, "Non-Starter Two", false)],
      ]);
      expect(configuredDeck(db)).toHaveLength(0);
    });

    it("copiesPerCard = 1 returns each starter exactly once", () => {
      const db = makeFixture();
      const result = configuredDeck(db, 1);
      expect(result).toHaveLength(STARTER_COUNT);
      for (const cardNumber of STARTER_CARD_NUMBERS) {
        const count = result.filter((d) => d.cardNumber === cardNumber).length;
        expect(count).toBe(1);
      }
    });
  });

  describe("output correctness", () => {
    it("definitions are produced via createBaseBattleDeckCardDefinition (spot-check fields)", () => {
      const db = makeFixture();
      const result = configuredDeck(db, 1);
      const alpha = result.find((d) => d.cardNumber === 10);
      expect(alpha).toBeDefined();
      expect(alpha?.name).toBe("Starter Alpha");
      expect(alpha?.battleCardKind).toBe("character");
      expect(alpha?.sourceDeckEntryId).toBeNull();
      expect(alpha?.isBane).toBe(false);
    });

    it("output is sorted by cardNumber (deterministic order)", () => {
      const db = makeFixture();
      const result = configuredDeck(db, 1);
      const numbers = result.map((d) => d.cardNumber);
      expect(numbers).toEqual([...numbers].sort((a, b) => a - b));
    });

    it("within each group copies are contiguous and identically valued", () => {
      const db = makeFixture();
      const result = configuredDeck(db, 2);
      // For cardNumber 10, entries at indices 0 and 1 should both be cardNumber 10
      const group10 = result.slice(0, 2);
      expect(group10.every((d) => d.cardNumber === 10)).toBe(true);
    });
  });
});
