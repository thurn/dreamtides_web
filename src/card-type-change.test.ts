import { describe, expect, it } from "vitest";

import type { CardData } from "./types/cards";
import { applyCardKeywordModification } from "./card-type-change";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: "Test Event",
    id: "test-event",
    cardNumber: 1,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

describe("applyCardKeywordModification", () => {
  it("adds visible Reclaim text to effective card data", () => {
    const card = makeCard();

    expect(applyCardKeywordModification(card, { reclaim: 2 })).toMatchObject({
      renderedText: "Draw a card.\n\nReclaim 2●",
    });
  });

  it("keeps Reclaim text stable when applying the same modifier repeatedly", () => {
    const card = makeCard();

    const once = applyCardKeywordModification(card, { reclaim: 2 });
    const twice = applyCardKeywordModification(once, { reclaim: 2 });

    expect(twice.renderedText).toBe("Draw a card.\n\nReclaim 2●");
  });
});
