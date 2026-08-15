import { describe, expect, it } from "vitest";
import { TEST_TUTORIAL_CARD_CONSTANTS } from "../../test/tutorial-configuration-fixture";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { buildLoadingView } from "./loading-view-model";
import { testCardId } from "../../types/test-identities";

const TUTORIAL_LOADING_CHARACTER_CARD_ID =
  TEST_TUTORIAL_CARD_CONSTANTS.loadingScreenCharacterCardId;
const TUTORIAL_LOADING_EVENT_CARD_ID =
  TEST_TUTORIAL_CARD_CONSTANTS.loadingScreenEventCardId;

function card(cardNumber: number, idSeed: string): CardData {
  return {
    id: testCardId(idSeed),
    name: parseCardName(`Fixture ${String(cardNumber)}`),
    cardNumber,
    cardType: cardNumber === 1 ? "Character" : "Event",
    subtype: cardNumber === 1 ? "Warrior" : "",
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
    const champion = card(1, TUTORIAL_LOADING_CHARACTER_CARD_ID);
    const worlds = card(2, TUTORIAL_LOADING_EVENT_CARD_ID);
    const view = buildLoadingView(
      new Map([
        [champion.cardNumber, champion],
        [worlds.cardNumber, worlds],
      ]),
      TEST_TUTORIAL_CARD_CONSTANTS,
    );

    expect(view.loadingCharacter.cardId).toBe(champion.id);
    expect(view.loadingEvent.cardId).toBe(worlds.id);
    expect(view.loadingCharacter.displaySnapshot).toBe(champion);
    expect(view.loadingEvent.displaySnapshot).toBe(worlds);
  });

  it("fails loudly when an authored UUID is absent", () => {
    const champion = card(1, TUTORIAL_LOADING_CHARACTER_CARD_ID);
    expect(() =>
      buildLoadingView(
        new Map([[champion.cardNumber, champion]]),
        TEST_TUTORIAL_CARD_CONSTANTS,
      ),
    ).toThrow(TUTORIAL_LOADING_EVENT_CARD_ID);
  });
});
