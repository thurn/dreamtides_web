import { describe, expect, it } from "vitest";
import type { CardData } from "../types/cards";
import { createBaseBattleDeckCardDefinition } from "./card-definition";

function makeSampleCard(): CardData {
  return {
    name: "Sample Card",
    id: "11111111-2222-3333-4444-555555555555",
    cardNumber: 42,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 2,
    spark: 3,
    isFast: false,
    renderedText: "Sample card text.",
    imageNumber: 42,
    artOwned: true,
  };
}

describe("createBaseBattleDeckCardDefinition", () => {
  it("carries the source card's UUID as cardId", () => {
    const card = makeSampleCard();
    const definition = createBaseBattleDeckCardDefinition(card);
    expect(definition.cardId).toBe(card.id);
  });

  it("carries multi-cost orb labels so the in-hand card renders every cost orb", () => {
    const card: CardData = { ...makeSampleCard(), energyCost: 2, energyCosts: ["2", "X"] };
    const definition = createBaseBattleDeckCardDefinition(card);
    expect(definition.energyCosts).toEqual(["2", "X"]);
  });

  it("omits energyCosts entirely for a single-cost card (Firebase rejects explicit undefined)", () => {
    const card = makeSampleCard();
    const definition = createBaseBattleDeckCardDefinition(card);
    expect("energyCosts" in definition).toBe(false);
  });
});
