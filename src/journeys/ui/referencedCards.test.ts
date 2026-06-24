import { describe, expect, it } from "vitest";

import type { CardContent } from "../content/types";
import { asCardId, asCardName } from "../../types/card-identity";
import { findReferencedCardPreviews } from "./referencedCards";

function makeCard(
  name: string,
  cardNumber: number,
  overrides: Partial<CardContent> = {},
): CardContent {
  return {
    id: asCardId(`card-${String(cardNumber)}`),
    name: asCardName(name),
    cardNumber,
    cardType: "Event",
    energyCost: 2,
    spark: "",
    rarity: "",
    raw: {
      renderedText: `${name} rules text.`,
      subtype: "Spell",
      imageNumber: cardNumber,
      artOwned: true,
    },
    ...overrides,
  };
}

describe("findReferencedCardPreviews", () => {
  const cards = [
    makeCard("Spell Tome", 101),
    makeCard("Sunlit Lancer", 102, { cardType: "Character", spark: 3 }),
    makeCard("Ash Refrain", 103),
  ];

  it("returns card previews for quoted Gain, Transfigure, and Purge references in text order", () => {
    const previews = findReferencedCardPreviews(
      "Gain 'Spell Tome'. Transfigure 'Sunlit Lancer'. Purge 'Ash Refrain'.",
      cards,
    );

    expect(previews.map((card) => card.name)).toEqual([
      "Spell Tome",
      "Sunlit Lancer",
      "Ash Refrain",
    ]);
  });

  it("deduplicates repeated quoted card names and ignores unknown quoted names", () => {
    const previews = findReferencedCardPreviews(
      "Gain 'Spell Tome'. Purge 'Spell Tome'. Gain 'Unknown Relic'.",
      cards,
    );

    expect(previews.map((card) => card.name)).toEqual(["Spell Tome"]);
  });

  it("returns all cards that share a display name, keyed by distinct UUIDs", () => {
    // Two cards with the same display name but different UUIDs and rules text.
    const cardsWithDuplicate = [
      ...cards,
      makeCard("Spell Tome", 201, { id: asCardId("card-201-alt") }),
    ];

    const previews = findReferencedCardPreviews(
      "Gain 'Spell Tome'.",
      cardsWithDuplicate,
    );

    // Both cards should appear, not just the last-registered one.
    expect(previews.map((card) => card.id)).toEqual(["card-101", "card-201-alt"]);
    expect(previews.map((card) => card.name)).toEqual(["Spell Tome", "Spell Tome"]);
  });
});
