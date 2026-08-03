import { describe, expect, it } from "vitest";
import type { JourneyContent } from "../../data/journey-content";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type { ExplorationSiteRuntime, SiteState } from "../../types/journey";
import { createDefaultState } from "../../state/journey-context";
import {
  buildExplorationSiteView,
  resolveExplorationGuide,
} from "./exploration-view-model";

const sourceId = asCardId("161482b6-af07-4d9e-822d-8c738672beb9");

function card(id: CardData["id"], cardNumber: number): CardData {
  return {
    id,
    name: asCardName(`Fixture Card ${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "Survivor",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "A synthetic observable rule.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

const explorationSite: SiteState & { type: "Exploration" } = {
  id: "site-exploration-fixture",
  type: "Exploration",
  isEnhanced: true,
  isVisited: false,
};

const guide: DreamGuideContent = {
  id: "fixture-layaway",
  name: "Fixture Guide",
  homeDreamscapeId: "fixture-dreamscape",
  siteType: "Exploration",
  dialog: ["Every card dreams. Draw one, and we'll step inside."],
  homeSpecialty: "Fixture specialty.",
};

describe("exploration-view-model", () => {
  it("builds authored narrative, two actions, and a persisted response", () => {
    const source = card(sourceId, 17);
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "entry-a",
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
      ],
    };
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId: "action-a",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: "action-b",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: "action-b",
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: [],
        essenceGained: 0,
      },
    };
    const content = {
      cardDatabase: new Map([[source.cardNumber, source]]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasConfig: { completionLevels: [] },
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: "action-a",
                label: "First choice",
                effectText: "Purge a card and copy another.",
                responseText: "The first response.",
                effectKind: "purge-and-copy",
              },
              {
                id: "action-b",
                label: "Second choice",
                effectText: "Gain the card.",
                responseText: "The second response.",
                effectKind: "gain-card",
                cardId: source.id,
              },
            ],
          },
        ],
      },
    } as unknown as JourneyContent;

    const view = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      runtime,
      state,
      content,
    });

    expect(resolveExplorationGuide([guide])).toBe(guide);
    expect(view).toMatchObject({
      siteId: explorationSite.id,
      narrative: "The authored scene appears.",
      actions: [
        { id: "action-a", followup: { kind: "cards" } },
        { id: "action-b", followup: { kind: "none" } },
      ],
      response: {
        actionLabel: "Second choice",
        text: "The second response.",
      },
      card: { cardId: source.id },
    });
  });

  it("omits already-transfigured cards from a fixed transfiguration choice", () => {
    const source = card(sourceId, 17);
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "entry-eligible",
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "entry-transfigured",
          cardNumber: source.cardNumber,
          transfiguration: "Inspired" as const,
          isBane: false,
        },
      ],
    };
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId: "gather-light",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: "gain-card",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: null,
    };
    const content = {
      cardDatabase: new Map([[source.cardNumber, source]]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasConfig: { completionLevels: [] },
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: "gather-light",
                label: "Gather the Falling Light",
                effectText: "Transfigure a cheap Character.",
                responseText: "The light gathers.",
                effectKind: "transfigure-fixed-selected",
                predicate: "cheap-character",
                transfiguration: "Kindled",
              },
              {
                id: "gain-card",
                label: "Gain the card",
                effectText: "Gain the card.",
                responseText: "The card joins you.",
                effectKind: "gain-card",
                cardId: source.id,
              },
            ],
          },
        ],
      },
    } as unknown as JourneyContent;

    const view = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      runtime,
      state,
      content,
    });
    if (view === null) throw new Error("Expected Exploration view");

    expect(view.actions[0].followup).toMatchObject({
      kind: "cards",
      cards: [{ entryId: "entry-eligible" }],
    });
  });
});
