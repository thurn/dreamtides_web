import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import type { JourneyContent } from "../../data/journey-content";
import type { ExplorationSiteRuntime } from "../../types/journey";
import { testJourneyState } from "../../testing/journey-genesis";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../../testing/atlas-fixtures";
import { resolveExplorationGuide } from "./exploration-view-model";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import { parseDeckEntryId } from "../../types/identifiers";
import { SELECTION_RULES_VERSION } from "../../reward-selection/types";
import {
  testDreamsignId,
  testExplorationActionId,
} from "../../types/test-identities";
import { buildExplorationSiteView, card, explorationSite, guide, sourceId } from "./exploration-view-model.fixtures";

expect.addEqualityTesters([annotatedTextEquality]);

describe("exploration-view-model", () => {
  it("builds authored narrative, two actions, and persisted reward state", () => {
    const source = card(sourceId, 17);
    const gainedDreamsign = {
      id: testDreamsignId("gained-dreamsign-id"),
      name: "Gained Dreamsign",
      effectDescription: "A synthetic reward sign.",
    };
    const state = {
      ...testJourneyState(),
      deck: [
        {
          entryId: parseDeckEntryId("entry-a"),
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
      ],
      dreamsigns: [gainedDreamsign],
    };
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      selectionRulesVersion: SELECTION_RULES_VERSION,
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId: testExplorationActionId("action-a"),
          canonicalMechanicId: "purge-and-duplicate",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("action-b"),
          canonicalMechanicId: "gain-card",
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: testExplorationActionId("action-a"),
        gainedCardIds: [source.id],
        gainedDreamsignIds: [gainedDreamsign.id],
        purgedCardIds: [source.id],
        purgedEntryIds: [parseDeckEntryId("entry-purged")],
        affectedEntryIds: [],
        essenceGained: 0,
      },
    };
    const content = {
      cardDatabase: new Map([[source.cardNumber, source]]),
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      rewardSelectionData: CONFIG_DATA_FIXTURE.rewardSelectionData,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: testExplorationActionId("action-a"),
                label: "First choice",
                effectText: "Purge a card and copy another.",
                effectKind: "purge-and-copy",
              },
              {
                id: testExplorationActionId("action-b"),
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
      guideLine: "Fixture line.",
      runtime,
      state,
      content,
    });

    expect(resolveExplorationGuide([guide])).toBe(guide);
    expect(view).toMatchObject({
      siteId: explorationSite.id,
      actions: [
        {
          id: testExplorationActionId("action-a"),
          followup: { kind: "cards" },
        },
        {
          id: testExplorationActionId("action-b"),
          followup: { kind: "none" },
        },
      ],
      resolvedActionId: testExplorationActionId("action-a"),
      reward: {
        objects: {
          cards: [{ cardId: source.id }],
          purgedCards: [
            {
              entryId: parseDeckEntryId("entry-purged"),
              model: { cardId: source.id },
            },
          ],
          dreamsigns: [{ id: gainedDreamsign.id }],
        },
        deckModification: null,
      },
      card: { cardId: source.id },
    });
  });
});
