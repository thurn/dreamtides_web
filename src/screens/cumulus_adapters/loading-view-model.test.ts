import { describe, expect, it } from "vitest";
import {
  TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID,
  TUTORIAL_WORLDS_AWAIT_CARD_ID,
} from "../../data/tutorial-cards";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { buildLoadingView } from "./loading-view-model";

function card(cardNumber: number, id: string): CardData {
  return {
    id: asCardId(id),
    name: asCardName(`Fixture ${String(cardNumber)}`),
    cardNumber,
    cardType: cardNumber === 1 ? "Character" : "Event",
    subtype: cardNumber === 1 ? "Fixture" : "",
    isStarter: true,
    energyCost: cardNumber,
    spark: cardNumber === 1 ? 3 : null,
    isFast: false,
    renderedText: "Fixture rules.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

describe("buildLoadingView", () => {
  it("resolves both authored cards by UUID", () => {
    const champion = card(1, TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID);
    const worlds = card(2, TUTORIAL_WORLDS_AWAIT_CARD_ID);
    const view = buildLoadingView(
      new Map([
        [champion.cardNumber, champion],
        [worlds.cardNumber, worlds],
      ]),
    );

    expect(view.runeboundChampion.cardId).toBe(champion.id);
    expect(view.worldsAwait.cardId).toBe(worlds.id);
    expect(view.runeboundChampion.displaySnapshot).toBe(champion);
    expect(view.worldsAwait.displaySnapshot).toBe(worlds);
  });

  it("fails loudly when an authored UUID is absent", () => {
    const champion = card(1, TUTORIAL_RUNEBOUND_CHAMPION_CARD_ID);
    expect(() =>
      buildLoadingView(new Map([[champion.cardNumber, champion]])),
    ).toThrow(TUTORIAL_WORLDS_AWAIT_CARD_ID);
  });
});
