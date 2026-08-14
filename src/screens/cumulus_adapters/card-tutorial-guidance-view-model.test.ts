import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";

expect.addEqualityTesters([localizedStringSourceEquality]);
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { buildCardTutorialGuidanceView } from "./card-tutorial-guidance-view-model";
import { asPresentationId } from "../../types/identifiers";
import { asCardTutorialScreenKey } from "../../types/identifiers";
import { asTutorialTriggerId } from "../../types/identifiers";

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
        id: asPresentationId("card-tutorial:fixture"),
        screenKey: asCardTutorialScreenKey("journey:1:site:site-a"),
        cardId: CARD.id,
        triggerId: asTutorialTriggerId("support"),
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
      presentationId: asPresentationId("card-tutorial:fixture"),
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

  it("maps a site concept to viewport dialogue without a card source", () => {
    const view = buildCardTutorialGuidanceView(
      {
        id: asPresentationId("card-tutorial:transfiguration"),
        screenKey: asCardTutorialScreenKey(
          "journey:1:site:site-a:concept:transfiguration",
        ),
        cardId: null,
        triggerId: asTutorialTriggerId("transfiguration"),
        speaker: "mira",
        text: "Cards can be [yellow]transfigured[/yellow] to change their cost, spark, or abilities",
        duration: 5,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 500,
      },
      new Map(),
    );

    expect(view).toMatchObject({
      presentationId: asPresentationId("card-tutorial:transfiguration"),
      triggerId: "transfiguration",
      source: { kind: "journey-site" },
    });
  });
});
