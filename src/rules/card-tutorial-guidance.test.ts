import { afterEach, describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { TutorialTriggerDefinition } from "../types/tutorial";
import { LayerName } from "../types/layer-name";
import { genesisFoldState, type FoldState } from "./fold-state";
import {
  completeCardTutorialGuidance,
  currentCardTutorialScreenKey,
  openCardTutorialGuidance,
  registerCardTutorialGuidanceContentProvider,
  selectCardTutorialGuidance,
  type CardTutorialGuidanceContentProvider,
} from "./card-tutorial-guidance";

function card(id: string, renderedText: string): CardData {
  return {
    id: asCardId(id),
    name: asCardName(`Fixture ${id}`),
    cardNumber: id === "card-a" ? 1 : 2,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText,
    imageNumber: id === "card-a" ? 1 : 2,
    artOwned: true,
  };
}

function trigger(
  id: string,
  priority: number,
): TutorialTriggerDefinition {
  return {
    id,
    on: ["card-seen", "card-play"],
    priority,
    speaker: "mira",
    duration: 4,
    verticalOffset: 20,
    bubbleWidth: 500,
    match: { kind: "glossary", id },
    text: `${id} explained.`,
  };
}

function provider(): CardTutorialGuidanceContentProvider {
  const cards = new Map([
    ["card-a", card("card-a", "Support. Foresee 1.")],
    ["card-b", card("card-b", "Erode 2.")],
  ]);
  return {
    triggers: [
      trigger("support", 100),
      trigger("foresee", 50),
      trigger("erode", 100),
    ],
    cardById: (cardId) => cards.get(cardId),
  };
}

function siteState(siteId = "site-a"): FoldState {
  const base = genesisFoldState({
    seed: "card-tutorial-test",
    reducerVersion: "test",
    createdAt: 0,
    contentConfig: {
      poolVariant: "test",
      draftMode: "pool",
      fresh20PackSize: null,
    },
  });
  return {
    ...base,
    journey: {
      ...base.journey,
      hasSeenStartingDeckPopup: true,
      runId: "journey:7",
      screen: { type: "site", siteId },
      atlas: {
        ...base.journey.atlas,
        nodes: {
          node: {
            id: "node",
            layer: LayerName.One,
            indexInLayer: 0,
            dreamscapeId: "fixture",
            biomeName: "Fixture",
            biomeColor: "violet",
            sites: [
              {
                id: siteId,
                type: "Draft",
                isEnhanced: false,
                isVisited: false,
              },
            ],
            position: { x: 0, y: 0 },
            state: "available",
            enhancedSiteType: null,
            forwardIds: [],
            backwardIds: [],
            knownDreamsignId: null,
          },
        },
      },
    },
  };
}

afterEach(() => {
  registerCardTutorialGuidanceContentProvider(null);
});

describe("card tutorial guidance selection", () => {
  it("uses screen order for cards and existing priority rules within a card", () => {
    const match = selectCardTutorialGuidance(
      provider(),
      ["card-a", "card-b"],
      new Set(),
    );
    expect(match?.card.id).toBe("card-a");
    expect(match?.trigger.id).toBe("foresee");
  });

  it("skips room-seen triggers before considering the next visible card", () => {
    const match = selectCardTutorialGuidance(
      provider(),
      ["card-a", "card-b"],
      new Set(["support", "foresee"]),
    );
    expect(match?.card.id).toBe("card-b");
    expect(match?.trigger.id).toBe("erode");
  });
});

describe("card tutorial guidance fold", () => {
  it("does not trigger while the starting-deck modal is pending", () => {
    const state = siteState();
    expect(
      currentCardTutorialScreenKey({
        ...state,
        journey: {
          ...state.journey,
          hasSeenStartingDeckPopup: false,
        },
      }),
    ).toBeNull();
  });

  it("opens one shared card journey and preserves authored bubble settings", () => {
    registerCardTutorialGuidanceContentProvider(provider());
    const before = siteState();
    const screenKey = currentCardTutorialScreenKey(before);
    const opened = openCardTutorialGuidance(before, {
      screenKey,
      cardIds: ["card-a", "card-b"],
    });

    expect(opened?.cardTutorialPresentation).toMatchObject({
      screenKey,
      cardId: "card-a",
      triggerId: "foresee",
      speaker: "mira",
      duration: 4,
      verticalOffset: 20,
      bubbleWidth: 500,
      text: "foresee explained.",
    });
    expect(opened?.tutorialTriggerIdsSeen).toEqual(["foresee"]);
    expect(opened?.cardTutorialScreenKeysSeen).toEqual([screenKey]);
  });

  it("allows no second tutorial on the same screen after the first settles", () => {
    registerCardTutorialGuidanceContentProvider(provider());
    const before = siteState();
    const screenKey = currentCardTutorialScreenKey(before);
    const opened = openCardTutorialGuidance(before, {
      screenKey,
      cardIds: ["card-a", "card-b"],
    });
    expect(opened).not.toBeNull();
    const settled = completeCardTutorialGuidance(opened!, {
      presentationId: opened!.cardTutorialPresentation?.id,
    });
    expect(settled?.cardTutorialPresentation).toBeNull();
    expect(
      openCardTutorialGuidance(settled!, {
        screenKey,
        cardIds: ["card-b"],
      }),
    ).toBeNull();
  });
});
