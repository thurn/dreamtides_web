import { afterEach, describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { PoolDraftState } from "../types/draft";
import type { SiteType } from "../types/journey";
import { LayerName } from "../types/layer-name";
import type { TutorialTriggerDefinition } from "../types/tutorial";
import { genesisFoldState, type FoldState } from "./fold-state";
import {
  completeCardTutorialGuidance,
  currentCardTutorialScreenKey,
  openCardTutorialGuidance,
  registerCardTutorialGuidanceContentProvider,
  selectCardTutorialGuidance,
  type CardTutorialGuidanceContentProvider,
} from "./card-tutorial-guidance";

function card(
  id: string,
  cardNumber: number,
  renderedText: string,
): CardData {
  return {
    id: asCardId(id),
    name: asCardName(`Fixture ${id}`),
    cardNumber,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText,
    imageNumber: cardNumber,
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
    horizontalOffset: 30,
    verticalOffset: 20,
    bubbleWidth: 500,
    match: { kind: "glossary", id },
    text: `${id} explained.`,
  };
}

function provider(): CardTutorialGuidanceContentProvider {
  const cards = new Map([
    ["card-a", card("card-a", 1, "Support. Foresee 1.")],
    ["card-b", card("card-b", 2, "Erode 2.")],
    ["card-c", card("card-c", 3, "")],
    ["card-d", card("card-d", 4, "")],
    ["card-e", card("card-e", 5, "Erode 2.")],
    ["card-f", card("card-f", 6, "")],
    ["card-g", card("card-g", 7, "")],
    ["card-h", card("card-h", 8, "")],
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

function siteState(
  siteId = "site-a",
  siteType: SiteType = "Shop",
): FoldState {
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
                type: siteType,
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

function draftOfferState(
  pickNumber: number,
  currentOffer: number[],
): FoldState {
  const siteId = "site-a";
  const base = siteState(siteId, "Draft");
  const draftState: PoolDraftState = {
    mode: "pool",
    currentOffer,
    activeSiteId: siteId,
    pickNumber,
    sitePicksCompleted: pickNumber - 1,
    siteShownCardNumbers: [...currentOffer],
    draftPoolCopiesByCard: {},
    remainingCopiesByCard: {},
  };
  return {
    ...base,
    journey: {
      ...base.journey,
      draftState,
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
    const state = draftOfferState(1, [1, 2, 3, 4]);
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

  it.each([
    "Shop",
    "Purge",
    "Transfiguration",
    "Duplication",
    "DreamAugury",
  ] satisfies readonly SiteType[])(
    "does not trigger on the %s screen",
    (siteType) => {
      expect(
        currentCardTutorialScreenKey(siteState("site-a", siteType)),
      ).toBeNull();
    },
  );

  it("is eligible on a persisted Draft offer", () => {
    expect(
      currentCardTutorialScreenKey(draftOfferState(1, [1, 2, 3, 4])),
    ).not.toBeNull();
  });

  it("opens one shared card journey and preserves authored bubble settings", () => {
    registerCardTutorialGuidanceContentProvider(provider());
    const before = draftOfferState(1, [1, 2, 3, 4]);
    const screenKey = currentCardTutorialScreenKey(before);
    const opened = openCardTutorialGuidance(before, {
      screenKey,
      cardIds: ["card-a", "card-b", "card-c", "card-d"],
    });

    expect(opened?.cardTutorialPresentation).toMatchObject({
      screenKey,
      cardId: "card-a",
      triggerId: "foresee",
      speaker: "mira",
      duration: 4,
      horizontalOffset: 30,
      verticalOffset: 20,
      bubbleWidth: 500,
      text: "foresee explained.",
    });
    expect(opened?.tutorialTriggerIdsSeen).toEqual(["foresee"]);
    expect(opened?.cardTutorialScreenKeysSeen).toEqual([screenKey]);
  });

  it("allows no second tutorial on the same screen after the first settles", () => {
    registerCardTutorialGuidanceContentProvider(provider());
    const before = draftOfferState(1, [1, 2, 3, 4]);
    const screenKey = currentCardTutorialScreenKey(before);
    const opened = openCardTutorialGuidance(before, {
      screenKey,
      cardIds: ["card-a", "card-b", "card-c", "card-d"],
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

  it("allows one tutorial for each subsequent four-card Draft offer", () => {
    registerCardTutorialGuidanceContentProvider(provider());
    const firstOffer = draftOfferState(1, [1, 2, 3, 4]);
    const firstScreenKey = currentCardTutorialScreenKey(firstOffer);
    const firstOpened = openCardTutorialGuidance(firstOffer, {
      screenKey: firstScreenKey,
      cardIds: ["card-a", "card-b", "card-c", "card-d"],
    });
    const firstSettled = completeCardTutorialGuidance(firstOpened!, {
      presentationId: firstOpened!.cardTutorialPresentation?.id,
    });
    expect(
      openCardTutorialGuidance(firstSettled!, {
        screenKey: firstScreenKey,
        cardIds: ["card-a", "card-b", "card-c", "card-d"],
      }),
    ).toBeNull();

    const secondOffer = {
      ...firstSettled!,
      journey: {
        ...firstSettled!.journey,
        draftState: {
          ...firstSettled!.journey.draftState!,
          currentOffer: [5, 6, 7, 8],
          pickNumber: 2,
          sitePicksCompleted: 1,
        },
      },
    };
    const secondScreenKey = currentCardTutorialScreenKey(secondOffer);
    expect(secondScreenKey).not.toBe(firstScreenKey);
    expect(
      openCardTutorialGuidance(secondOffer, {
        screenKey: secondScreenKey,
        cardIds: ["card-a", "card-b", "card-c", "card-d"],
      }),
    ).toBeNull();

    const secondOpened = openCardTutorialGuidance(secondOffer, {
      screenKey: secondScreenKey,
      cardIds: ["card-e", "card-f", "card-g", "card-h"],
    });
    expect(secondOpened?.cardTutorialPresentation).toMatchObject({
      screenKey: secondScreenKey,
      cardId: "card-e",
      triggerId: "erode",
    });
    expect(secondOpened?.cardTutorialScreenKeysSeen).toEqual([
      firstScreenKey,
      secondScreenKey,
    ]);
  });
});
