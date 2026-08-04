import { describe, expect, it } from "vitest";
import type { JourneyContent } from "../../data/journey-content";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type { ExplorationSiteRuntime, SiteState } from "../../types/journey";
import { createDefaultState } from "../../state/journey-context";
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
      isNegative: false,
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
        actionId: "action-b",
        gainedCardIds: [source.id, source.id],
        gainedDreamsignIds: [gainedDreamsign.id],
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
      resolvedActionId: "action-b",
      reward: {
        kind: "objects",
        cards: [{ cardId: source.id }, { cardId: source.id }],
        dreamsigns: [{ id: gainedDreamsign.id }],
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
      kind: "deck-spark",
      amount: 1,
      announcement: "All characters in your deck gain +1✦",
      cards: [
        {
          entryId: "entry-character",
          model: {
            cardId: source.id,
            displaySnapshot: { spark: 3 },
          },
        },
      ],
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
                effectKind: "transfigure-fixed-selected",
                predicate: "cheap-character",
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
    if (view === null) throw new Error("Expected Exploration view");

    expect(view.actions[0].followup).toMatchObject({
      kind: "cards",
      cards: [{ entryId: "entry-eligible" }],
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
      atlasConfig: { completionLevels: [] },
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
        entity: { kind: "card", card: { id: nightmareCard.id } },
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
    const state = {
      ...createDefaultState(),
      dreamsigns: [{
        id: heldDreamsignId,
        name: "Held Dreamsign",
        effectDescription: "A synthetic sign effect.",
        isNegative: false,
      }],
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
      atlasConfig: { completionLevels: [] },
      exploration: {
        customCards: [],
        customDreamsigns: [],
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
        dreamsigns: [{ id: heldDreamsignId }],
      },
    });
  });
});
