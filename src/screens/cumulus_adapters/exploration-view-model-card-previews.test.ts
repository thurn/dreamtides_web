import { describe, expect, it } from "vitest";
import { stableDigest } from "../../reward-selection/stable";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import type { JourneyContent } from "../../data/journey-content";
import type { ExplorationActionContent } from "../../data/exploration";
import type { ExplorationActionView } from "../../cumulus/screens/ExplorationSiteScreen";
import type { CardData } from "../../types/cards";
import type {
  ExplorationSiteRuntime,
  ExplorationStarterCardPreparation,
  JourneyState,
} from "../../types/journey";
import { testJourneyState } from "../../testing/journey-genesis";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../../testing/atlas-fixtures";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseSelectionKey } from "../../types/identifiers";
import { parseSelectionContentRevision } from "../../types/selection-content-revision";
import {
  parseSelectionRulesVersion,
  SELECTION_RULES_VERSION,
} from "../../reward-selection/types";
import {
  testExplorationActionId,
  testCardId,
} from "../../types/test-identities";
import { annotatedTextValue } from "../../runtime/text";
import { buildExplorationSiteView, card, explorationSite, guide, sourceId } from "./exploration-view-model.fixtures";

function serializedActionView(
  action: ExplorationActionView | undefined,
): string {
  if (action === undefined) return "";
  const { effectText, ...rest } = action;
  return JSON.stringify({
    ...rest,
    effectAnnotations: effectText.annotations,
  });
}

expect.addEqualityTesters([annotatedTextEquality]);

describe("exploration-view-model", () => {
  it("resolves a deck-card placeholder to one UUID-keyed transfigured preview", () => {
    const source = card(sourceId, 17);
    const target: CardData = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000018"), 18),
      cardType: "Event" as const,
      subtype: "",
      spark: null,
    };
    const state = {
      ...testJourneyState(),
      deck: [
        {
          entryId: parseDeckEntryId("entry-already-transfigured"),
          cardNumber: target.cardNumber,
          transfiguration: "Kindled" as const,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("entry-target"),
          cardNumber: target.cardNumber,
          transfiguration: null,
          isBane: false,
        },
      ],
    };
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      selectionRulesVersion: SELECTION_RULES_VERSION,
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId: testExplorationActionId("inspire-event"),
          canonicalMechanicId: "transfigure-deck-entry",
          offeredCardIds: [],
          offeredDeckEntryIds: [parseDeckEntryId("entry-target")],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("gain-card"),
          canonicalMechanicId: "gain-card",
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
                id: testExplorationActionId("inspire-event"),
                label: "Present a Written Charm",
                effectText: "Apply Inspired to {deck_card}",
                effectKind: "transfigure-fixed-selected",
                deckTarget: "offered",
                predicate: "event",
                transfiguration: "Inspired",
              },
              {
                id: testExplorationActionId("gain-card"),
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
      guideLine: "Fixture line.",
      runtime,
      state,
      content,
    });
    if (view === null) throw new Error("Expected Exploration view");

    expect(view.actions[0]).toMatchObject({
      effectText: `Apply Inspired to ${target.name}`,
      effectDisclosure: "(Fixture Inspired effect)",
      followup: { kind: "none" },
      automaticSelection: { entryIds: [parseDeckEntryId("entry-target")] },
      available: true,
    });
    expect(view.actions[0].effectText.annotations).toMatchObject({
      deck_card: {
        kind: "card",
        card: {
          id: target.id,
          renderedText: `${target.renderedText} Draw a card.`,
        },
        transfiguration: { type: "Inspired" },
      },
    });
  });

  it("discloses only the authored starter target and keeps random starter plans concealed", () => {
    const source = card(sourceId, 17);
    const starter = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000032"), 32),
      isStarter: true,
    };
    const starterEntryId = parseDeckEntryId("starter-entry-32");
    const state: JourneyState = {
      ...testJourneyState(),
      deck: [
        {
          entryId: starterEntryId,
          cardNumber: starter.cardNumber,
          transfiguration: null,
          isBane: false,
        },
      ],
    };
    const preparation = (
      kind: ExplorationStarterCardPreparation["kind"],
      unavailableReason?: ExplorationStarterCardPreparation["unavailableReason"],
    ): ExplorationStarterCardPreparation => ({
      kind,
      eligibleStarterCards: [{ entryId: starterEntryId, cardId: starter.id }],
      purgedEntryIds: [starterEntryId],
      purgedCardIds: [starter.id],
      replacementCardIdByEntryId:
        kind === "purge-random-starter-and-gain-card" ||
        kind === "replace-all-starter-cards"
          ? { [starterEntryId]: source.id }
          : {},
      selectionRulesVersion: parseSelectionRulesVersion("starter-rules-v1"),
      selectionContentRevision:
        parseSelectionContentRevision("starter-content-v1"),
      selectionKey: parseSelectionKey("fixture-starter-selection"),
      selectorSignatures: [stableDigest("starter-selector-signature")],
      selectorTraces: [],
      ...(unavailableReason === undefined ? {} : { unavailableReason }),
      planSignature: stableDigest("starter-plan-signature"),
    });
    const build = (
      action: ExplorationActionContent,
      starterCardPreparation: ExplorationStarterCardPreparation,
    ) => {
      const content = {
        cardDatabase: new Map([
          [source.cardNumber, source],
          [starter.cardNumber, starter],
        ]),
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
              prose: "A synthetic starter scene.",
              actions: [
                action,
                {
                  id: testExplorationActionId("starter-fallback"),
                  label: "Fallback",
                  effectText: "Gain a card",
                  effectKind: "gain-card",
                  cardId: source.id,
                },
              ],
            },
          ],
        },
      } as unknown as JourneyContent;
      return buildExplorationSiteView({
        sceneNode: null,
        site: explorationSite,
        guide,
        guideLine: "Fixture line.",
        state,
        content,
        runtime: {
          kind: "exploration",
          selectionRulesVersion: SELECTION_RULES_VERSION,
          encounterCardId: source.id,
          actionOffers: [
            {
              actionId: action.id,
              canonicalMechanicId: "purge-deck-entry",
              preparation: {
                kind: "starter-card",
                plan: starterCardPreparation,
              },
              offeredCardIds: [],
              offeredDeckEntryIds:
                action.effectKind === "purge-starter-card"
                  ? [starterEntryId]
                  : [],
              packCardIds: [],
              replacementCardIdByEntryId: {},
              transfigurationByEntryId: {},
            },
            {
              actionId: testExplorationActionId("starter-fallback"),
              canonicalMechanicId: "gain-card",
              offeredCardIds: [],
              packCardIds: [],
              replacementCardIdByEntryId: {},
              transfigurationByEntryId: {},
            },
          ],
          resolution: null,
        },
      });
    };

    const disclosed = build(
      {
        id: testExplorationActionId("starter-disclosed"),
        label: "Release",
        effectText: "Purge {starter_card}.",
        effectKind: "purge-starter-card",
      },
      preparation("purge-starter-card"),
    );
    expect(disclosed?.actions[0]).toMatchObject({
      available: true,
      followup: { kind: "none" },
      automaticSelection: {},
    });
    expect(disclosed?.actions[0].effectText.annotations).toMatchObject({
      starter_card: {
        kind: "card",
        entryId: starterEntryId,
        card: { id: starter.id },
      },
    });
    expect(annotatedTextValue(disclosed!.actions[0].effectText)).not.toContain(
      "{starter_card}",
    );

    for (const kind of [
      "purge-random-starter-card",
      "purge-random-starter-and-gain-card",
      "replace-all-starter-cards",
    ] as const) {
      const concealed = build(
        {
          id: testExplorationActionId(`concealed-${kind}`),
          label: "Accept",
          effectText: "Change the Starter cards.",
          effectKind: kind,
          ...(kind === "purge-random-starter-and-gain-card" ||
          kind === "replace-all-starter-cards"
            ? { predicate: "character" as const }
            : {}),
        },
        preparation(kind),
      );
      expect(concealed?.actions[0]).toMatchObject({
        available: true,
        followup: { kind: "none" },
        automaticSelection: {},
      });
      expect(concealed?.actions[0].effectText.annotations).toEqual({});
      expect(serializedActionView(concealed?.actions[0])).not.toContain(
        starterEntryId,
      );
      expect(serializedActionView(concealed?.actions[0])).not.toContain(
        starter.id,
      );
    }

    const unavailablePreparation = {
      ...preparation("purge-starter-card", "requires-starter-card"),
      eligibleStarterCards: [],
      purgedEntryIds: [],
      purgedCardIds: [],
    };
    const unavailable = build(
      {
        id: testExplorationActionId("starter-unavailable"),
        label: "Release",
        effectText: "Purge {starter_card}.",
        effectKind: "purge-starter-card",
      },
      unavailablePreparation,
    );
    expect(unavailable?.actions[0]).toMatchObject({
      available: false,
      effectFallback: { message: "Purge a Starter card." },
    });
  });
});
