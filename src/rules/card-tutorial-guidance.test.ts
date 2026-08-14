import { afterEach, describe, expect, it } from "vitest";
import { asCardId, asCardName } from "../types/card-identity";
import type { CardData } from "../types/cards";
import type { PoolDraftState } from "../types/draft";
import type { SiteType } from "../types/journey";
import { LayerName } from "../types/layer-name";
import type { TutorialTriggerDefinition } from "../types/tutorial";
import { GLOSSARY_IDS } from "../data/glossary";
import { genesisFoldState, type FoldState } from "./fold-state";
import {
  completeCardTutorialGuidance,
  currentCardTutorialContext,
  currentCardTutorialScreenKey,
  openCardTutorialGuidance,
  registerCardTutorialGuidanceContentProvider,
  selectCardTutorialGuidance,
  type CardTutorialGuidanceContentProvider,
} from "./card-tutorial-guidance";
import { asJourneyId } from "../types/identifiers";
import { asSiteId } from "../types/identifiers";
import { asAtlasNodeId } from "../types/identifiers";
import { asDreamscapeId } from "../types/identifiers";
import { asDeckEntryId } from "../types/identifiers";
import { asTutorialTriggerId } from "../types/identifiers";
import { asGlossaryEntryId } from "../types/identifiers";

function card(id: string, cardNumber: number, renderedText: string): CardData {
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

function trigger(id: string, priority: number): TutorialTriggerDefinition {
  return {
    id: asTutorialTriggerId(id),
    on: ["card-seen", "card-play"],
    priority,
    speaker: "mira",
    duration: 4,
    horizontalOffset: 30,
    verticalOffset: 20,
    bubbleWidth: 500,
    match: {
      kind: "glossary",
      id: asGlossaryEntryId(
        {
          support: GLOSSARY_IDS.support,
          foresee: GLOSSARY_IDS.foresee,
          erode: GLOSSARY_IDS.erode,
        }[id] ?? id,
      ),
    },
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
    hasVisibleTransfigurationReward: () => false,
  };
}

function transfigurationTrigger(): TutorialTriggerDefinition {
  return {
    id: asTutorialTriggerId("transfiguration"),
    on: ["transfiguration-seen"],
    priority: 100,
    speaker: "mira",
    delay: { "transfiguration-seen": 1 },
    duration: 5,
    horizontalOffset: 0,
    verticalOffset: 0,
    bubbleWidth: 500,
    match: { kind: "any" },
    text: "Cards can be [yellow]transfigured[/yellow] to change their cost, spark, or abilities",
  };
}

function siteState(siteId = "site-a", siteType: SiteType = "Shop"): FoldState {
  const base = genesisFoldState({
    seed: "card-tutorial-test",
    reducerVersion: "test",
    createdAt: 0,
    contentConfig: {
      poolVariant: "tides4",
    },
  });
  return {
    ...base,
    journey: {
      ...base.journey,
      hasSeenStartingDeckPopup: true,
      runId: asJourneyId("journey:7"),
      screen: { type: "site", siteId: asSiteId(siteId) },
      atlas: {
        ...base.journey.atlas,
        nodes: {
          [asAtlasNodeId("node")]: {
            id: asAtlasNodeId("node"),
            layer: LayerName.One,
            indexInLayer: 0,
            dreamscapeId: asDreamscapeId("fixture"),
            sites: [
              {
                id: asSiteId(siteId),
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

function transfigurationSiteState(): FoldState {
  const base = siteState("site-a", "Transfiguration");
  return {
    ...base,
    journey: {
      ...base.journey,
      siteRuntime: {
        [asSiteId("site-a")]: {
          kind: "cardChoice",
          choiceKind: "transfiguration",
          entryIds: [asDeckEntryId("entry-a")],
          acceptedEntryIds: [],
          transfigurationOffers: [
            {
              entryId: asDeckEntryId("entry-a"),
              type: "Empowered",
              effectDescription: "Costs 1 less.",
              effectDetails: {},
              previewCard: card("card-a", 1, "Support."),
              essenceCost: 20,
            },
          ],
        },
      },
    },
  };
}

function draftOfferState(
  pickNumber: number,
  currentOffer: number[],
  firstVisit = false,
): FoldState {
  const siteId = "site-a";
  const base = siteState(siteId, "Draft");
  const node = base.journey.atlas.nodes.node;
  if (node === undefined) throw new Error("Fixture node is missing.");
  const draftState: PoolDraftState = {
    mode: "tides4",
    currentOffer,
    activeSiteId: asSiteId(siteId),
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
      visitedSites: firstVisit ? [] : [asSiteId("prior-draft")],
      atlas: {
        ...base.journey.atlas,
        nodes: {
          [asAtlasNodeId("node")]: {
            ...node,
            sites: [
              {
                id: asSiteId("prior-draft"),
                type: "Draft",
                isEnhanced: false,
                isVisited: !firstVisit,
              },
              ...node.sites,
            ],
          },
        },
      },
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
      [asCardId("card-a"), asCardId("card-b")],
      new Set(),
    );
    expect(match?.card?.id).toBe("card-a");
    expect(match?.trigger.id).toBe("foresee");
  });

  it("skips room-seen triggers before considering the next visible card", () => {
    const match = selectCardTutorialGuidance(
      provider(),
      [asCardId("card-a"), asCardId("card-b")],
      new Set([asTutorialTriggerId("support"), asTutorialTriggerId("foresee")]),
    );
    expect(match?.card?.id).toBe("card-b");
    expect(match?.trigger.id).toBe("erode");
  });

  it("selects a site concept without requiring a visible card", () => {
    const conceptProvider: CardTutorialGuidanceContentProvider = {
      ...provider(),
      triggers: [transfigurationTrigger()],
    };
    expect(
      selectCardTutorialGuidance(
        conceptProvider,
        [],
        new Set(),
        "transfiguration-seen",
      ),
    ).toEqual({ card: null, trigger: transfigurationTrigger() });
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
    "Duplication",
    "Augury",
  ] satisfies readonly SiteType[])(
    "does not trigger on the %s screen",
    (siteType) => {
      expect(
        currentCardTutorialScreenKey(siteState("site-a", siteType)),
      ).toBeNull();
    },
  );

  it("is eligible when a Transfiguration site has a usable reward", () => {
    expect(currentCardTutorialContext(transfigurationSiteState())).toEqual({
      screenKey: "journey:7:site:site-a:concept:transfiguration",
      event: "transfiguration-seen",
    });
  });

  it("is eligible when the current Augury contains a transfiguration reward", () => {
    const state = siteState("site-a", "Augury");
    const conceptProvider: CardTutorialGuidanceContentProvider = {
      ...provider(),
      hasVisibleTransfigurationReward: () => true,
    };
    expect(currentCardTutorialContext(state, conceptProvider)).toEqual({
      screenKey: "journey:7:site:site-a:concept:transfiguration",
      event: "transfiguration-seen",
    });
  });

  it("waits for the Exploration actions to be presented before requesting transfiguration guidance", () => {
    const state = siteState("site-a", "Exploration");
    const conceptProvider: CardTutorialGuidanceContentProvider = {
      ...provider(),
      hasVisibleTransfigurationReward: () => true,
    };
    expect(currentCardTutorialContext(state, conceptProvider)).toEqual({
      screenKey: "journey:7:site:site-a:concept:transfiguration",
      event: "transfiguration-seen",
      visibilityGate: "exploration-actions",
    });
  });

  it("is eligible on a persisted Draft offer", () => {
    expect(
      currentCardTutorialScreenKey(draftOfferState(1, [1, 2, 3, 4])),
    ).not.toBeNull();
  });

  it("gives the first-visit Draft tutorial priority over glossary triggers", () => {
    registerCardTutorialGuidanceContentProvider(provider());
    const before = draftOfferState(1, [1, 2, 3, 4], true);
    expect(currentCardTutorialScreenKey(before)).toBeNull();
    expect(
      openCardTutorialGuidance(before, {
        screenKey: `${before.journey.runId}:site:site-a`,
        cardIds: ["card-a", "card-b", "card-c", "card-d"],
      }),
    ).toBeNull();
  });

  it("allows glossary guidance after the first Draft pick", () => {
    expect(
      currentCardTutorialScreenKey(draftOfferState(2, [1, 2, 3, 4], true)),
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
      cardId: asCardId("card-a"),
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

  it("opens the shared transfiguration tutorial once without a card", () => {
    const conceptProvider: CardTutorialGuidanceContentProvider = {
      ...provider(),
      triggers: [transfigurationTrigger()],
    };
    registerCardTutorialGuidanceContentProvider(conceptProvider);
    const before = transfigurationSiteState();
    const screenKey = currentCardTutorialScreenKey(before);
    const opened = openCardTutorialGuidance(before, {
      screenKey,
      cardIds: [],
    });

    expect(opened?.cardTutorialPresentation).toMatchObject({
      screenKey,
      cardId: null,
      triggerId: "transfiguration",
      delay: 1,
      duration: 5,
      text: transfigurationTrigger().text,
    });
    expect(opened?.tutorialTriggerIdsSeen).toEqual(["transfiguration"]);
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
      cardId: asCardId("card-e"),
      triggerId: "erode",
    });
    expect(secondOpened?.cardTutorialScreenKeysSeen).toEqual([
      firstScreenKey,
      secondScreenKey,
    ]);
  });
});
