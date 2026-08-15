import { describe, expect, it } from "vitest";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";

expect.addEqualityTesters([localizedStringSourceEquality]);
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { buildCardTutorialGuidanceView } from "./card-tutorial-guidance-view-model";
import { parsePresentationId } from "../../types/identifiers";
import { parseCardTutorialScreenKey } from "../../types/identifiers";
import { testCardId, testTutorialTriggerId } from "../../types/test-identities";

const CARD: CardData = {
  id: testCardId("card-a"),
  name: parseCardName("Fixture Card"),
  cardNumber: 1,
  cardType: "Character",
  subtype: "Warrior",
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
        id: parsePresentationId("card-tutorial:fixture"),
        screenKey: parseCardTutorialScreenKey("journey:1:site:site-a"),
        cardId: CARD.id,
        triggerId: testTutorialTriggerId("support"),
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
      presentationId: parsePresentationId("card-tutorial:fixture"),
      triggerId: testTutorialTriggerId("support"),
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
        id: parsePresentationId("card-tutorial:transfiguration"),
        screenKey: parseCardTutorialScreenKey(
          "journey:1:site:site-a:concept:transfiguration",
        ),
        cardId: null,
        triggerId: testTutorialTriggerId("transfiguration"),
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
      presentationId: parsePresentationId("card-tutorial:transfiguration"),
      triggerId: testTutorialTriggerId("transfiguration"),
      source: { kind: "journey-site" },
    });
  });
});
