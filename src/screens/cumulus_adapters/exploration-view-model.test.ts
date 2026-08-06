import { describe, expect, it } from "vitest";
import type { JourneyContent } from "../../data/journey-content";
import type { ExplorationActionContent } from "../../data/exploration";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type {
  ExplorationResolution,
  ExplorationSiteRuntime,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { createDefaultState } from "../../state/journey-context";
import { MINIMAL_ATLAS_DATA } from "../../__test-helpers__/atlas-fixtures";
import {
  buildExplorationActionEffect,
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
  it("builds authored narrative, two actions, and persisted reward state", () => {
    const source = card(sourceId, 17);
    const gainedDreamsign = {
      id: "gained-dreamsign-id",
      name: "Gained Dreamsign",
      effectDescription: "A synthetic reward sign.",
    };
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
      dreamsigns: [gainedDreamsign],
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
        actionId: "action-a",
        gainedCardIds: [source.id],
        gainedDreamsignIds: [gainedDreamsign.id],
        purgedCardIds: [source.id],
        purgedEntryIds: ["entry-purged"],
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
      atlasData: MINIMAL_ATLAS_DATA,
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
                effectKind: "purge-and-copy",
              },
              {
                id: "action-b",
                label: "Second choice",
                effectText: "Gain the card.",
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
      resolvedActionId: "action-a",
      reward: {
        objects: {
          cards: [{ cardId: source.id }],
          purgedCards: [
            { entryId: "entry-purged", model: { cardId: source.id } },
          ],
          dreamsigns: [{ id: gainedDreamsign.id }],
        },
        deckModification: null,
      },
      card: { cardId: source.id },
    });
  });

  it("builds a UUID-keyed deck-wide spark reward from the affected entries", () => {
    const source = card(sourceId, 17);
    const event = {
      ...card(asCardId("f0000000-0000-4000-8000-000000000018"), 18),
      cardType: "Event" as const,
      spark: null,
    };
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "entry-character",
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
          sparkBonus: 1,
        },
        {
          entryId: "entry-event",
          cardNumber: event.cardNumber,
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
          actionId: "increase-spark",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: "gain-source",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: "increase-spark",
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: ["entry-character"],
        essenceGained: 0,
      },
    };
    const content = {
      cardDatabase: new Map([
        [source.cardNumber, source],
        [event.cardNumber, event],
      ]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: "increase-spark",
                label: "Receive Their Blessing",
                effectText: "All characters in your deck gain +1✦",
                effectKind: "increase-spark-all",
                sparkBonus: 1,
              },
              {
                id: "gain-source",
                label: "Gain the source",
                effectText: "Gain the source card.",
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

    expect(view?.reward).toMatchObject({
      objects: { cards: [], purgedCards: [], dreamsigns: [] },
      deckModification: {
        kind: "spark",
        headline: "+1 ✦",
        announcement: "All characters in your deck gain +1✦",
        selectionColor: "spark",
        cards: [
          {
            entryId: "entry-character",
            model: {
              cardId: source.id,
              displaySnapshot: { spark: 3 },
            },
          },
        ],
      },
    });
  });

  it("builds fast and composite cost rewards from post-resolution deck snapshots", () => {
    const source = card(sourceId, 17);
    const nightmare = {
      ...card(NIGHTMARE_CARD_ID, 18),
      name: asCardName("Nightmare"),
      rarity: "Special" as const,
    };
    const actionOffers = ["make-fast", "reduce-cost"].map((actionId) => ({
      actionId,
      offeredCardIds: [],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
    }));
    const content = {
      cardDatabase: new Map([
        [source.cardNumber, source],
        [nightmare.cardNumber, nightmare],
      ]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: "make-fast",
                label: "Accept the charge",
                effectText: "All cards in your deck become ❖ (fast)",
                effectKind: "make-fast-all",
              },
              {
                id: "reduce-cost",
                label: "Overload the aperture",
                effectText:
                  "All cards in your deck are reduced in cost by 1●. Gain 3 Nightmare cards.",
                effectKind: "reduce-cost-all-and-gain-nightmares",
                energyCostReduction: 1,
                nightmareCount: 3,
              },
            ],
          },
        ],
      },
    } as unknown as JourneyContent;
    const baseResolution = {
      gainedDreamsignIds: [],
      purgedCardIds: [],
      affectedEntryIds: ["entry-character"],
      essenceGained: 0,
    };

    const fastView = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      runtime: {
        kind: "exploration",
        encounterCardId: source.id,
        actionOffers,
        resolution: {
          ...baseResolution,
          actionId: "make-fast",
          gainedCardIds: [],
        },
      },
      state: {
        ...createDefaultState(),
        deck: [
          {
            entryId: "entry-character",
            cardNumber: source.cardNumber,
            transfiguration: null,
            keywordModification: { fast: true },
            isBane: false,
          },
        ],
      },
      content,
    });

    expect(fastView?.reward).toMatchObject({
      objects: { cards: [], purgedCards: [], dreamsigns: [] },
      deckModification: {
        kind: "fast",
        headline: "Fast",
        selectionColor: "accent-bright",
        cards: [
          {
            entryId: "entry-character",
            model: { displaySnapshot: { isFast: true } },
          },
        ],
      },
    });

    const costView = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      runtime: {
        kind: "exploration",
        encounterCardId: source.id,
        actionOffers,
        resolution: {
          ...baseResolution,
          actionId: "reduce-cost",
          gainedCardIds: [NIGHTMARE_CARD_ID, NIGHTMARE_CARD_ID, NIGHTMARE_CARD_ID],
        },
      },
      state: {
        ...createDefaultState(),
        deck: [
          {
            entryId: "entry-character",
            cardNumber: source.cardNumber,
            transfiguration: null,
            keywordModification: { energyCostReduction: 1 },
            isBane: false,
          },
        ],
      },
      content,
    });

    expect(costView?.reward).toMatchObject({
      objects: {
        cards: [
          { cardId: NIGHTMARE_CARD_ID },
          { cardId: NIGHTMARE_CARD_ID },
          { cardId: NIGHTMARE_CARD_ID },
        ],
        dreamsigns: [],
      },
      deckModification: {
        kind: "energy-cost",
        headline: "−1 ●",
        selectionColor: "energy",
        cards: [
          {
            entryId: "entry-character",
            model: { displaySnapshot: { energyCost: 1 } },
          },
        ],
      },
    });
  });

  it("omits already-transfigured and fixed-form-ineligible cards", () => {
    const source = card(sourceId, 17);
    const zeroCost = {
      ...card(asCardId("f0000000-0000-4000-8000-000000000017"), 18),
      energyCost: 0,
    };
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
        {
          entryId: "entry-zero-cost",
          cardNumber: zeroCost.cardNumber,
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
      cardDatabase: new Map([
        [source.cardNumber, source],
        [zeroCost.cardNumber, zeroCost],
      ]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
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
                effectText: "Apply Empowered to a chosen card.",
                effectKind: "transfigure-fixed-selected",
                transfiguration: "Empowered",
              },
              {
                id: "gain-card",
                label: "Gain the card",
                effectText: "Gain the card.",
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
      selectionOperation: "transfigure",
      cards: [{ entryId: "entry-eligible" }],
    });
    expect(view.actions[0].effectText).toBe(
      "Apply Empowered to a chosen card. (Halve its ● cost, rounded down)",
    );
  });

  it("resolves a deck-card placeholder to one UUID-keyed transfigured preview", () => {
    const source = card(sourceId, 17);
    const target = {
      ...card(asCardId("f0000000-0000-4000-8000-000000000018"), 18),
      cardType: "Event" as const,
      subtype: "",
      spark: null,
    };
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "entry-already-transfigured",
          cardNumber: target.cardNumber,
          transfiguration: "Kindled" as const,
          isBane: false,
        },
        {
          entryId: "entry-target",
          cardNumber: target.cardNumber,
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
          actionId: "inspire-event",
          offeredCardIds: [],
          offeredDeckEntryIds: ["entry-target"],
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
      cardDatabase: new Map([
        [source.cardNumber, source],
        [target.cardNumber, target],
      ]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: "inspire-event",
                label: "Present a Written Charm",
                effectText: "Apply Inspired to $DECK_CARD",
                effectKind: "transfigure-fixed-selected",
                selection: { "$DECK_CARD": { predicate: "Event" } },
                predicate: "event",
                transfiguration: "Inspired",
              },
              {
                id: "gain-card",
                label: "Gain the card",
                effectText: "Gain the card.",
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

    expect(view.actions[0]).toMatchObject({
      effectText:
        `Apply Inspired to ${target.name}` +
        ' (Add "Draw a card" to its rules text)',
      effectParts: [
        { kind: "text", text: "Apply Inspired to " },
        {
          kind: "entity",
          entity: {
            kind: "card",
            card: {
              id: target.id,
              renderedText: `${target.renderedText} Draw a card.`,
            },
            transfiguration: { type: "Inspired" },
          },
        },
        {
          kind: "text",
          text: ' (Add "Draw a card" to its rules text)',
        },
      ],
      followup: { kind: "none" },
      automaticSelection: { entryIds: ["entry-target"] },
      available: true,
    });
  });

  it("renders a minted subtype target by name and resolves it without a picker", () => {
    const source = card(sourceId, 17);
    const target = {
      ...card(asCardId("f0000000-0000-4000-8000-000000000019"), 19),
      subtype: "Warrior",
    };
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "entry-target",
          cardNumber: target.cardNumber,
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
          actionId: "become-survivor",
          offeredCardIds: [],
          offeredDeckEntryIds: ["entry-target"],
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
      cardDatabase: new Map([
        [source.cardNumber, source],
        [target.cardNumber, target],
      ]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: "become-survivor",
                label: "Fit a matching hood",
                effectText: "Change $DECK_CARD to become a Survivor",
                effectKind: "change-subtype-selected",
                selection: {
                  "$DECK_CARD": { predicate: "≤2● cost Character" },
                },
                predicate: "cheap-character",
                subtype: "Survivor",
              },
              {
                id: "gain-card",
                label: "Gain the card",
                effectText: "Gain the card.",
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

    expect(view.actions[0]).toMatchObject({
      effectText: `Change ${target.name} to become a Survivor`,
      effectParts: [
        { kind: "text", text: "Change " },
        {
          kind: "entity",
          entity: { kind: "card", card: { id: target.id } },
        },
        { kind: "text", text: " to become a Survivor" },
      ],
      followup: { kind: "none" },
      automaticSelection: { entryIds: ["entry-target"] },
      available: true,
    });
    expect(view.actions[0].effectText).not.toContain("$DECK_CARD");

    const resolvedView = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      runtime: {
        ...runtime,
        resolution: {
          actionId: "become-survivor",
          selection: { entryIds: ["entry-target"] },
          gainedCardIds: [],
          gainedDreamsignIds: [],
          purgedCardIds: [],
          affectedEntryIds: ["entry-target"],
          essenceGained: 0,
          chosenSubtype: "Survivor",
        },
      },
      state,
      content,
    });
    expect(resolvedView?.reward).toMatchObject({
      deckModification: {
        announcement: `Change ${target.name} to become a Survivor`,
      },
    });
  });

  it("builds the persisted before-and-after reward for a fixed transfiguration", () => {
    const source = card(sourceId, 17);
    const target = card(
      asCardId("f0000000-0000-4000-8000-000000000018"),
      18,
    );
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "entry-target",
          cardNumber: target.cardNumber,
          transfiguration: "Kindled" as const,
          isBane: false,
        },
      ],
    };
    const actionId = "kindle-target";
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId,
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
      resolution: {
        actionId,
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: ["entry-target"],
        essenceGained: 0,
      },
    };
    const content = {
      cardDatabase: new Map([
        [source.cardNumber, source],
        [target.cardNumber, target],
      ]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: actionId,
                label: "Gather the Falling Light",
                effectText: "Apply Kindled to a chosen card.",
                effectKind: "transfigure-fixed-selected",
                predicate: "survivor",
                transfiguration: "Kindled",
              },
              {
                id: "gain-card",
                label: "Gain the card",
                effectText: "Gain the card.",
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

    expect(view?.reward).toMatchObject({
      kind: "transfiguration",
      entryId: "entry-target",
      before: {
        cardId: target.id,
        displaySnapshot: { spark: 2 },
      },
      after: {
        cardId: target.id,
        displaySnapshot: { spark: 4 },
        transfiguration: { type: "Kindled", sparkChanged: true },
      },
    });
  });

  it("builds the standard free-form transfiguration picker with zero-cost forms", () => {
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
          actionId: "transfigure",
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
      atlasData: MINIMAL_ATLAS_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: "transfigure",
                label: "Send a possession through",
                effectText: "Apply a transfiguration to a chosen card",
                effectKind: "transfigure-selected",
                count: 1,
              },
              {
                id: "gain-card",
                label: "Gain the card",
                effectText: "Gain the card.",
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
      kind: "transfiguration",
      candidates: [
        {
          entryId: "entry-eligible",
          forms: [
            { type: "Empowered", essenceCost: 0, affordable: true },
            { type: "Kindled", essenceCost: 0, affordable: true },
          ],
        },
      ],
    });
  });

  it("builds an identity-safe Essence calculation from the affected deck entries", () => {
    const source = card(sourceId, 17);
    const firstSpiritAnimal = {
      ...card(asCardId("f0000000-0000-4000-8000-000000000018"), 18),
      subtype: "Spirit Animal",
    };
    const secondSpiritAnimal = {
      ...card(asCardId("f0000000-0000-4000-8000-000000000019"), 19),
      subtype: "Spirit Animal",
    };
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "spirit-entry-a",
          cardNumber: firstSpiritAnimal.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "spirit-entry-b",
          cardNumber: secondSpiritAnimal.cardNumber,
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
          actionId: "gain-essence",
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
      resolution: {
        actionId: "gain-essence",
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: ["spirit-entry-a", "spirit-entry-b"],
        essenceGained: 30,
      },
    };
    const content = {
      cardDatabase: new Map([
        [source.cardNumber, source],
        [firstSpiritAnimal.cardNumber, firstSpiritAnimal],
        [secondSpiritAnimal.cardNumber, secondSpiritAnimal],
      ]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: "gain-essence",
                label: "Sound a gathering call",
                effectText:
                  "Gain 15 essence for each Spirit Animal card in your deck",
                effectKind: "gain-essence-per-card",
                predicate: "spirit-animal",
                essencePerCard: 15,
              },
              {
                id: "gain-card",
                label: "Gain the card",
                effectText: "Gain the card.",
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

    expect(view?.reward).toMatchObject({
      kind: "essence",
      cards: [
        { entryId: "spirit-entry-a", model: { cardId: firstSpiritAnimal.id } },
        { entryId: "spirit-entry-b", model: { cardId: secondSpiritAnimal.id } },
      ],
      essencePerCard: 15,
      totalEssence: 30,
    });
  });

  it("resolves an offered-card placeholder and presents the UUID-backed card", () => {
    const source = card(sourceId, 17);
    const offered = card(
      asCardId("f0000000-0000-4000-8000-000000000018"),
      18,
    );
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
          actionId: "gain-offered",
          offeredCardIds: [offered.id],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: "increase-spark",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: null,
    };
    const content = {
      cardDatabase: new Map([
        [source.cardNumber, source],
        [offered.cardNumber, offered],
      ]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: "gain-offered",
                label: "Invite someone through",
                effectText: "Gain $OFFERED_CARD",
                effectKind: "gain-offered-card",
                predicate: "cheap-character",
              },
              {
                id: "increase-spark",
                label: "Receive Their Blessing",
                effectText: "All characters in your deck gain +1✦",
                effectKind: "increase-spark-all",
                sparkBonus: 1,
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

    expect(view.actions[0]).toMatchObject({
      effectText: `Gain ${offered.name}`,
      effectParts: [
        { kind: "text", text: "Gain " },
        {
          kind: "entity",
          entity: { kind: "card", card: { id: offered.id } },
        },
      ],
      available: true,
      followup: { kind: "none" },
      automaticSelection: { cardIds: [offered.id] },
    });
    expect(view.actions[1].followup).toEqual({ kind: "none" });
  });

  it("builds UUID-backed references for fixed cards, Nightmare, and Dreamsigns", () => {
    const fixedCard = card(
      asCardId("f0000000-0000-4000-8000-000000000019"),
      19,
    );
    const nightmareCard = {
      ...card(NIGHTMARE_CARD_ID, 20),
      name: asCardName("Nightmare"),
    };
    const dreamsignId = "f0000000-0000-4000-8000-000000000021";
    const content = {
      cardDatabase: new Map([
        [fixedCard.cardNumber, fixedCard],
        [nightmareCard.cardNumber, nightmareCard],
      ]),
      dreamAvatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [
        {
          id: dreamsignId,
          name: "Fixture Sign",
          effectDescription: "Draw a card, then discard a card.",
          imageName: "fixture.png",
          imageAlt: "A fixture sign",
        },
      ],
      dreamscapes: [],
      affiliations: [],
      guides: [],
      atlasData: MINIMAL_ATLAS_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [],
      },
    } as unknown as JourneyContent;
    const offer = {
      actionId: "fixture-action",
      offeredCardIds: [],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
    };

    const fixed = buildExplorationActionEffect(
      {
        id: "fixed-card",
        label: "Gain a card",
        effectText: `Gain ${fixedCard.name}`,
        effectKind: "gain-card",
        cardId: fixedCard.id,
      },
      offer,
      content,
    );
    const nightmare = buildExplorationActionEffect(
      {
        id: "nightmare-card",
        label: "Accept the cost",
        effectText: "Gain 3 Nightmare cards.",
        effectKind: "reduce-cost-all-and-gain-nightmares",
        nightmareCount: 3,
      },
      offer,
      content,
    );
    const dreamsign = buildExplorationActionEffect(
      {
        id: "fixed-dreamsign",
        label: "Take the sign",
        effectText: "Gain Fixture Sign",
        effectKind: "gain-dreamsign",
        dreamsignId,
      },
      offer,
      content,
    );

    expect(fixed.effectParts).toMatchObject([
      { kind: "text", text: "Gain " },
      {
        kind: "entity",
        entity: { kind: "card", card: { id: fixedCard.id } },
      },
    ]);
    expect(nightmare.effectText).toBe("Gain 3 Nightmare cards.");
    expect(nightmare.effectParts).toMatchObject([
      { kind: "text", text: "Gain 3 " },
      {
        kind: "entity",
        entity: {
          kind: "card",
          card: { id: nightmareCard.id },
          copies: 3,
        },
      },
      { kind: "text", text: " cards." },
    ]);
    expect(dreamsign.effectParts).toMatchObject([
      { kind: "text", text: "Gain " },
      {
        kind: "entity",
        entity: { kind: "dreamsign", dreamsign: { id: dreamsignId } },
      },
    ]);
  });

  it("builds Dreamsign follow-ups with UUID-keyed selection contracts", () => {
    const source = card(sourceId, 17);
    const heldDreamsignId = "held-dreamsign-id";
    const heldDreamsign = {
      id: heldDreamsignId,
      name: "Held Dreamsign",
      effectDescription: "A synthetic sign effect.",
      imageName: "held-dreamsign.webp",
      imageAlt: "Held Dreamsign art",
    };
    const state = {
      ...createDefaultState(),
      dreamsigns: [heldDreamsign],
      maxDreamsigns: 1,
    };
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId: "random-dreamsign",
          offeredCardIds: [],
          offeredDreamsignIds: ["offered-dreamsign-id"],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: "purge-dreamsign",
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
      atlasData: MINIMAL_ATLAS_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [heldDreamsign],
        encounters: [{
          cardId: source.id,
          prose: "The authored scene appears.",
          actions: [
            {
              id: "random-dreamsign",
              label: "Read the pattern",
              effectText: "Gain a random dreamsign",
              effectKind: "gain-random-dreamsign",
            },
            {
              id: "purge-dreamsign",
              label: "Break the pattern",
              effectText: "Purge a dreamsign for essence",
              effectKind: "purge-dreamsign-for-essence",
              essence: 50,
            },
          ],
        }],
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

    expect(view.actions[0]).toMatchObject({
      available: true,
      followup: {
        kind: "dreamsigns",
        selectionKey: "replacedDreamsignId",
        dreamsigns: [{ id: heldDreamsignId }],
      },
    });
    expect(view.actions[1]).toMatchObject({
      available: true,
      followup: {
        kind: "dreamsigns",
        selectionKey: "dreamsignId",
        dreamsigns: [
          {
            id: heldDreamsignId,
            imageName: "held-dreamsign.webp",
            imageAlt: "Held Dreamsign art",
          },
        ],
      },
    });

    const resolvedView = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      runtime: {
        ...runtime,
        resolution: {
          actionId: "purge-dreamsign",
          gainedCardIds: [],
          gainedDreamsignIds: [],
          purgedCardIds: [],
          purgedDreamsignIds: [heldDreamsignId],
          affectedEntryIds: [],
          essenceGained: 50,
        },
      },
      state: { ...state, dreamsigns: [], essence: state.essence + 50 },
      content,
    });

    expect(resolvedView?.reward).toEqual({
      kind: "purged-dreamsign-essence",
      dreamsign: heldDreamsign,
      totalEssence: 50,
    });
  });

  it("builds semantic outcomes for copied cards, next-battle modifiers, Reclaim, and Dream Avatar replacement", () => {
    const source = card(sourceId, 17);
    const survivor = card(
      asCardId("f0000000-0000-4000-8000-000000000018"),
      18,
    );
    const dreamAvatars = Array.from({ length: 4 }, (_, index) => ({
      id: `avatar-${String(index)}`,
      name: `Avatar ${String(index)}`,
      title: "Synthetic",
      renderedText: "A synthetic ability.",
      imageNumber: String(index),
      startingEssence: 250,
      signatureCards: [],
    }));
    const baseState: JourneyState = {
      ...createDefaultState(),
      deck: [
        {
          entryId: "source-entry",
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "copy-a",
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "copy-b",
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: "survivor-entry",
          cardNumber: survivor.cardNumber,
          transfiguration: null,
          keywordModification: { setReclaim: 2 },
          isBane: false,
        },
      ],
      dreamAvatar: {
        id: "avatar-2",
        name: "Avatar 2",
        title: "Synthetic",
        renderedText: "A synthetic ability.",
        imageNumber: "2",
        startingEssence: 250,
      },
    };
    const build = (
      action: ExplorationActionContent,
      resolution: ExplorationResolution,
      state: JourneyState = baseState,
    ) => {
      const fallback: ExplorationActionContent = {
        id: "fallback",
        label: "Fallback",
        effectText: "Gain a card",
        effectKind: "gain-card",
        cardId: source.id,
      };
      const content = {
        cardDatabase: new Map([
          [source.cardNumber, source],
          [survivor.cardNumber, survivor],
        ]),
        dreamAvatars,
        dreamwellCards: [],
        dreamsignTemplates: [],
        dreamscapes: [],
        affiliations: [],
        guides: [guide],
        atlasData: MINIMAL_ATLAS_DATA,
        exploration: {
          customCards: [],
          customDreamsigns: [],
          encounters: [
            {
              cardId: source.id,
              prose: "A scene.",
              actions: [action, fallback],
            },
          ],
        },
      } as unknown as JourneyContent;
      return buildExplorationSiteView({
        sceneNode: null,
        site: explorationSite,
        guide,
        state,
        content,
        runtime: {
          kind: "exploration",
          encounterCardId: source.id,
          actionOffers: [
            {
              actionId: action.id,
              offeredCardIds: [],
              offeredDreamAvatarIds: ["avatar-1", "avatar-2", "avatar-3"],
              packCardIds: [],
              replacementCardIdByEntryId: {},
              transfigurationByEntryId: {},
            },
            {
              actionId: fallback.id,
              offeredCardIds: [],
              packCardIds: [],
              replacementCardIdByEntryId: {},
              transfigurationByEntryId: {},
            },
          ],
          resolution,
        },
      });
    };

    const emptyResolution = (actionId: string): ExplorationResolution => ({
      actionId,
      gainedCardIds: [],
      gainedDreamsignIds: [],
      purgedCardIds: [],
      affectedEntryIds: [],
      essenceGained: 0,
    });

    const copied = build(
      {
        id: "copy",
        label: "Copy",
        effectText: "Gain 2 copies of $DECK_CARD",
        effectKind: "copy-selected-card",
        count: 2,
      },
      {
        ...emptyResolution("copy"),
        gainedCardIds: [source.id, source.id],
        gainedEntryIds: ["copy-a", "copy-b"],
        affectedEntryIds: ["source-entry"],
      },
    );
    expect(copied).toMatchObject({
      outcomeKind: "card-copies",
      reward: {
        kind: "card-copies",
        sourceEntryId: "source-entry",
        source: { entryId: "source-entry" },
        cards: [{ entryId: "copy-a" }, { entryId: "copy-b" }],
      },
    });

    const purgedSnapshot = baseState.deck[0];
    if (purgedSnapshot === undefined) throw new Error("Expected purge fixture");
    const purgeAndCopyState = {
      ...baseState,
      deck: baseState.deck
        .filter((entry) => entry.entryId !== "source-entry")
        .map((entry) =>
          entry.entryId === "copy-b"
            ? { ...entry, cardNumber: survivor.cardNumber }
            : entry,
        ),
    };
    const purgedAndCopied = build(
      {
        id: "purge-copy",
        label: "Purge and copy",
        effectText: "Purge a chosen card and gain a copy of another chosen card",
        effectKind: "purge-and-copy",
      },
      {
        ...emptyResolution("purge-copy"),
        selection: {
          purgeEntryId: "source-entry",
          copyEntryId: "survivor-entry",
        },
        purgedCardIds: [source.id],
        purgedEntryIds: ["source-entry"],
        purgedEntrySnapshots: [purgedSnapshot],
        gainedCardIds: [survivor.id],
        gainedEntryIds: ["copy-b"],
        affectedEntryIds: ["survivor-entry"],
      },
      purgeAndCopyState,
    );
    expect(purgedAndCopied).toMatchObject({
      outcomeKind: "purge-and-copy",
      reward: {
        kind: "purge-and-copy",
        purgedCard: {
          entryId: "source-entry",
          model: { cardId: source.id },
        },
        sourceEntryId: "survivor-entry",
        source: {
          entryId: "survivor-entry",
          model: { cardId: survivor.id },
        },
        cards: [
          { entryId: "copy-b", model: { cardId: survivor.id } },
        ],
        count: 1,
      },
    });

    const copiedMultiple = build(
      {
        id: "copy-multiple",
        label: "Copy two",
        effectText: "Gain one copy of each of 2 chosen cards",
        effectKind: "copy-selected-cards",
        count: 2,
      },
      {
        ...emptyResolution("copy-multiple"),
        selection: { entryIds: ["source-entry", "survivor-entry"] },
        gainedCardIds: [source.id, survivor.id],
        gainedEntryIds: ["copy-a", "copy-b"],
        affectedEntryIds: ["source-entry", "survivor-entry"],
      },
    );
    expect(copiedMultiple).toMatchObject({
      outcomeKind: "card-copies-multiple",
      reward: {
        kind: "card-copies-multiple",
        count: 2,
        pairs: [
          { source: { entryId: "source-entry" }, copy: { entryId: "copy-a" } },
          { source: { entryId: "survivor-entry" }, copy: { entryId: "copy-b" } },
        ],
      },
    });
    expect(copiedMultiple?.actions[0]).toMatchObject({
      followup: {
        kind: "cards",
        mode: "exact",
        selectionKey: "entryIds",
        selectionOperation: "copy",
        min: 2,
        max: 2,
      },
    });

    const purgedForEssence = build(
      {
        id: "purge-for-essence",
        label: "Yield",
        effectText: "Purge a chosen card and gain 20 essence for each ✦ it had",
        effectKind: "purge-for-essence",
        essencePerSpark: 20,
      },
      {
        ...emptyResolution("purge-for-essence"),
        selection: { entryIds: ["source-entry"] },
        purgedCardIds: [source.id],
        purgedEntryIds: ["source-entry"],
        purgedEntrySnapshots: [
          {
            entryId: "source-entry",
            cardNumber: source.cardNumber,
            transfiguration: null,
            sparkBonus: 3,
            isBane: false,
          },
        ],
        essenceGained: 100,
      },
    );
    expect(purgedForEssence).toMatchObject({
      outcomeKind: "purged-card-essence",
      reward: {
        kind: "purged-card-essence",
        card: { entryId: "source-entry", model: { cardId: source.id } },
        spark: 5,
        essencePerSpark: 20,
        totalEssence: 100,
      },
    });

    const modifier = build(
      {
        id: "energy",
        label: "Energy",
        effectText: "Gain 2 additional energy at the start of your next battle",
        effectKind: "next-battle-starting-energy",
        count: 2,
      },
      {
        ...emptyResolution("energy"),
        battleModifier: {
          kind: "starting-energy",
          amount: 2,
          battlesRemaining: 1,
        },
      },
    );
    expect(modifier).toMatchObject({
      outcomeKind: "battle-modifier",
      reward: { kind: "battle-modifier", modifier: "starting-energy", amount: 2 },
    });

    const compoundModifier = build(
      {
        id: "compound-modifier",
        label: "Enter the radiance",
        effectText:
          "Draw one fewer card at the start of your next battle. All cards cost 1● less during that battle.",
        effectKind: "next-battle-smaller-hand-and-cost-discount",
      },
      {
        ...emptyResolution("compound-modifier"),
        battleModifier: {
          kind: "smaller-hand-and-cost-discount",
          openingHandDelta: -1,
          energyCostReduction: 1,
          battlesRemaining: 1,
        },
      },
    );
    expect(compoundModifier).toMatchObject({
      outcomeKind: "smaller-hand-and-cost-discount",
      reward: {
        kind: "smaller-hand-and-cost-discount",
        openingHandDelta: -1,
        energyCostReduction: 1,
        battlesRemaining: 1,
      },
    });

    const reclaim = build(
      {
        id: "reclaim",
        label: "Enter alone",
        effectText: "Purge duplicates and grant reclaim",
        effectKind: "purge-duplicates-and-grant-reclaim",
      },
      {
        ...emptyResolution("reclaim"),
        purgedCardIds: [source.id, source.id, source.id],
        purgedEntryIds: ["source-entry", "copy-a", "copy-b"],
        affectedEntryIds: ["survivor-entry"],
        reclaimCostByEntryId: { "survivor-entry": 2 },
      },
      { ...baseState, deck: [baseState.deck[3]] },
    );
    expect(reclaim).toMatchObject({
      outcomeKind: "reclaim",
      reward: {
        objects: {
          purgedCards: [
            { entryId: "source-entry", model: { cardId: source.id } },
            { entryId: "copy-a", model: { cardId: source.id } },
            { entryId: "copy-b", model: { cardId: source.id } },
          ],
        },
        deckModification: {
          kind: "reclaim",
          cards: [{ entryId: "survivor-entry" }],
          reclaimCostByEntryId: { "survivor-entry": 2 },
        },
      },
    });

    const avatar = build(
      {
        id: "avatar",
        label: "Follow",
        effectText: "Pick a new Dream Avatar from 3 choices",
        effectKind: "choose-dream-avatar",
        offerCount: 3,
      },
      {
        ...emptyResolution("avatar"),
        previousDreamAvatarId: "avatar-0",
        chosenDreamAvatarId: "avatar-2",
      },
    );
    expect(avatar).toMatchObject({
      outcomeKind: "dream-avatar",
      reward: {
        kind: "dream-avatar",
        previous: { id: "avatar-0" },
        current: { id: "avatar-2" },
      },
    });
    expect(avatar?.actions[0]).toMatchObject({
      followup: {
        kind: "dreamAvatars",
        dreamAvatars: [{ id: "avatar-1" }, { id: "avatar-2" }, { id: "avatar-3" }],
      },
    });

    const tookNone = build(
      {
        id: "take-none",
        label: "Take any",
        effectText: "Take any number of Character cards from 4 choices",
        effectKind: "take-cards",
        predicate: "character",
        offerCount: 4,
      },
      { ...emptyResolution("take-none"), selection: { cardIds: [] } },
    );
    expect(tookNone).toMatchObject({
      outcomeKind: "card-acquisition",
      reward: {
        semanticKind: "card-acquisition",
        objects: { cards: [], purgedCards: [], dreamsigns: [] },
      },
    });

    const replacement = build(
      {
        id: "replace-fixed",
        label: "Replace",
        effectText: `Choose a card to purge and replace it with ${survivor.name}`,
        effectKind: "replace-selected-with-card",
        cardId: survivor.id,
      },
      {
        ...emptyResolution("replace-fixed"),
        selection: { entryIds: ["source-entry"] },
        purgedCardIds: [source.id],
        purgedEntryIds: ["source-entry"],
        gainedCardIds: [survivor.id],
        gainedEntryIds: ["replacement-entry"],
      },
    );
    expect(replacement).toMatchObject({
      outcomeKind: "card-replacement",
      reward: {
        semanticKind: "card-replacement",
        objects: {
          cards: [{ cardId: survivor.id }],
          purgedCards: [
            { entryId: "source-entry", model: { cardId: source.id } },
          ],
        },
      },
    });
    const replacementFollowup = replacement?.actions[0].followup;
    expect(replacementFollowup).toMatchObject({
      kind: "cards",
      selectionKey: "entryIds",
      selectionOperation: "purge",
    });
    expect(
      replacementFollowup?.kind === "cards"
        ? replacementFollowup.cards.map((entry) => entry.entryId)
        : [],
    ).toContain("source-entry");

    const future = build(
      {
        id: "future-transfigured-site",
        label: "Follow",
        effectText: "The next draft or shop site will contain transfigured cards",
        effectKind: "transfigure-next-draft-or-shop",
      },
      {
        ...emptyResolution("future-transfigured-site"),
        siteOfferModifier: {
          kind: "transfigure-next-draft-or-shop",
          sourceSiteId: explorationSite.id,
          sourceActionId: "future-transfigured-site",
        },
      },
    );
    expect(future).toMatchObject({
      outcomeKind: "site-offer-modifier",
      reward: {
        kind: "site-offer-modifier",
        modifier: "transfigure-next-draft-or-shop",
        sourceSiteId: explorationSite.id,
        sourceActionId: "future-transfigured-site",
      },
    });
  });
});
