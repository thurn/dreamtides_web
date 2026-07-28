import { describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { buildCardTutorialGuidanceView } from "./card-tutorial-guidance-view-model";

const CARD: CardData = {
  id: asCardId("card-a"),
  name: asCardName("Fixture Card"),
  cardNumber: 1,
  cardType: "Character",
  subtype: "Fixture",
  isStarter: false,
  energyCost: 1,
  spark: 2,
  isFast: false,
  renderedText: "Support.",
  imageNumber: 1,
  artOwned: true,
};

describe("buildCardTutorialGuidanceView", () => {
  it("maps the shared presentation to Mira, the canonical card, and bubble settings", () => {
    const view = buildCardTutorialGuidanceView(
      {
        id: "card-tutorial:fixture",
        screenKey: "journey:1:site:site-a",
        cardId: CARD.id,
        triggerId: "support",
        speaker: "mira",
        text: "Support helps the character in front.",
        duration: 5,
        horizontalOffset: 24,
        verticalOffset: -20,
        bubbleWidth: 420,
      },
      new Map([[CARD.cardNumber, CARD]]),
    );

    expect(view).toMatchObject({
      presentationId: "card-tutorial:fixture",
      triggerId: "support",
      duration: 5,
      horizontalOffset: 24,
      verticalOffset: -20,
      bubbleWidth: 420,
      dialogue: {
        speakerName: "Mira",
        text: "Support helps the character in front.",
      },
      source: {
        kind: "journey-card",
        cardId: CARD.id,
        model: { cardId: CARD.id, displaySnapshot: CARD },
      },
    });
  });
});
