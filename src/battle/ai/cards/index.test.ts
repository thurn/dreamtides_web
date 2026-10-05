import { describe, expect, it } from "vitest";
import { starterCardModels } from "./index";
import { buildAiConfiguredDeck } from "../deck";
import type { CardData } from "../../../types/cards";
import { opponentsFixture } from "../../../testing/opponents-fixture";
import { cardsDocument } from "../../../content/documents";


/** Loads the real runtime card catalog the headless scripts read. */
function loadCardDatabase(): Map<number, CardData> {
  const cards = cardsDocument() as unknown as CardData[];
  return new Map(cards.map((card) => [card.cardNumber, card]));
}

describe("starterCardModels registry", () => {
  it("is a Map instance", () => {
    expect(starterCardModels).toBeInstanceOf(Map);
  });

  it("every entry is keyed by its own cardNumber", () => {
    for (const [key, model] of starterCardModels) {
      expect(model.cardNumber).toBe(key);
    }
  });

  it("models exactly the ten Starter cards #510-519", () => {
    expect([...starterCardModels.keys()].sort((a, b) => a - b)).toEqual([
      510, 511, 512, 513, 514, 515, 516, 517, 518, 519,
    ]);
  });

  it("every distinct cardNumber in the real AI deck has a registered model", () => {
    const deck = buildAiConfiguredDeck(
      loadCardDatabase(),
      opponentsFixture().journeyAiDeck,
    );
    expect(deck.length).toBeGreaterThan(0);
    const distinct = new Set(deck.map((card) => card.cardNumber));
    for (const cardNumber of distinct) {
      expect(
        starterCardModels.has(cardNumber),
        `deck card #${cardNumber} has no StarterCardModel`,
      ).toBe(true);
    }
  });
});
