import { testJourneySeed } from "../types/test-identities";
import { afterEach, describe, expect, it } from "vitest";
import { parseCardName } from "../types/card-identity";
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
import { parseJourneyId } from "../types/identifiers";
import { parseSiteId } from "../types/identifiers";
import { parseAtlasNodeId } from "../types/identifiers";
import { parseDeckEntryId } from "../types/identifiers";
import { testCardId, testDreamscapeId, testTutorialTriggerId, testGlossaryEntryId } from "../types/test-identities";

function card(idSeed: string, cardNumber: number, renderedText: string): CardData {
  return {
    id: testCardId(idSeed),
    name: parseCardName(`Fixture ${idSeed}`),
    cardNumber,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: 1,
    spark: 1,
    isFast: false,
    renderedText,
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function cardIds(...idSeeds: string[]) {
  return idSeeds.map(testCardId);
}

function trigger(idSeed: string, priority: number): TutorialTriggerDefinition {
  const glossaryId = (() => {
    switch (idSeed) {
      case "support":
        return GLOSSARY_IDS.support;
      case "foresee":
        return GLOSSARY_IDS.foresee;
      case "erode":
        return GLOSSARY_IDS.erode;
      default:
        return testGlossaryEntryId(idSeed);
    }
  })();
  return {
    id: testTutorialTriggerId(idSeed),
    on: ["card-seen", "card-play"],
    priority,
    speaker: "mira",
    duration: 4,
    horizontalOffset: 30,
    verticalOffset: 20,
    bubbleWidth: 500,
    match: {
      kind: "glossary",
      id: glossaryId,
    },
    text: `${idSeed} explained.`,
  };
}

function provider(): CardTutorialGuidanceContentProvider {
  const fixtures = [
    card("card-a", 1, "Support. Foresee 1."),
    card("card-b", 2, "Erode 2."),
    card("card-c", 3, ""),
    card("card-d", 4, ""),
    card("card-e", 5, "Erode 2."),
    card("card-f", 6, ""),
    card("card-g", 7, ""),
    card("card-h", 8, ""),
  ];
  const cards = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
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
    id: testTutorialTriggerId("transfiguration"),
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
    seed: testJourneySeed("card-tutorial-test"),
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
      runId: parseJourneyId("journey:7"),
      screen: { type: "site", siteId: parseSiteId(siteId) },
      atlas: {
        ...base.journey.atlas,
        nodes: {
          [parseAtlasNodeId("node")]: {
            id: parseAtlasNodeId("node"),
            layer: LayerName.One,
            indexInLayer: 0,
            dreamscapeId: testDreamscapeId("fixture"),
            sites: [
              {
                id: parseSiteId(siteId),
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
        [parseSiteId("site-a")]: {
          kind: "cardChoice",
          choiceKind: "transfiguration",
          entryIds: [parseDeckEntryId("entry-a")],
          acceptedEntryIds: [],
          transfigurationOffers: [
            {
              entryId: parseDeckEntryId("entry-a"),
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
  const node = base.journey.atlas.nodes[parseAtlasNodeId("node")];
  if (node === undefined) throw new Error("Fixture node is missing.");
  const draftState: PoolDraftState = {
    mode: "tides4",
    currentOffer,
    activeSiteId: parseSiteId(siteId),
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
      visitedSites: firstVisit ? [] : [parseSiteId("prior-draft")],
      atlas: {
        ...base.journey.atlas,
        nodes: {
          [parseAtlasNodeId("node")]: {
            ...node,
            sites: [
              {
                id: parseSiteId("prior-draft"),
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
      [testCardId("card-a"), testCardId("card-b")],
      new Set(),
    );
    expect(match?.card?.id).toBe(testCardId("card-a"));
    expect(match?.trigger.id).toBe(testTutorialTriggerId("foresee"));
  });

  it("skips room-seen triggers before considering the next visible card", () => {
    const match = selectCardTutorialGuidance(
      provider(),
      [testCardId("card-a"), testCardId("card-b")],
      new Set([testTutorialTriggerId("support"), testTutorialTriggerId("foresee")]),
    );
    expect(match?.card?.id).toBe(testCardId("card-b"));
    expect(match?.trigger.id).toBe(testTutorialTriggerId("erode"));
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
        cardIds: cardIds("card-a", "card-b", "card-c", "card-d"),
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
      cardIds: cardIds("card-a", "card-b", "card-c", "card-d"),
    });

    expect(opened?.cardTutorialPresentation).toMatchObject({
      screenKey,
      cardId: testCardId("card-a"),
      triggerId: testTutorialTriggerId("foresee"),
      speaker: "mira",
      duration: 4,
      horizontalOffset: 30,
      verticalOffset: 20,
      bubbleWidth: 500,
      text: "foresee explained.",
    });
    expect(opened?.tutorialTriggerIdsSeen).toEqual([
      testTutorialTriggerId("foresee"),
    ]);
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
      triggerId: testTutorialTriggerId("transfiguration"),
      delay: 1,
      duration: 5,
      text: transfigurationTrigger().text,
    });
    expect(opened?.tutorialTriggerIdsSeen).toEqual([
      testTutorialTriggerId("transfiguration"),
    ]);
  });

  it("allows no second tutorial on the same screen after the first settles", () => {
    registerCardTutorialGuidanceContentProvider(provider());
    const before = draftOfferState(1, [1, 2, 3, 4]);
    const screenKey = currentCardTutorialScreenKey(before);
    const opened = openCardTutorialGuidance(before, {
      screenKey,
      cardIds: cardIds("card-a", "card-b", "card-c", "card-d"),
    });
    expect(opened).not.toBeNull();
    const settled = completeCardTutorialGuidance(opened!, {
      presentationId: opened!.cardTutorialPresentation?.id,
    });
    expect(settled?.cardTutorialPresentation).toBeNull();
    expect(
      openCardTutorialGuidance(settled!, {
        screenKey,
        cardIds: cardIds("card-b"),
      }),
    ).toBeNull();
  });

  it("allows one tutorial for each subsequent four-card Draft offer", () => {
    registerCardTutorialGuidanceContentProvider(provider());
    const firstOffer = draftOfferState(1, [1, 2, 3, 4]);
    const firstScreenKey = currentCardTutorialScreenKey(firstOffer);
    const firstOpened = openCardTutorialGuidance(firstOffer, {
      screenKey: firstScreenKey,
      cardIds: cardIds("card-a", "card-b", "card-c", "card-d"),
    });
    const firstSettled = completeCardTutorialGuidance(firstOpened!, {
      presentationId: firstOpened!.cardTutorialPresentation?.id,
    });
    expect(
      openCardTutorialGuidance(firstSettled!, {
        screenKey: firstScreenKey,
        cardIds: cardIds("card-a", "card-b", "card-c", "card-d"),
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
        cardIds: cardIds("card-a", "card-b", "card-c", "card-d"),
      }),
    ).toBeNull();

    const secondOpened = openCardTutorialGuidance(secondOffer, {
      screenKey: secondScreenKey,
      cardIds: cardIds("card-e", "card-f", "card-g", "card-h"),
    });
    expect(secondOpened?.cardTutorialPresentation).toMatchObject({
      screenKey: secondScreenKey,
      cardId: testCardId("card-e"),
      triggerId: testTutorialTriggerId("erode"),
    });
    expect(secondOpened?.cardTutorialScreenKeysSeen).toEqual([
      firstScreenKey,
      secondScreenKey,
    ]);
  });
});
