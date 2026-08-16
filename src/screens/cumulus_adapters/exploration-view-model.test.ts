import { assertLocalized, opaque, txa } from "@trox/runtime";
import { describe, expect, it } from "vitest";
import { stableDigest } from "../../reward-selection/stable";
import { localizedStringSourceEquality } from "../../runtime/localization/testing";
import { resolveSource } from "../../runtime/localization/runtime";
import type { JourneyContent } from "../../data/journey-content";
import type { ExplorationActionContent } from "../../data/exploration";
import type { ExplorationActionView } from "../../cumulus/screens/ExplorationSiteScreen";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { parseCardName } from "../../types/card-identity";
import { parseCardTypeChangePredicateId } from "../../types/identifiers";
import type { CardData } from "../../types/cards";
import type { DreamGuideContent } from "../../types/content";
import type {
  CardTypeChange,
  DreamscapeNode,
  ExplorationResolution,
  ExplorationSiteRuntime,
  ExplorationStarterCardPreparation,
  ExplorationStarterCardTransfigurationPreparation,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { createDefaultState } from "../../state/journey-context";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../../__test-helpers__/atlas-fixtures";
import {
  buildExplorationActionEffect as buildExplorationActionEffectImpl,
  buildExplorationSiteView as buildExplorationSiteViewImpl,
  resolveExplorationGuide,
} from "./exploration-view-model";
import { transfigurationFixture } from "../../testing/transfiguration-fixture";
import { economyFixture } from "../../testing/economy-fixture";

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
import type { ExplorationMultiCardTransfigurationPreparation } from "../../exploration/multi-card-transfiguration-plan";
import type { MultiCardReplacementPreparation } from "../../exploration/multi-card-replacement-plan";
import type { ExplorationRandomDeckTargetPreparation } from "../../exploration/random-deck-target-plan";
import type { ExplorationDisclosedDeckTargetPreparation } from "../../exploration/disclosed-deck-target-plan";
import type { ExplorationCompoundActionPreparation } from "../../exploration/compound-action-plan";
import { parseSiteId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import type { DreamsignId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import type { ExplorationActionId } from "../../types/identifiers";
import { parseSelectionKey } from "../../types/identifiers";
import { parseRewardCandidateKey } from "../../types/identifiers";
import { parseSelectionContentRevision } from "../../types/selection-content-revision";
import { parseSelectionRulesVersion } from "../../reward-selection/types";
import { testAvatarId, testDreamscapeId, testDreamsignId, testExplorationActionId, testGuideId, testCardId } from "../../types/test-identities";

expect.addEqualityTesters([localizedStringSourceEquality]);

function withTransfiguration(content: JourneyContent): JourneyContent {
  return { ...content, transfigurationData: transfigurationFixture() };
}

const buildExplorationActionEffect = (
  ...args: Parameters<typeof buildExplorationActionEffectImpl>
) =>
  buildExplorationActionEffectImpl(
    args[0],
    args[1],
    withTransfiguration(args[2]),
    args[3],
    args[4],
  );

const buildExplorationSiteView = (
  params: Parameters<typeof buildExplorationSiteViewImpl>[0],
) =>
  buildExplorationSiteViewImpl({
    ...params,
    content: withTransfiguration(params.content),
  });

const sourceId = testCardId("161482b6-af07-4d9e-822d-8c738672beb9");

function card(id: CardData["id"], cardNumber: number): CardData {
  return {
    id,
    name: parseCardName(`Fixture Card ${String(cardNumber)}`),
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
  id: parseSiteId("site-exploration-fixture"),
  type: "Exploration",
  isEnhanced: true,
  isVisited: false,
};

const guide: DreamGuideContent = {
  id: testGuideId("fixture-layaway"),
  name: "Fixture Guide",
  homeDreamscapeId: testDreamscapeId("fixture-dreamscape"),
  siteType: "Exploration",
  portraitSource: "fixture-guide.png",
  dialogue: { site: ["Every card dreams. Draw one, and we'll step inside."] },
  homeSpecialty: "Fixture specialty.",
};

describe("exploration-view-model", () => {
  it("builds authored narrative, two actions, and persisted reward state", () => {
    const source = card(sourceId, 17);
    const gainedDreamsign = {
      id: testDreamsignId("gained-dreamsign-id"),
      name: "Gained Dreamsign",
      effectDescription: "A synthetic reward sign.",
    };
    const state = {
      ...createDefaultState(),
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
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId: testExplorationActionId("action-a"),
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("action-b"),
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
      guideLine: assertLocalized("Fixture line."),
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

  it("builds a persisted purge plus subtype survivor spark reward", () => {
    const source = { ...card(sourceId, 17), subtype: "Warrior" };
    const purged = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000019"), 19),
      subtype: "Warrior",
    };
    const event = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000018"), 18),
      cardType: "Event" as const,
      spark: null,
    };
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: parseDeckEntryId("entry-character"),
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
          sparkBonus: 1,
        },
        {
          entryId: parseDeckEntryId("entry-event"),
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
          actionId: testExplorationActionId("blood-oath"),
          offeredCardIds: [],
          offeredDeckEntryIds: [parseDeckEntryId("entry-purged")],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("gain-source"),
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: testExplorationActionId("blood-oath"),
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [purged.id],
        purgedEntryIds: [parseDeckEntryId("entry-purged")],
        purgedEntrySnapshots: [
          {
            entryId: parseDeckEntryId("entry-purged"),
            cardNumber: purged.cardNumber,
            transfiguration: null,
            isBane: false,
          },
        ],
        affectedEntryIds: [parseDeckEntryId("entry-character")],
        sparkBeforeByEntryId: { [parseDeckEntryId("entry-character")]: 2 },
        sparkAfterByEntryId: { [parseDeckEntryId("entry-character")]: 3 },
        essenceGained: 0,
      },
    };
    const content = {
      cardDatabase: new Map([
        [source.cardNumber, source],
        [event.cardNumber, event],
        [purged.cardNumber, purged],
      ]),
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: testExplorationActionId("blood-oath"),
                label: "Swear a Blood Oath",
                effectText:
                  "Purge a random Warrior. Every other Warrior in your deck gains +1✦.",
                effectKind: "purge-random-subtype-and-increase-spark",
                subtype: "Warrior",
                sparkBonus: 1,
              },
              {
                id: testExplorationActionId("gain-source"),
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
      guideLine: assertLocalized("Fixture line."),
      runtime,
      state,
      content,
    });

    expect(view?.reward).toMatchObject({
      objects: {
        cards: [],
        purgedCards: [
          {
            entryId: parseDeckEntryId("entry-purged"),
            model: { cardId: purged.id },
          },
        ],
        dreamsigns: [],
      },
      deckModification: {
        kind: "spark",
        amount: 1,
        announcement:
          "Purge a random Warrior. Every other Warrior in your deck gains +1✦.",
        cards: [
          {
            entryId: parseDeckEntryId("entry-character"),
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
      name: parseCardName("Nightmare"),
      rarity: "Special" as const,
    };
    const actionOffers = ["make-fast", "reduce-cost"].map((actionId) => ({
      actionId: testExplorationActionId(actionId),
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
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: testExplorationActionId("make-fast"),
                label: "Accept the charge",
                effectText: "All cards in your deck become ❖ (fast)",
                effectKind: "make-fast-all",
              },
              {
                id: testExplorationActionId("reduce-cost"),
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
      affectedEntryIds: [parseDeckEntryId("entry-character")],
      essenceGained: 0,
    };

    const fastView = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      runtime: {
        kind: "exploration",
        encounterCardId: source.id,
        actionOffers,
        resolution: {
          ...baseResolution,
          actionId: testExplorationActionId("make-fast"),
          gainedCardIds: [],
        },
      },
      state: {
        ...createDefaultState(),
        deck: [
          {
            entryId: parseDeckEntryId("entry-character"),
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
        cards: [
          {
            entryId: parseDeckEntryId("entry-character"),
            model: { displaySnapshot: { isFast: true } },
          },
        ],
      },
    });

    const costView = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      runtime: {
        kind: "exploration",
        encounterCardId: source.id,
        actionOffers,
        resolution: {
          ...baseResolution,
          actionId: testExplorationActionId("reduce-cost"),
          gainedCardIds: [
            NIGHTMARE_CARD_ID,
            NIGHTMARE_CARD_ID,
            NIGHTMARE_CARD_ID,
          ],
        },
      },
      state: {
        ...createDefaultState(),
        deck: [
          {
            entryId: parseDeckEntryId("entry-character"),
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
        amount: 1,
        cards: [
          {
            entryId: parseDeckEntryId("entry-character"),
            model: { displaySnapshot: { energyCost: 1 } },
          },
        ],
      },
    });
  });

  it("omits already-transfigured and fixed-form-ineligible cards", () => {
    const source = card(sourceId, 17);
    const zeroCost = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000017"), 18),
      energyCost: 0,
    };
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: parseDeckEntryId("entry-eligible"),
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("entry-transfigured"),
          cardNumber: source.cardNumber,
          transfiguration: "Inspired" as const,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("entry-zero-cost"),
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
          actionId: testExplorationActionId("gather-light"),
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("gain-card"),
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
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: testExplorationActionId("gather-light"),
                label: "Gather the Falling Light",
                effectText: "Apply Empowered to a chosen card.",
                effectKind: "transfigure-fixed-selected",
                transfiguration: "Empowered",
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
      guideLine: assertLocalized("Fixture line."),
      runtime,
      state,
      content,
    });
    if (view === null) throw new Error("Expected Exploration view");

    expect(view.actions[0].followup).toMatchObject({
      kind: "cards",
      selectionOperation: "transfigure",
      cards: [{ entryId: parseDeckEntryId("entry-eligible") }],
    });
    expect(resolveSource(view.actions[0].effectText.localized)).toBe(
      "Apply Empowered to a chosen card.",
    );
    expect(view.actions[0].effectDisclosure).toEqual(
      "(Fixture Empowered effect)",
    );
  });

  it("resolves a deck-card placeholder to one UUID-keyed transfigured preview", () => {
    const source = card(sourceId, 17);
    const target: CardData = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000018"), 18),
      cardType: "Event" as const,
      subtype: "",
      spark: null,
    };
    const state = {
      ...createDefaultState(),
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
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId: testExplorationActionId("inspire-event"),
          offeredCardIds: [],
          offeredDeckEntryIds: [parseDeckEntryId("entry-target")],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("gain-card"),
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
                effectText: txa(
                  "Apply Inspired to {deck_card}",
                  { deck_card: opaque(assertLocalized(target.name)) },
                  "[exploration] Synthetic effect applying a fixed Transfiguration to one disclosed deck card. deck_card is the proper card name.",
                ),
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
      guideLine: assertLocalized("Fixture line."),
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

  it("renders a minted subtype target by name and resolves it without a picker", () => {
    const source = card(sourceId, 17);
    const target = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000019"), 19),
      subtype: "Warrior",
    };
    const state = {
      ...createDefaultState(),
      deck: [
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
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId: testExplorationActionId("become-survivor"),
          offeredCardIds: [],
          offeredDeckEntryIds: [parseDeckEntryId("entry-target")],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("gain-card"),
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
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: testExplorationActionId("become-survivor"),
                label: "Fit a matching hood",
                effectText: txa(
                  "Change {deck_card} to become a Survivor",
                  { deck_card: opaque(assertLocalized(target.name)) },
                  "[exploration] Synthetic effect changing one disclosed deck card's subtype. deck_card is the proper card name.",
                ),
                effectKind: "change-subtype-selected",
                deckTarget: "offered",
                predicate: "cheap-character",
                subtype: "Survivor",
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
      guideLine: assertLocalized("Fixture line."),
      runtime,
      state,
      content,
    });
    if (view === null) throw new Error("Expected Exploration view");

    expect(view.actions[0]).toMatchObject({
      effectText: `Change ${target.name} to become a Survivor`,
      followup: { kind: "none" },
      automaticSelection: { entryIds: [parseDeckEntryId("entry-target")] },
      available: true,
    });
    expect(view.actions[0].effectText.annotations).toMatchObject({
      deck_card: { kind: "card", card: { id: target.id } },
    });
    expect(resolveSource(view.actions[0].effectText.localized)).not.toContain(
      "{deck_card}",
    );

    const resolvedView = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      runtime: {
        ...runtime,
        resolution: {
          actionId: testExplorationActionId("become-survivor"),
          selection: { entryIds: [parseDeckEntryId("entry-target")] },
          gainedCardIds: [],
          gainedDreamsignIds: [],
          purgedCardIds: [],
          affectedEntryIds: [parseDeckEntryId("entry-target")],
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
    const target = card(testCardId("f0000000-0000-4000-8000-000000000018"), 18);
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: parseDeckEntryId("entry-target"),
          cardNumber: target.cardNumber,
          transfiguration: "Kindled" as const,
          isBane: false,
        },
      ],
    };
    const actionId = testExplorationActionId("kindle-target");
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId: actionId,
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("gain-card"),
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: actionId,
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: [parseDeckEntryId("entry-target")],
        essenceGained: 0,
      },
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
      guideLine: assertLocalized("Fixture line."),
      runtime,
      state,
      content,
    });

    expect(view?.reward).toMatchObject({
      kind: "transfiguration",
      entryId: parseDeckEntryId("entry-target"),
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

  it("gates and presents a persisted bulk transfiguration paid with essence", () => {
    const source = card(sourceId, 17);
    const firstEvent: CardData = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000080"), 80),
      cardType: "Event" as const,
      subtype: "",
      spark: null,
    };
    const secondEvent: CardData = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000081"), 81),
      cardType: "Event" as const,
      subtype: "",
      spark: null,
    };
    const actionId = testExplorationActionId("transfigure-all-events");
    const actionOffers = [
      {
        actionId,
        canonicalMechanicId: "transfigure-deck-for-essence" as const,
        eligibleDeckEntryIds: [
          parseDeckEntryId("entry-event-a"),
          parseDeckEntryId("entry-event-b"),
        ],
        offeredCardIds: [],
        packCardIds: [],
        replacementCardIdByEntryId: {},
        transfigurationByEntryId: {},
      },
      {
        actionId: testExplorationActionId("gain-card"),
        offeredCardIds: [],
        packCardIds: [],
        replacementCardIdByEntryId: {},
        transfigurationByEntryId: {},
      },
    ];
    const content = {
      cardDatabase: new Map([
        [source.cardNumber, source],
        [firstEvent.cardNumber, firstEvent],
        [secondEvent.cardNumber, secondEvent],
      ]),
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
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
                label: "Enter Spiraling Light",
                effectText:
                  "Lose 100 essence. Apply Inspired to every eligible Event card in your deck.",
                effectKind: "transfigure-all-for-essence",
                essence: 100,
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
    const startingDeck = [firstEvent, secondEvent].map((event, index) => ({
      entryId: parseDeckEntryId(index === 0 ? "entry-event-a" : "entry-event-b"),
      cardNumber: event.cardNumber,
      transfiguration: null,
      isBane: false,
    }));
    const unresolvedRuntime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: source.id,
      actionOffers,
      resolution: null,
    };
    const viewAt99 = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      runtime: unresolvedRuntime,
      state: { ...createDefaultState(), essence: 99, deck: startingDeck },
      content,
    });
    const viewAt100 = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      runtime: unresolvedRuntime,
      state: { ...createDefaultState(), essence: 100, deck: startingDeck },
      content,
    });

    expect(viewAt99?.actions[0]?.available).toBe(false);
    expect(viewAt100?.actions[0]).toMatchObject({
      available: true,
      followup: { kind: "none" },
      effectDisclosure: "(Fixture Inspired effect)",
    });

    const resolvedView = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      runtime: {
        ...unresolvedRuntime,
        resolution: {
          actionId: actionId,
          gainedCardIds: [],
          gainedDreamsignIds: [],
          purgedCardIds: [],
          affectedEntryIds: [
            parseDeckEntryId("entry-event-a"),
            parseDeckEntryId("entry-event-b"),
          ],
          essenceGained: 0,
          essenceSpent: 100,
          chosenTransfiguration: "Inspired",
        },
      },
      state: {
        ...createDefaultState(),
        essence: 0,
        deck: startingDeck.map((entry) => ({
          ...entry,
          transfiguration: "Inspired" as const,
        })),
      },
      content,
    });

    expect(resolvedView).toMatchObject({
      outcomeKind: "transfiguration",
      reward: {
        deckModification: {
          kind: "transfiguration",
          transfiguration: "Inspired",
          formName: "Fixture Inspired",
          essenceSpent: 100,
          cards: [
            {
              entryId: parseDeckEntryId("entry-event-a"),
              model: { transfiguration: { type: "Inspired" } },
            },
            {
              entryId: parseDeckEntryId("entry-event-b"),
              model: { transfiguration: { type: "Inspired" } },
            },
          ],
        },
      },
    });
  });

  it("builds the standard free-form transfiguration picker with zero-cost forms", () => {
    const source = card(sourceId, 17);
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: parseDeckEntryId("entry-eligible"),
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("entry-transfigured"),
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
          actionId: testExplorationActionId("transfigure"),
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("gain-card"),
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
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: testExplorationActionId("transfigure"),
                label: "Send a possession through",
                effectText: "Apply a transfiguration to a chosen card",
                effectKind: "transfigure-selected",
                count: 1,
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
      guideLine: assertLocalized("Fixture line."),
      runtime,
      state,
      content,
    });
    if (view === null) throw new Error("Expected Exploration view");

    expect(view.actions[0].followup).toMatchObject({
      kind: "transfiguration",
      candidates: [
        {
          entryId: parseDeckEntryId("entry-eligible"),
          forms: [
            { type: "Empowered", pricing: { kind: "unpriced" } },
            { type: "Kindled", pricing: { kind: "unpriced" } },
          ],
        },
      ],
    });
  });

  it("builds an identity-safe Essence calculation from the affected deck entries", () => {
    const source = card(sourceId, 17);
    const firstSpiritAnimal = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000018"), 18),
      subtype: "Spirit Animal",
    };
    const secondSpiritAnimal = {
      ...card(testCardId("f0000000-0000-4000-8000-000000000019"), 19),
      subtype: "Spirit Animal",
    };
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: parseDeckEntryId("spirit-entry-a"),
          cardNumber: firstSpiritAnimal.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("spirit-entry-b"),
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
          actionId: testExplorationActionId("gain-essence"),
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("gain-card"),
          offeredCardIds: [],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: {
        actionId: testExplorationActionId("gain-essence"),
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: [
          parseDeckEntryId("spirit-entry-a"),
          parseDeckEntryId("spirit-entry-b"),
        ],
        essenceGained: 30,
      },
    };
    const content = {
      cardDatabase: new Map([
        [source.cardNumber, source],
        [firstSpiritAnimal.cardNumber, firstSpiritAnimal],
        [secondSpiritAnimal.cardNumber, secondSpiritAnimal],
      ]),
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: testExplorationActionId("gain-essence"),
                label: "Sound a gathering call",
                effectText:
                  "Gain 15 essence for each Spirit Animal card in your deck",
                effectKind: "gain-essence-per-card",
                predicate: "spirit-animal",
                essencePerCard: 15,
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
      guideLine: assertLocalized("Fixture line."),
      runtime,
      state,
      content,
    });

    expect(view?.reward).toMatchObject({
      kind: "essence",
      cards: [
        {
          entryId: parseDeckEntryId("spirit-entry-a"),
          model: { cardId: firstSpiritAnimal.id },
        },
        {
          entryId: parseDeckEntryId("spirit-entry-b"),
          model: { cardId: secondSpiritAnimal.id },
        },
      ],
      essencePerCard: 15,
      totalEssence: 30,
    });
  });

  it("resolves an offered-card placeholder and presents the UUID-backed card", () => {
    const source = card(sourceId, 17);
    const offered = card(testCardId("f0000000-0000-4000-8000-000000000018"), 18);
    const state = {
      ...createDefaultState(),
      deck: [
        {
          entryId: parseDeckEntryId("entry-a"),
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
          actionId: testExplorationActionId("gain-offered"),
          offeredCardIds: [offered.id],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("increase-spark"),
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
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: testExplorationActionId("gain-offered"),
                label: "Invite someone through",
                effectText: txa(
                  "Gain {offered_card}",
                  { offered_card: opaque(assertLocalized(offered.name)) },
                  "[exploration] Synthetic effect gaining one offered card. offered_card is the proper card name.",
                ),
                effectKind: "gain-offered-card",
                predicate: "cheap-character",
              },
              {
                id: testExplorationActionId("increase-spark"),
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
      guideLine: assertLocalized("Fixture line."),
      runtime,
      state,
      content,
    });
    if (view === null) throw new Error("Expected Exploration view");

    expect(view.actions[0]).toMatchObject({
      effectText: `Gain ${offered.name}`,
      available: true,
      followup: { kind: "none" },
      automaticSelection: { cardIds: [offered.id] },
    });
    expect(view.actions[0].effectText.annotations).toMatchObject({
      offered_card: { kind: "card", card: { id: offered.id } },
    });
    expect(view.actions[1].followup).toEqual({ kind: "none" });
    expect(view.actions.map((action) => action.id)).toEqual([
      testExplorationActionId("gain-offered"),
      testExplorationActionId("increase-spark"),
    ]);
  });

  it("builds UUID-backed references for fixed cards, Nightmare, and Dreamsigns", () => {
    const fixedCard = card(
      testCardId("f0000000-0000-4000-8000-000000000019"),
      19,
    );
    const nightmareCard = {
      ...card(NIGHTMARE_CARD_ID, 20),
      name: parseCardName("Nightmare"),
    };
    const dreamsignId = "f0000000-0000-4000-8000-000000000021";
    const content = {
      cardDatabase: new Map([
        [fixedCard.cardNumber, fixedCard],
        [nightmareCard.cardNumber, nightmareCard],
      ]),
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [
        {
          id: testDreamsignId(dreamsignId),
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
      sitesData: MINIMAL_SITES_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [],
      },
    } as unknown as JourneyContent;
    const offer = {
      actionId: testExplorationActionId("fixture-action"),
      offeredCardIds: [],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
    };

    const fixed = buildExplorationActionEffect(
      {
        id: testExplorationActionId("fixed-card"),
        label: "Gain a card",
        effectText: txa(
          "Gain {fixed_card}",
          { fixed_card: opaque(assertLocalized(fixedCard.name)) },
          "[exploration] Synthetic effect gaining one fixed card. fixed_card is the proper card name.",
        ),
        effectKind: "gain-card",
        cardId: fixedCard.id,
      },
      offer,
      content,
    );
    const nightmare = buildExplorationActionEffect(
      {
        id: testExplorationActionId("nightmare-card"),
        label: "Accept the cost",
        effectText: txa(
          "Gain 3 {nightmare_card} cards.",
          { nightmare_card: opaque(assertLocalized(nightmareCard.name)) },
          "[exploration] Synthetic effect gaining three Nightmare cards. nightmare_card is the proper card name.",
        ),
        effectKind: "reduce-cost-all-and-gain-nightmares",
        nightmareCount: 3,
      },
      offer,
      content,
    );
    const dreamsign = buildExplorationActionEffect(
      {
        id: testExplorationActionId("fixed-dreamsign"),
        label: "Take the sign",
        effectText: txa(
          "Gain {dreamsign}",
          { dreamsign: opaque(assertLocalized("Fixture Sign")) },
          "[exploration] Synthetic effect gaining one fixed Dreamsign. dreamsign is the proper Dreamsign name.",
        ),
        effectKind: "gain-dreamsign",
        dreamsignId: testDreamsignId(dreamsignId),
      },
      offer,
      content,
    );

    expect(fixed.effectText.annotations).toMatchObject({
      fixed_card: { kind: "card", card: { id: fixedCard.id } },
    });
    expect(resolveSource(fixed.effectText.localized)).not.toContain(
      "{fixed_card}",
    );
    expect(resolveSource(nightmare.effectText.localized)).not.toContain(
      "{nightmare_card}",
    );
    expect(nightmare.effectText.annotations).toMatchObject({
      nightmare_card: {
        kind: "card",
        card: { id: nightmareCard.id },
        copies: 3,
      },
    });
    expect(dreamsign.effectText.annotations).toMatchObject({
      dreamsign: {
        kind: "dreamsign",
        dreamsign: { id: dreamsignId },
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
      ...createDefaultState(),
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
      selectionContentRevision: parseSelectionContentRevision("starter-content-v1"),
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
        guideLine: assertLocalized("Fixture line."),
        state,
        content,
        runtime: {
          kind: "exploration",
          encounterCardId: source.id,
          actionOffers: [
            {
              actionId: action.id,
              starterCardPreparation,
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
        effectText: txa(
          "Purge {starter_card}.",
          { starter_card: opaque(assertLocalized(starter.name)) },
          "[exploration] Synthetic effect purging one disclosed Starter card. starter_card is the proper card name.",
        ),
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
    expect(
      resolveSource(disclosed!.actions[0].effectText.localized),
    ).not.toContain("{starter_card}");

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

  it("builds Dreamsign follow-ups with UUID-keyed selection contracts", () => {
    const source = card(sourceId, 17);
    const heldDreamsignId = testDreamsignId("held-dreamsign-id");
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
          actionId: testExplorationActionId("random-dreamsign"),
          offeredCardIds: [],
          offeredDreamsignIds: [testDreamsignId("offered-dreamsign-id")],
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: testExplorationActionId("purge-dreamsign"),
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
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [heldDreamsign],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: testExplorationActionId("random-dreamsign"),
                label: "Read the pattern",
                effectText: "Gain a random dreamsign",
                effectKind: "gain-random-dreamsign",
              },
              {
                id: testExplorationActionId("purge-dreamsign"),
                label: "Break the pattern",
                effectText: "Purge a dreamsign for essence",
                effectKind: "purge-dreamsign-for-essence",
                essence: 50,
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
      guideLine: assertLocalized("Fixture line."),
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
      guideLine: assertLocalized("Fixture line."),
      runtime: {
        ...runtime,
        resolution: {
          actionId: testExplorationActionId("purge-dreamsign"),
          gainedCardIds: [],
          gainedDreamsignIds: [],
          purgedCardIds: [],
          purgedDreamsignIds: [testDreamsignId(heldDreamsignId)],
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

  it("projects Nightmare plus Dreamsign choices and the exact persisted compound outcome", () => {
    const source = card(sourceId, 17);
    const nightmare = {
      ...card(NIGHTMARE_CARD_ID, 18),
      name: parseCardName("Synthetic Nightmare"),
    };
    const fixedDreamsign = {
      id: testDreamsignId("40000000-0000-4000-8000-000000000001"),
      name: "Fixed Dreamsign",
      effectDescription: "A fixed synthetic effect.",
      imageName: "fixed.webp",
      imageAlt: "Fixed Dreamsign art",
    };
    const heldDreamsign = {
      id: testDreamsignId("40000000-0000-4000-8000-000000000002"),
      name: "Held Dreamsign",
      effectDescription: "A held synthetic effect.",
      imageName: "held.webp",
      imageAlt: "Held Dreamsign art",
    };
    const offeredDreamsigns = [
      {
        id: testDreamsignId("40000000-0000-4000-8000-000000000003"),
        name: "Offered Dreamsign A",
        effectDescription: "An offered synthetic effect.",
        imageName: "offered-a.webp",
        imageAlt: "Offered Dreamsign A art",
      },
      {
        id: testDreamsignId("40000000-0000-4000-8000-000000000004"),
        name: "Offered Dreamsign B",
        effectDescription: "Another offered synthetic effect.",
        imageName: "offered-b.webp",
        imageAlt: "Offered Dreamsign B art",
      },
    ];
    const preparation = (
      kind: "fixed-gain" | "offered-gain",
      preparedDreamsignIds: DreamsignId[],
      requiredOverflowReplacementCount: number,
    ) => ({
      kind,
      requestedCount: preparedDreamsignIds.length,
      nightmareCount: 2,
      heldIdsAtPreparation: [heldDreamsign.id],
      maxDreamsignsAtPreparation: 1,
      poolBeforeIds: offeredDreamsigns.map((dreamsign) => dreamsign.id),
      poolBasisIds: offeredDreamsigns.map((dreamsign) => dreamsign.id),
      poolRegenerated: false,
      preparedDreamsignIds,
      requiredOverflowReplacementCount,
      planSignature: stableDigest(
        `signed:${kind}:${String(requiredOverflowReplacementCount)}`,
      ),
    });
    const actions = [
      {
        id: testExplorationActionId("fixed-bundle"),
        label: "Accept the fixed bundle",
        effectText: "Gain 2 {nightmare_card} cards and gain Fixed Dreamsign.",
        effectKind: "gain-nightmare-and-dreamsign" as const,
        dreamsignId: fixedDreamsign.id,
        nightmareCount: 2,
      },
      {
        id: testExplorationActionId("offered-bundle"),
        label: "Accept an offered bundle",
        effectText: "Gain 2 {nightmare_card} cards and choose a Dreamsign.",
        effectKind: "gain-nightmare-and-offered-dreamsign" as const,
        offerCount: 2,
        nightmareCount: 2,
      },
    ];
    const content = {
      cardDatabase: new Map([
        [source.cardNumber, source],
        [nightmare.cardNumber, nightmare],
      ]),
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [fixedDreamsign, heldDreamsign, ...offeredDreamsigns],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions,
          },
        ],
      },
    } as unknown as JourneyContent;
    const offer = (
      actionId: ExplorationActionId,
      dreamsignPreparation: ReturnType<typeof preparation>,
      offeredDreamsignIds: DreamsignId[],
    ) => ({
      actionId,
      offeredCardIds: [],
      offeredDreamsignIds,
      dreamsignPreparation,
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
    });
    const build = (
      state: JourneyState,
      fixedOverflow: number,
      offeredOverflow: number,
      resolution: ExplorationResolution | null = null,
    ) =>
      buildExplorationSiteView({
        sceneNode: null,
        site: explorationSite,
        guide,
        guideLine: assertLocalized("Fixture line."),
        runtime: {
          kind: "exploration",
          encounterCardId: source.id,
          actionOffers: [
            offer(
              actions[0].id,
              preparation("fixed-gain", [fixedDreamsign.id], fixedOverflow),
              [],
            ),
            offer(
              actions[1].id,
              preparation(
                "offered-gain",
                offeredDreamsigns.map((dreamsign) => dreamsign.id),
                offeredOverflow,
              ),
              offeredDreamsigns.map((dreamsign) => dreamsign.id),
            ),
          ],
          resolution,
        },
        state,
        content,
      });

    const belowCap = build(
      {
        ...createDefaultState(),
        dreamsigns: [heldDreamsign],
        maxDreamsigns: 2,
      },
      0,
      0,
    );
    expect(belowCap?.actions[0]).toMatchObject({
      available: true,
      followup: { kind: "none" },
    });

    const atCap = build(
      {
        ...createDefaultState(),
        dreamsigns: [heldDreamsign],
        maxDreamsigns: 1,
      },
      1,
      1,
    );
    expect(atCap?.actions[0]).toMatchObject({
      available: true,
      followup: {
        kind: "dreamsigns",
        selectionKey: "replacedDreamsignId",
        dreamsigns: [{ id: heldDreamsign.id }],
      },
    });
    expect(atCap?.actions[1]).toMatchObject({
      available: true,
      followup: {
        kind: "dreamsign-flow",
        mode: "gain-offered",
        requiredOverflowReplacementCount: 1,
        offered: offeredDreamsigns.map((dreamsign) => ({ id: dreamsign.id })),
      },
    });

    const nightmareEntries = ["nightmare-entry-a", "nightmare-entry-b"];
    const resolved = build(
      {
        ...createDefaultState(),
        maxDreamsigns: 1,
        dreamsigns: [fixedDreamsign],
        deck: nightmareEntries.map((entryId) => ({
          entryId: parseDeckEntryId(entryId),
          cardNumber: nightmare.cardNumber,
          transfiguration: null,
          isBane: true,
        })),
      },
      1,
      1,
      {
        actionId: actions[0].id,
        selection: { replacedDreamsignId: heldDreamsign.id },
        gainedCardIds: [NIGHTMARE_CARD_ID, NIGHTMARE_CARD_ID],
        gainedEntryIds: nightmareEntries.map(parseDeckEntryId),
        gainedDreamsignIds: [fixedDreamsign.id],
        purgedCardIds: [],
        purgedDreamsignIds: [heldDreamsign.id],
        affectedEntryIds: [],
        essenceGained: 0,
        dreamsignMutation: {
          beforeIds: [heldDreamsign.id],
          afterIds: [fixedDreamsign.id],
          offeredIds: [],
          gainedIds: [fixedDreamsign.id],
          purgedIds: [heldDreamsign.id],
          replacements: [
            {
              removedDreamsignId: heldDreamsign.id,
              gainedDreamsignId: fixedDreamsign.id,
            },
          ],
          poolBeforeIds: offeredDreamsigns.map((dreamsign) => dreamsign.id),
          poolAfterIds: offeredDreamsigns.map((dreamsign) => dreamsign.id),
          poolRegenerated: false,
        },
      },
    );
    expect(resolved).toMatchObject({
      outcomeKind: "nightmare-dreamsign-bundle",
      reward: {
        kind: "nightmare-dreamsign-bundle",
        sourceKind: "gain-nightmare-and-dreamsign",
        nightmares: [
          {
            entryId: parseDeckEntryId(nightmareEntries[0]),
            model: { cardId: NIGHTMARE_CARD_ID },
          },
          {
            entryId: parseDeckEntryId(nightmareEntries[1]),
            model: { cardId: NIGHTMARE_CARD_ID },
          },
        ],
        gained: [{ id: fixedDreamsign.id }],
        replacements: [
          {
            removed: { id: heldDreamsign.id },
            gained: { id: fixedDreamsign.id },
          },
        ],
      },
    });
  });

  it("builds signed compound Dreamsign choices without revealing random results", () => {
    const source = card(sourceId, 17);
    const dreamsign = (idSeed: string, label: string) => ({
      id: testDreamsignId(idSeed),
      name: label,
      effectDescription: `Synthetic effect for ${label}.`,
      imageName: `${label.toLowerCase().replace(/ /gu, "-")}.webp`,
      imageAlt: `${label} art`,
    });
    const held = [
      dreamsign("10000000-0000-4000-8000-000000000001", "Held One"),
      dreamsign("10000000-0000-4000-8000-000000000002", "Held Two"),
      dreamsign("10000000-0000-4000-8000-000000000003", "Held Three"),
    ];
    const offered = [
      dreamsign("20000000-0000-4000-8000-000000000001", "Offered One"),
      dreamsign("20000000-0000-4000-8000-000000000002", "Offered Two"),
    ];
    const random = [
      dreamsign("30000000-0000-4000-8000-000000000001", "Random One"),
      dreamsign("30000000-0000-4000-8000-000000000002", "Random Two"),
      dreamsign("30000000-0000-4000-8000-000000000003", "Random Three"),
    ];
    const state = {
      ...createDefaultState(),
      dreamsigns: held,
      maxDreamsigns: 3,
    };
    const preparation = (
      kind:
        | "offered-gain"
        | "offered-replacement"
        | "replace-all-random"
        | "purge-and-gain-random",
      preparedDreamsignIds: DreamsignId[],
      requiredOverflowReplacementCount: number,
    ) => ({
      kind,
      requestedCount: preparedDreamsignIds.length,
      heldIdsAtPreparation: held.map((item) => item.id),
      maxDreamsignsAtPreparation: 3,
      poolBeforeIds: random.map((item) => item.id),
      poolBasisIds: random.map((item) => item.id),
      poolRegenerated: false,
      preparedDreamsignIds,
      requiredOverflowReplacementCount,
      planSignature: stableDigest(`signed:${kind}`),
    });
    const actionIds = {
      gain: testExplorationActionId("gain-offered"),
      replace: testExplorationActionId("replace-offered"),
      replaceAll: testExplorationActionId("replace-all-random"),
      purgeGain: testExplorationActionId("purge-gain-random"),
    } as const;
    const runtime: ExplorationSiteRuntime = {
      kind: "exploration",
      encounterCardId: source.id,
      actionOffers: [
        {
          actionId: actionIds.gain,
          offeredCardIds: [],
          offeredDreamsignIds: offered.map((item) => item.id),
          dreamsignPreparation: preparation(
            "offered-gain",
            offered.map((item) => item.id),
            1,
          ),
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: actionIds.replace,
          offeredCardIds: [],
          offeredDreamsignIds: offered.map((item) => item.id),
          dreamsignPreparation: preparation(
            "offered-replacement",
            offered.map((item) => item.id),
            0,
          ),
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: actionIds.replaceAll,
          offeredCardIds: [],
          offeredDreamsignIds: [],
          dreamsignPreparation: preparation(
            "replace-all-random",
            random.map((item) => item.id),
            0,
          ),
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
        {
          actionId: actionIds.purgeGain,
          offeredCardIds: [],
          offeredDreamsignIds: [],
          dreamsignPreparation: preparation(
            "purge-and-gain-random",
            random.slice(0, 2).map((item) => item.id),
            1,
          ),
          packCardIds: [],
          replacementCardIdByEntryId: {},
          transfigurationByEntryId: {},
        },
      ],
      resolution: null,
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
      exploration: {
        customCards: [],
        customDreamsigns: [...held, ...offered, ...random],
        encounters: [
          {
            cardId: source.id,
            prose: "The authored scene appears.",
            actions: [
              {
                id: actionIds.gain,
                label: "Choose an offered sign",
                effectText: "Choose one offered Dreamsign.",
                effectKind: "gain-offered-dreamsign",
              },
              {
                id: actionIds.replace,
                label: "Exchange signs",
                effectText: "Replace one Dreamsign with an offered Dreamsign.",
                effectKind: "replace-selected-dreamsign-with-offered",
              },
              {
                id: actionIds.replaceAll,
                label: "Change every sign",
                effectText: "Replace every Dreamsign at random.",
                effectKind: "replace-all-dreamsigns-random",
              },
              {
                id: actionIds.purgeGain,
                label: "Break and gather",
                effectText: "Purge one Dreamsign and gain two at random.",
                effectKind: "purge-selected-dreamsign-and-gain-random",
                count: 2,
              },
            ],
          },
        ],
      },
    } as unknown as JourneyContent;

    const unresolved = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      runtime,
      state,
      content,
    });
    expect(unresolved?.actions).toMatchObject([
      {
        id: actionIds.gain,
        available: true,
        followup: {
          kind: "dreamsign-flow",
          mode: "gain-offered",
          requiredOverflowReplacementCount: 1,
          offered: [{ id: offered[0].id }, { id: offered[1].id }],
          held: [{ id: held[0].id }, { id: held[1].id }, { id: held[2].id }],
        },
      },
      {
        id: actionIds.replace,
        available: true,
        followup: {
          kind: "dreamsign-flow",
          mode: "replace-with-offered",
        },
      },
      {
        id: actionIds.replaceAll,
        available: true,
        followup: { kind: "none" },
      },
      {
        id: actionIds.purgeGain,
        available: true,
        followup: {
          kind: "dreamsign-flow",
          mode: "purge-and-gain-random",
          offered: [],
          requiredOverflowReplacementCount: 1,
        },
      },
    ]);
    expect(serializedActionView(unresolved?.actions[2])).not.toContain(
      random[0].id,
    );
    expect(serializedActionView(unresolved?.actions[3])).not.toContain(
      random[0].id,
    );

    const belowCapacity = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      runtime: {
        ...runtime,
        actionOffers: runtime.actionOffers.map((offer) =>
          offer.actionId === actionIds.gain
            ? {
                ...offer,
                dreamsignPreparation: {
                  ...offer.dreamsignPreparation!,
                  maxDreamsignsAtPreparation: 4,
                  requiredOverflowReplacementCount: 0,
                },
              }
            : offer,
        ),
      },
      state: { ...state, maxDreamsigns: 4 },
      content,
    });
    expect(belowCapacity?.actions[0]).toMatchObject({
      available: true,
      followup: {
        kind: "dreamsign-flow",
        mode: "gain-offered",
        requiredOverflowReplacementCount: 0,
      },
    });

    const resolution: ExplorationResolution = {
      actionId: actionIds.purgeGain,
      selection: {
        purgedDreamsignId: held[0].id,
        overflowReplacementDreamsignIds: [held[1].id],
      },
      gainedCardIds: [],
      gainedDreamsignIds: random.slice(0, 2).map((item) => item.id),
      purgedCardIds: [],
      purgedDreamsignIds: [held[0].id, held[1].id],
      dreamsignMutation: {
        beforeIds: held.map((item) => item.id),
        afterIds: [held[2].id, random[0].id, random[1].id],
        offeredIds: [],
        gainedIds: [random[0].id, random[1].id],
        purgedIds: [held[0].id, held[1].id],
        replacements: [
          {
            removedDreamsignId: held[1].id,
            gainedDreamsignId: random[1].id,
          },
        ],
        poolBeforeIds: random.map((item) => item.id),
        poolAfterIds: [random[2].id],
        poolRegenerated: false,
      },
      affectedEntryIds: [],
      essenceGained: 0,
    };
    const resolved = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      runtime: { ...runtime, resolution },
      state: {
        ...state,
        dreamsigns: [held[2], random[0], random[1]],
      },
      content,
    });
    expect(resolved).toMatchObject({
      outcomeKind: "dreamsign-mutation",
      reward: {
        kind: "dreamsign-mutation",
        sourceKind: "purge-selected-dreamsign-and-gain-random",
        before: [{ id: held[0].id }, { id: held[1].id }, { id: held[2].id }],
        after: [{ id: held[2].id }, { id: random[0].id }, { id: random[1].id }],
        offered: [],
        gained: [{ id: random[0].id }, { id: random[1].id }],
        purged: [{ id: held[0].id }, { id: held[1].id }],
        replacements: [
          { removed: { id: held[1].id }, gained: { id: random[1].id } },
        ],
        poolRegenerated: false,
      },
    });

    const unavailable = buildExplorationSiteView({
      sceneNode: null,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      runtime: {
        ...runtime,
        actionOffers: runtime.actionOffers.map((offer) =>
          offer.actionId === actionIds.gain
            ? {
                ...offer,
                dreamsignPreparation: {
                  ...offer.dreamsignPreparation!,
                  unavailableReason: "insufficient-candidates" as const,
                },
              }
            : offer,
        ),
      },
      state,
      content,
    });
    expect(unavailable?.actions[0]?.available).toBe(false);
  });

  it("builds semantic outcomes for copied cards, next-battle modifiers, Reclaim, and Avatar replacement", () => {
    const source = card(sourceId, 17);
    const survivor = card(testCardId("f0000000-0000-4000-8000-000000000018"), 18);
    const avatars = Array.from({ length: 4 }, (_, index) => ({
      id: testAvatarId(`avatar-${String(index)}`),
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
          entryId: parseDeckEntryId("source-entry"),
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("copy-a"),
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("copy-b"),
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("survivor-entry"),
          cardNumber: survivor.cardNumber,
          transfiguration: null,
          keywordModification: { setReclaim: 2 },
          isBane: false,
        },
      ],
      avatar: {
        id: testAvatarId("avatar-2"),
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
      offerOverrides: Partial<
        ExplorationSiteRuntime["actionOffers"][number]
      > = {},
    ) => {
      const fallback: ExplorationActionContent = {
        id: testExplorationActionId("fallback"),
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
        avatars,
        dreamwellCards: [],
        dreamsignTemplates: [],
        dreamscapes: [],
        affiliations: [],
        guides: [guide],
        atlasData: MINIMAL_ATLAS_DATA,
        sitesData: MINIMAL_SITES_DATA,
        economyData: economyFixture(),
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
        guideLine: assertLocalized("Fixture line."),
        state,
        content,
        runtime: {
          kind: "exploration",
          encounterCardId: source.id,
          actionOffers: [
            {
              actionId: action.id,
              offeredCardIds: [],
              offeredAvatarIds: [
                testAvatarId("avatar-1"),
                testAvatarId("avatar-2"),
                testAvatarId("avatar-3"),
              ],
              packCardIds: [],
              replacementCardIdByEntryId: {},
              transfigurationByEntryId: {},
              ...offerOverrides,
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

    const emptyResolution = (
      actionId: ExplorationActionId,
    ): ExplorationResolution => ({
      actionId: actionId,
      gainedCardIds: [],
      gainedDreamsignIds: [],
      purgedCardIds: [],
      affectedEntryIds: [],
      essenceGained: 0,
    });

    const copied = build(
      {
        id: testExplorationActionId("copy"),
        label: "Copy",
        effectText: "Gain 2 copies of $DECK_CARD",
        effectKind: "copy-selected-card",
        count: 2,
      },
      {
        ...emptyResolution(testExplorationActionId("copy")),
        gainedCardIds: [source.id, source.id],
        gainedEntryIds: [parseDeckEntryId("copy-a"), parseDeckEntryId("copy-b")],
        affectedEntryIds: [parseDeckEntryId("source-entry")],
      },
    );
    expect(copied).toMatchObject({
      outcomeKind: "card-copies",
      reward: {
        kind: "card-copies",
        sourceEntryId: parseDeckEntryId("source-entry"),
        source: { entryId: parseDeckEntryId("source-entry") },
        cards: [
          { entryId: parseDeckEntryId("copy-a") },
          { entryId: parseDeckEntryId("copy-b") },
        ],
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
        id: testExplorationActionId("purge-copy"),
        label: "Purge and copy",
        effectText:
          "Purge a chosen card and gain a copy of another chosen card",
        effectKind: "purge-and-copy",
      },
      {
        ...emptyResolution(testExplorationActionId("purge-copy")),
        selection: {
          purgeEntryId: "source-entry",
          copyEntryId: "survivor-entry",
        },
        purgedCardIds: [source.id],
        purgedEntryIds: [parseDeckEntryId("source-entry")],
        purgedEntrySnapshots: [purgedSnapshot],
        gainedCardIds: [survivor.id],
        gainedEntryIds: [parseDeckEntryId("copy-b")],
        affectedEntryIds: [parseDeckEntryId("survivor-entry")],
      },
      purgeAndCopyState,
    );
    expect(purgedAndCopied).toMatchObject({
      outcomeKind: "purge-and-copy",
      reward: {
        kind: "purge-and-copy",
        purgedCard: {
          entryId: parseDeckEntryId("source-entry"),
          model: { cardId: source.id },
        },
        sourceEntryId: parseDeckEntryId("survivor-entry"),
        source: {
          entryId: parseDeckEntryId("survivor-entry"),
          model: { cardId: survivor.id },
        },
        cards: [
          { entryId: parseDeckEntryId("copy-b"), model: { cardId: survivor.id } },
        ],
        count: 1,
      },
    });

    const copiedMultiple = build(
      {
        id: testExplorationActionId("copy-multiple"),
        label: "Copy two",
        effectText: "Gain one copy of each of 2 chosen cards",
        effectKind: "copy-selected-cards",
        count: 2,
      },
      {
        ...emptyResolution(testExplorationActionId("copy-multiple")),
        selection: {
          entryIds: [
            parseDeckEntryId("source-entry"),
            parseDeckEntryId("survivor-entry"),
          ],
        },
        gainedCardIds: [source.id, survivor.id],
        gainedEntryIds: [parseDeckEntryId("copy-a"), parseDeckEntryId("copy-b")],
        affectedEntryIds: [
          parseDeckEntryId("source-entry"),
          parseDeckEntryId("survivor-entry"),
        ],
      },
    );
    expect(copiedMultiple).toMatchObject({
      outcomeKind: "card-copies-multiple",
      reward: {
        kind: "card-copies-multiple",
        count: 2,
        pairs: [
          {
            source: { entryId: parseDeckEntryId("source-entry") },
            copy: { entryId: parseDeckEntryId("copy-a") },
          },
          {
            source: { entryId: parseDeckEntryId("survivor-entry") },
            copy: { entryId: parseDeckEntryId("copy-b") },
          },
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
        id: testExplorationActionId("purge-for-essence"),
        label: "Yield",
        effectText: "Purge a chosen card and gain 20 essence for each ✦ it had",
        effectKind: "purge-for-essence",
        essencePerSpark: 20,
      },
      {
        ...emptyResolution(testExplorationActionId("purge-for-essence")),
        selection: { entryIds: [parseDeckEntryId("source-entry")] },
        purgedCardIds: [source.id],
        purgedEntryIds: [parseDeckEntryId("source-entry")],
        purgedEntrySnapshots: [
          {
            entryId: parseDeckEntryId("source-entry"),
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
        card: {
          entryId: parseDeckEntryId("source-entry"),
          model: { cardId: source.id },
        },
        spark: 5,
        essencePerSpark: 20,
        totalEssence: 100,
      },
    });

    const modifier = build(
      {
        id: testExplorationActionId("energy"),
        label: "Energy",
        effectText: "Gain 2 additional energy at the start of your next battle",
        effectKind: "next-battle-starting-energy",
        count: 2,
      },
      {
        ...emptyResolution(testExplorationActionId("energy")),
        battleModifier: {
          kind: "starting-energy",
          amount: 2,
          battlesRemaining: 1,
        },
      },
    );
    expect(modifier).toMatchObject({
      outcomeKind: "battle-modifier",
      reward: {
        kind: "battle-modifier",
        modifier: "starting-energy",
        amount: 2,
      },
    });

    const compoundModifier = build(
      {
        id: testExplorationActionId("compound-modifier"),
        label: "Enter the radiance",
        effectText:
          "Draw one fewer card at the start of your next battle. All cards cost 1● less during that battle.",
        effectKind: "next-battle-smaller-hand-and-cost-discount",
      },
      {
        ...emptyResolution(testExplorationActionId("compound-modifier")),
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
        id: testExplorationActionId("reclaim"),
        label: "Enter alone",
        effectText: "Purge duplicates and grant reclaim",
        effectKind: "purge-duplicates-and-grant-reclaim",
      },
      {
        ...emptyResolution(testExplorationActionId("reclaim")),
        purgedCardIds: [source.id, source.id, source.id],
        purgedEntryIds: [
          parseDeckEntryId("source-entry"),
          parseDeckEntryId("copy-a"),
          parseDeckEntryId("copy-b"),
        ],
        affectedEntryIds: [parseDeckEntryId("survivor-entry")],
        reclaimCostByEntryId: { [parseDeckEntryId("survivor-entry")]: 2 },
      },
      { ...baseState, deck: [baseState.deck[3]] },
    );
    expect(reclaim).toMatchObject({
      outcomeKind: "reclaim",
      reward: {
        objects: {
          purgedCards: [
            {
              entryId: parseDeckEntryId("source-entry"),
              model: { cardId: source.id },
            },
            { entryId: parseDeckEntryId("copy-a"), model: { cardId: source.id } },
            { entryId: parseDeckEntryId("copy-b"), model: { cardId: source.id } },
          ],
        },
        deckModification: {
          kind: "reclaim",
          cards: [{ entryId: parseDeckEntryId("survivor-entry") }],
          reclaimCostByEntryId: { "survivor-entry": 2 },
        },
      },
    });

    const avatar = build(
      {
        id: testExplorationActionId("avatar"),
        label: "Follow",
        effectText: "Pick a new Avatar from 3 choices",
        effectKind: "choose-avatar",
        offerCount: 3,
      },
      {
        ...emptyResolution(testExplorationActionId("avatar")),
        previousAvatarId: testAvatarId("avatar-0"),
        chosenAvatarId: testAvatarId("avatar-2"),
      },
    );
    expect(avatar).toMatchObject({
      outcomeKind: "avatar",
      reward: {
        kind: "avatar",
        previous: { id: testAvatarId("avatar-0") },
        current: { id: testAvatarId("avatar-2") },
      },
    });
    expect(avatar?.actions[0]).toMatchObject({
      followup: {
        kind: "avatars",
        avatars: [
          { id: testAvatarId("avatar-1") },
          { id: testAvatarId("avatar-2") },
          { id: testAvatarId("avatar-3") },
        ],
      },
    });

    const fixedEssence = build(
      {
        id: testExplorationActionId("fixed-essence"),
        label: "Gather",
        effectText: "Gain 100 essence",
        effectKind: "gain-essence",
        essence: 100,
      },
      {
        ...emptyResolution(testExplorationActionId("fixed-essence")),
        essenceBefore: 250,
        essenceGained: 100,
        essenceAfter: 350,
      },
    );
    expect(fixedEssence).toMatchObject({
      outcomeKind: "direct-essence",
      reward: {
        kind: "direct-essence",
        sourceKind: "gain-essence",
        essenceBefore: 250,
        essenceGained: 100,
        essenceAfter: 350,
      },
    });
    expect(fixedEssence?.actions[0]).toMatchObject({
      available: true,
      mechanics: { effectKind: "gain-essence", essence: 100 },
      followup: { kind: "none" },
    });

    const essencePreparation = {
      minimumEssence: 50,
      maximumEssence: 150,
      purpose: "essence-amount" as const,
      saltParts: ["exploration", explorationSite.id, "random-essence"],
      drawsConsumed: 1,
    };
    const randomEssence = build(
      {
        id: testExplorationActionId("random-essence"),
        label: "Harvest",
        effectText: "Gain a random amount of essence between 50 and 150",
        effectKind: "gain-random-essence",
        minimumEssence: 50,
        maximumEssence: 150,
      },
      {
        ...emptyResolution(testExplorationActionId("random-essence")),
        essenceBefore: 250,
        essenceGained: 87,
        essenceAfter: 337,
        essencePreparation,
      },
      baseState,
      { preparedEssenceAmount: 87, essencePreparation },
    );
    expect(randomEssence).toMatchObject({
      outcomeKind: "direct-essence",
      reward: {
        kind: "direct-essence",
        sourceKind: "gain-random-essence",
        essenceBefore: 250,
        essenceGained: 87,
        essenceAfter: 337,
        minimumEssence: 50,
        maximumEssence: 150,
      },
    });
    expect(randomEssence?.actions[0]).toMatchObject({
      available: true,
      mechanics: {
        effectKind: "gain-random-essence",
        minimumEssence: 50,
        maximumEssence: 150,
      },
    });

    const unavailableRandomEssence = build(
      {
        id: testExplorationActionId("random-unavailable"),
        label: "Harvest",
        effectText: "Gain a random amount of essence between 50 and 150",
        effectKind: "gain-random-essence",
        minimumEssence: 50,
        maximumEssence: 150,
      },
      {
        ...emptyResolution(testExplorationActionId("random-unavailable")),
        essenceBefore: 250,
        essenceAfter: 250,
      },
      baseState,
      {
        preparedEssenceAmount: 49,
        essencePreparation,
      },
    );
    expect(unavailableRandomEssence?.actions[0]).toMatchObject({
      available: false,
    });

    const doubledZeroEssence = build(
      {
        id: testExplorationActionId("double-essence"),
        label: "Balance",
        effectText: "Double your current essence",
        effectKind: "double-essence",
      },
      {
        ...emptyResolution(testExplorationActionId("double-essence")),
        essenceBefore: 0,
        essenceGained: 0,
        essenceAfter: 0,
      },
      { ...baseState, essence: 0 },
    );
    expect(doubledZeroEssence).toMatchObject({
      outcomeKind: "direct-essence",
      reward: {
        kind: "direct-essence",
        sourceKind: "double-essence",
        essenceBefore: 0,
        essenceGained: 0,
        essenceAfter: 0,
      },
    });

    const tookNone = build(
      {
        id: testExplorationActionId("take-none"),
        label: "Take any",
        effectText: "Take any number of Character cards from 4 choices",
        effectKind: "take-cards",
        predicate: "character",
        offerCount: 4,
      },
      {
        ...emptyResolution(testExplorationActionId("take-none")),
        selection: { cardIds: [] },
      },
    );
    expect(tookNone).toMatchObject({
      outcomeKind: "card-acquisition",
      reward: {
        semanticKind: "card-acquisition",
        objects: { cards: [], purgedCards: [], dreamsigns: [] },
      },
    });

    const purgeUpToTwo: ExplorationActionContent = {
      id: testExplorationActionId("purge-up-to-two"),
      label: "Stand Down the Escort",
      effectText: "Purge up to 2 chosen Character cards",
      effectKind: "purge-selected",
      predicate: "character",
      count: 2,
      followupTitle: "Stand Down the Escort",
      followupSubtitle: "Choose up to two Character cards to purge.",
    };
    const purgedTwo = build(purgeUpToTwo, {
      ...emptyResolution(purgeUpToTwo.id),
      selection: {
        entryIds: [
          parseDeckEntryId("source-entry"),
          parseDeckEntryId("survivor-entry"),
        ],
      },
      purgedCardIds: [source.id, survivor.id],
      purgedEntryIds: [
        parseDeckEntryId("source-entry"),
        parseDeckEntryId("survivor-entry"),
      ],
      purgedEntrySnapshots: [baseState.deck[0], baseState.deck[3]],
    });
    expect(purgedTwo).toMatchObject({
      outcomeKind: "card-purge",
      reward: {
        semanticKind: "card-purge",
        objects: {
          purgedCards: [
            {
              entryId: parseDeckEntryId("source-entry"),
              model: { cardId: source.id },
            },
            {
              entryId: parseDeckEntryId("survivor-entry"),
              model: { cardId: survivor.id },
            },
          ],
        },
      },
      actions: [
        {
          id: purgeUpToTwo.id,
          followup: {
            kind: "cards",
            mode: "exact",
            selectionKey: "entryIds",
            selectionOperation: "purge",
            min: 0,
            max: 2,
          },
        },
        { id: testExplorationActionId("fallback") },
      ],
    });

    const purgedNone = build(purgeUpToTwo, {
      ...emptyResolution(purgeUpToTwo.id),
      selection: { entryIds: [] },
      purgedEntryIds: [],
      purgedEntrySnapshots: [],
    });
    expect(purgedNone).toMatchObject({
      outcomeKind: "card-purge",
      reward: {
        semanticKind: "card-purge",
        objects: { cards: [], purgedCards: [], dreamsigns: [] },
      },
    });

    const replacement = build(
      {
        id: testExplorationActionId("replace-fixed"),
        label: "Replace",
        effectText: `Choose a card to purge and replace it with ${survivor.name}`,
        effectKind: "replace-selected-with-card",
        cardId: survivor.id,
      },
      {
        ...emptyResolution(testExplorationActionId("replace-fixed")),
        selection: { entryIds: [parseDeckEntryId("source-entry")] },
        purgedCardIds: [source.id],
        purgedEntryIds: [parseDeckEntryId("source-entry")],
        gainedCardIds: [survivor.id],
        gainedEntryIds: [parseDeckEntryId("replacement-entry")],
      },
    );
    expect(replacement).toMatchObject({
      outcomeKind: "card-replacement",
      reward: {
        semanticKind: "card-replacement",
        objects: {
          cards: [{ cardId: survivor.id }],
          purgedCards: [
            {
              entryId: parseDeckEntryId("source-entry"),
              model: { cardId: source.id },
            },
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

    const starterPurge = build(
      {
        id: testExplorationActionId("purge-random-starter"),
        label: "Release",
        effectText: "Purge a random Starter card",
        effectKind: "purge-random-starter-card",
      },
      {
        ...emptyResolution(testExplorationActionId("purge-random-starter")),
        purgedCardIds: [source.id],
        purgedEntryIds: [parseDeckEntryId("source-entry")],
        purgedEntrySnapshots: [baseState.deck[0]],
        starterCardReplacements: [],
      },
    );
    expect(starterPurge).toMatchObject({
      outcomeKind: "starter-card-mutation",
      reward: {
        kind: "starter-card-mutation",
        sourceKind: "purge-random-starter-card",
        mode: "purge",
        purged: [
          {
            entryId: parseDeckEntryId("source-entry"),
            model: { cardId: source.id },
          },
        ],
        replacements: [],
      },
    });

    const starterReplacementState: JourneyState = {
      ...baseState,
      deck: baseState.deck
        .filter((entry) => entry.entryId !== "source-entry")
        .map((entry) =>
          entry.entryId === "copy-a"
            ? { ...entry, cardNumber: survivor.cardNumber }
            : entry,
        ),
    };
    const starterReplacement = build(
      {
        id: testExplorationActionId("replace-random-starter"),
        label: "Exchange",
        effectText: "Purge a random Starter card and gain a Character card",
        effectKind: "purge-random-starter-and-gain-card",
        predicate: "character",
      },
      {
        ...emptyResolution(testExplorationActionId("replace-random-starter")),
        purgedCardIds: [source.id],
        purgedEntryIds: [parseDeckEntryId("source-entry")],
        purgedEntrySnapshots: [baseState.deck[0]],
        gainedCardIds: [survivor.id],
        gainedEntryIds: [parseDeckEntryId("copy-a")],
        resolvedPredicate: "character",
        starterCardReplacements: [
          {
            purgedEntryId: parseDeckEntryId("source-entry"),
            purgedCardId: source.id,
            gainedEntryId: parseDeckEntryId("copy-a"),
            gainedCardId: survivor.id,
          },
        ],
      },
      starterReplacementState,
    );
    expect(starterReplacement).toMatchObject({
      outcomeKind: "starter-card-mutation",
      reward: {
        kind: "starter-card-mutation",
        sourceKind: "purge-random-starter-and-gain-card",
        mode: "replace",
        purged: [
          {
            entryId: parseDeckEntryId("source-entry"),
            model: { cardId: source.id },
          },
        ],
        replacements: [
          {
            purged: { entryId: parseDeckEntryId("source-entry") },
            gained: {
              entryId: parseDeckEntryId("copy-a"),
              model: { cardId: survivor.id },
            },
          },
        ],
      },
    });

    const allStarterReplacementState: JourneyState = {
      ...baseState,
      deck: baseState.deck
        .filter(
          (entry) =>
            entry.entryId !== "source-entry" &&
            entry.entryId !== "survivor-entry",
        )
        .map((entry) =>
          entry.entryId === "copy-a"
            ? { ...entry, cardNumber: survivor.cardNumber }
            : { ...entry, cardNumber: source.cardNumber },
        ),
    };
    const allStarterReplacements = build(
      {
        id: testExplorationActionId("replace-all-starters"),
        label: "Rewrite",
        effectText: "Replace all Starter cards with Character cards",
        effectKind: "replace-all-starter-cards",
        predicate: "character",
      },
      {
        ...emptyResolution(testExplorationActionId("replace-all-starters")),
        purgedCardIds: [source.id, survivor.id],
        purgedEntryIds: [
          parseDeckEntryId("source-entry"),
          parseDeckEntryId("survivor-entry"),
        ],
        purgedEntrySnapshots: [baseState.deck[0], baseState.deck[3]],
        gainedCardIds: [survivor.id, source.id],
        gainedEntryIds: [parseDeckEntryId("copy-a"), parseDeckEntryId("copy-b")],
        resolvedPredicate: "character",
        starterCardReplacements: [
          {
            purgedEntryId: parseDeckEntryId("source-entry"),
            purgedCardId: source.id,
            gainedEntryId: parseDeckEntryId("copy-a"),
            gainedCardId: survivor.id,
          },
          {
            purgedEntryId: parseDeckEntryId("survivor-entry"),
            purgedCardId: survivor.id,
            gainedEntryId: parseDeckEntryId("copy-b"),
            gainedCardId: source.id,
          },
        ],
      },
      allStarterReplacementState,
    );
    expect(allStarterReplacements?.reward).toMatchObject({
      kind: "starter-card-mutation",
      sourceKind: "replace-all-starter-cards",
      mode: "replace",
      replacements: [
        {
          purged: { entryId: parseDeckEntryId("source-entry") },
          gained: { entryId: parseDeckEntryId("copy-a") },
        },
        {
          purged: { entryId: parseDeckEntryId("survivor-entry") },
          gained: { entryId: parseDeckEntryId("copy-b") },
        },
      ],
    });

    const inconsistentStarterReplacement = build(
      {
        id: testExplorationActionId("inconsistent-starter"),
        label: "Exchange",
        effectText: "Purge a random Starter card and gain a Character card",
        effectKind: "purge-random-starter-and-gain-card",
        predicate: "character",
      },
      {
        ...emptyResolution(testExplorationActionId("inconsistent-starter")),
        purgedCardIds: [source.id],
        purgedEntryIds: [parseDeckEntryId("source-entry")],
        purgedEntrySnapshots: [baseState.deck[0]],
        gainedCardIds: [survivor.id],
        gainedEntryIds: [parseDeckEntryId("copy-a")],
        starterCardReplacements: [],
      },
      starterReplacementState,
    );
    expect(inconsistentStarterReplacement?.reward).toBeNull();

    const future = build(
      {
        id: testExplorationActionId("future-transfigured-site"),
        label: "Follow",
        effectText:
          "The next draft or shop site will contain transfigured cards",
        effectKind: "transfigure-next-draft-or-shop",
      },
      {
        ...emptyResolution(testExplorationActionId("future-transfigured-site")),
        siteOfferModifier: {
          kind: "transfigure-next-draft-or-shop",
          sourceSiteId: explorationSite.id,
          sourceActionId: testExplorationActionId("future-transfigured-site"),
        },
      },
    );
    expect(future).toMatchObject({
      outcomeKind: "site-offer-modifier",
      reward: {
        kind: "site-offer-modifier",
        modifier: "transfigure-next-draft-or-shop",
        sourceSiteId: explorationSite.id,
        sourceActionId: testExplorationActionId("future-transfigured-site"),
      },
    });
  });

  it("builds all five signed compound action presentations without exposing unchosen random results", () => {
    const source = card(sourceId, 20);
    const deckCards = [
      card(testCardId("00000000-0000-4000-8000-000000000021"), 21),
      card(testCardId("00000000-0000-4000-8000-000000000022"), 22),
      card(testCardId("00000000-0000-4000-8000-000000000023"), 23),
      card(testCardId("00000000-0000-4000-8000-000000000024"), 24),
    ];
    const state: JourneyState = {
      ...createDefaultState(),
      activeSiteId: explorationSite.id,
      deck: deckCards.map((deckCard, index) => ({
        entryId: parseDeckEntryId(`compound-entry-${String(index)}`),
        cardNumber: deckCard.cardNumber,
        transfiguration: null,
        isBane: false,
      })),
    };
    const commonPreparation = {
      selectionRulesVersion: parseSelectionRulesVersion("2"),
      selectionContentRevision: parseSelectionContentRevision("compound-content-revision"),
      selectorSignatures: [],
      selectorTraces: [],
      planSignature: stableDigest("compound-plan-signature"),
    };
    const bindings = state.deck.map((entry, index) => ({
      entryId: entry.entryId,
      cardId: deckCards[index].id,
    }));
    const contentBase = {
      cardDatabase: new Map(
        [source, ...deckCards].map((fixtureCard) => [
          fixtureCard.cardNumber,
          fixtureCard,
        ]),
      ),
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      economyData: economyFixture(),
    };
    const build = (
      action: ExplorationActionContent,
      preparation: ExplorationCompoundActionPreparation,
    ) => {
      const content = {
        ...contentBase,
        exploration: {
          customCards: [],
          customDreamsigns: [],
          encounters: [
            {
              cardId: source.id,
              prose: "A compound fixture unfolds.",
              actions: [action],
            },
          ],
        },
      } as unknown as JourneyContent;
      return buildExplorationSiteView({
        sceneNode: null,
        site: explorationSite,
        guide,
        guideLine: assertLocalized("Fixture line."),
        state,
        content,
        runtime: {
          kind: "exploration",
          encounterCardId: source.id,
          actionOffers: [
            {
              actionId: action.id,
              canonicalMechanicId:
                preparation.kind === "take-transfigured-nightmares"
                  ? "transfigured-card-chooser"
                  : preparation.kind === "predicate-fast-nightmares"
                    ? "make-deck-fast"
                    : preparation.kind ===
                        "purge-disclosed-transfigure-same-type"
                      ? "purge-deck-entry"
                      : "transfigure-deck-entry",
              selectionPolicyId:
                preparation.kind === "take-transfigured-nightmares"
                  ? "card-fit"
                  : preparation.kind === "predicate-fast-nightmares"
                    ? undefined
                    : preparation.kind ===
                        "purge-disclosed-transfigure-same-type"
                      ? "purge-misfit"
                      : "uniform",
              selectionRulesVersion: preparation.selectionRulesVersion,
              selectionContentRevision: preparation.selectionContentRevision,
              selectionKey: preparation.selectionKey,
              selectionSignature: preparation.planSignature,
              selectionTraces: [...preparation.selectorTraces],
              compoundActionPreparation: preparation,
              offeredCardIds:
                preparation.kind === "take-transfigured-nightmares"
                  ? preparation.offeredCards.map((offer) => offer.cardId)
                  : [],
              offeredDeckEntryIds:
                preparation.kind === "purge-disclosed-transfigure-same-type"
                  ? preparation.target === null
                    ? []
                    : [preparation.target.entryId]
                  : preparation.kind === "purge-transfigure-copy"
                    ? preparation.targets.map((target) => target.entryId)
                    : [],
              packCardIds: [],
              replacementCardIdByEntryId: {},
              transfigurationByEntryId: {},
              ...(preparation.kind === "take-transfigured-nightmares"
                ? {
                    transfigurationByCardId: Object.fromEntries(
                      preparation.offeredCards.map((offer) => [
                        offer.cardId,
                        offer.transfiguration,
                      ]),
                    ),
                  }
                : {}),
            },
          ],
          resolution: null,
        },
      });
    };

    const allAction: ExplorationActionContent = {
      id: testExplorationActionId("compound-all"),
      label: "Recast everything",
      effectText: "Transfigure every card.",
      effectKind: "transfigure-all-cards",
    };
    const all = build(allAction, {
      ...commonPreparation,
      kind: "all-card-transfiguration",
      selectionKey: parseSelectionKey(allAction.id),
      allCards: bindings.map((binding) => ({
        ...binding,
        positiveForms: ["Kindled"],
      })),
      targets: bindings.map((binding) => ({
        ...binding,
        transfiguration: "Kindled",
      })),
    });
    expect(all?.actions[0]).toMatchObject({
      available: true,
      followup: { kind: "none" },
      automaticSelection: {},
    });

    const disclosedAction: ExplorationActionContent = {
      id: testExplorationActionId("compound-disclosed"),
      label: "Purge the disclosed card",
      effectText: txa(
        "Purge {deck_card} and transfigure its companions.",
        { deck_card: opaque(assertLocalized(deckCards[0].name)) },
        "[exploration] Synthetic compound effect purging one disclosed card and transforming related cards. deck_card is the proper card name.",
      ),
      effectKind: "purge-disclosed-and-transfigure-same-type",
      transfiguration: "Kindled",
    };
    const disclosed = build(disclosedAction, {
      ...commonPreparation,
      kind: "purge-disclosed-transfigure-same-type",
      selectionKey: parseSelectionKey(disclosedAction.id),
      transfiguration: "Kindled",
      eligiblePurgeTargets: bindings.map((binding) => ({
        ...binding,
        effectiveCardType: "Character",
      })),
      target: { ...bindings[0], effectiveCardType: "Character" },
      companionTargets: bindings.slice(1).map((binding) => ({
        ...binding,
        transfiguration: "Kindled",
      })),
    });
    const disclosedActionView = disclosed?.actions[0];
    expect(disclosedActionView).toMatchObject({
      available: true,
      automaticSelection: { entryIds: [bindings[0].entryId] },
    });
    const disclosedEntity = disclosedActionView?.effectText.annotations.deck_card;
    if (disclosedEntity?.kind !== "card") {
      throw new Error("Expected the disclosed compound target to be a card");
    }
    expect(disclosedEntity.entryId).toBe(bindings[0].entryId);

    const fastAction: ExplorationActionContent = {
      id: testExplorationActionId("compound-fast"),
      label: "Make the deck fast",
      effectText: "Make every Character Fast and gain Nightmares.",
      effectKind: "make-predicate-fast-and-gain-nightmares",
      predicate: "character",
      nightmareCount: 2,
    };
    expect(
      build(fastAction, {
        ...commonPreparation,
        kind: "predicate-fast-nightmares",
        selectionKey: parseSelectionKey(fastAction.id),
        predicate: "character",
        nightmareCount: 2,
        targets: bindings,
      })?.actions[0],
    ).toMatchObject({
      available: true,
      followup: { kind: "none" },
      automaticSelection: {},
    });

    const takeAction: ExplorationActionContent = {
      id: testExplorationActionId("compound-take"),
      label: "Take transformed cards",
      effectText: "Take any offered cards and gain Nightmares.",
      effectKind: "take-transfigured-cards-and-gain-nightmares",
      predicate: "character",
      offerCount: 4,
      transfiguration: "Kindled",
      nightmareCount: 2,
      followupTitle: "Choose transformed cards",
      followupSubtitle: "Choose zero to four.",
    };
    const take = build(takeAction, {
      ...commonPreparation,
      kind: "take-transfigured-nightmares",
      selectionKey: parseSelectionKey(takeAction.id),
      predicate: "character",
      offerCount: 4,
      transfiguration: "Kindled",
      nightmareCount: 2,
      offeredCards: bindings.map((binding) => ({
        cardId: binding.cardId,
        transfiguration: "Kindled",
      })),
    });
    expect(take?.actions[0]).toMatchObject({
      available: true,
      followup: {
        kind: "cards",
        selectionKey: "cardIds",
        min: 0,
        max: 4,
      },
    });
    expect(
      take?.actions[0]?.followup.kind === "cards"
        ? take.actions[0].followup.cards.every(
            (choice) => choice.model.transfiguration?.type === "Kindled",
          )
        : false,
    ).toBe(true);

    const purgeCopyAction: ExplorationActionContent = {
      id: testExplorationActionId("compound-purge-copy"),
      label: "Choose one to purge",
      effectText: "Purge one prepared card and copy the rest.",
      effectKind: "purge-one-transfigure-and-copy-others",
      offerCount: 4,
      transfiguration: "Kindled",
    };
    const purgeCopy = build(purgeCopyAction, {
      ...commonPreparation,
      kind: "purge-transfigure-copy",
      selectionKey: parseSelectionKey(purgeCopyAction.id),
      offerCount: 4,
      transfiguration: "Kindled",
      eligibleCards: bindings,
      targets: bindings.map((binding) => ({
        ...binding,
        transfiguration: "Kindled",
      })),
    });
    expect(purgeCopy?.actions[0]).toMatchObject({
      available: true,
      followup: {
        kind: "cards",
        selectionKey: "entryIds",
        min: 1,
        max: 1,
        cards: bindings.map((binding) => ({ entryId: binding.entryId })),
      },
    });
    expect(purgeCopy?.actions[0]?.automaticSelection).toBeUndefined();
  });

  it("reconstructs selected gained transfigurations only from persisted UUID results", () => {
    const source = card(sourceId, 30);
    const offered = [
      card(testCardId("00000000-0000-4000-8000-000000000031"), 31),
      card(testCardId("00000000-0000-4000-8000-000000000032"), 32),
      card(testCardId("00000000-0000-4000-8000-000000000033"), 33),
      card(testCardId("00000000-0000-4000-8000-000000000034"), 34),
    ];
    const nightmare = card(NIGHTMARE_CARD_ID, 35);
    const action: ExplorationActionContent = {
      id: testExplorationActionId("compound-selected-gain"),
      label: "Take transformed cards",
      effectText: "Take any offered cards and gain Nightmares.",
      effectKind: "take-transfigured-cards-and-gain-nightmares",
      predicate: "character",
      offerCount: 4,
      transfiguration: "Kindled",
      nightmareCount: 2,
    };
    const preparation: ExplorationCompoundActionPreparation = {
      kind: "take-transfigured-nightmares",
      predicate: "character",
      offerCount: 4,
      transfiguration: "Kindled",
      nightmareCount: 2,
      offeredCards: offered.map((offeredCard) => ({
        cardId: offeredCard.id,
        transfiguration: "Kindled",
      })),
      selectionRulesVersion: parseSelectionRulesVersion("2"),
      selectionContentRevision: parseSelectionContentRevision("compound-resolution-revision"),
      selectionKey: parseSelectionKey(action.id),
      selectorSignatures: [],
      selectorTraces: [],
      planSignature: stableDigest("compound-resolution-plan"),
    };
    const gainedEntries = [
      {
        entryId: parseDeckEntryId("gained-transfigured-a"),
        cardNumber: offered[0].cardNumber,
        transfiguration: "Kindled" as const,
        isBane: false,
      },
      {
        entryId: parseDeckEntryId("gained-transfigured-b"),
        cardNumber: offered[1].cardNumber,
        transfiguration: "Kindled" as const,
        isBane: false,
      },
    ];
    const nightmareEntries = [
      {
        entryId: parseDeckEntryId("gained-nightmare-a"),
        cardNumber: nightmare.cardNumber,
        transfiguration: null,
        isBane: true,
      },
      {
        entryId: parseDeckEntryId("gained-nightmare-b"),
        cardNumber: nightmare.cardNumber,
        transfiguration: null,
        isBane: true,
      },
    ];
    const content = {
      cardDatabase: new Map(
        [source, ...offered, nightmare].map((fixtureCard) => [
          fixtureCard.cardNumber,
          fixtureCard,
        ]),
      ),
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      economyData: economyFixture(),
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "A transformed offer unfolds.",
            actions: [action],
          },
        ],
      },
    } as unknown as JourneyContent;
    const offer = {
      actionId: action.id,
      canonicalMechanicId: "transfigured-card-chooser" as const,
      selectionPolicyId: "card-fit" as const,
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionKey: preparation.selectionKey,
      selectionSignature: preparation.planSignature,
      selectionTraces: [],
      compoundActionPreparation: preparation,
      offeredCardIds: preparation.offeredCards.map((card) => card.cardId),
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
      transfigurationByCardId: Object.fromEntries(
        preparation.offeredCards.map((card) => [
          card.cardId,
          card.transfiguration,
        ]),
      ),
    };
    const resolution: ExplorationResolution = {
      actionId: action.id,
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionSignature: preparation.planSignature,
      selection: { cardIds: [offered[0].id, offered[1].id] },
      gainedCardIds: [
        offered[0].id,
        offered[1].id,
        NIGHTMARE_CARD_ID,
        NIGHTMARE_CARD_ID,
      ],
      gainedEntryIds: [
        ...gainedEntries.map((entry) => entry.entryId),
        ...nightmareEntries.map((entry) => entry.entryId),
      ],
      gainedDreamsignIds: [],
      purgedCardIds: [],
      affectedEntryIds: gainedEntries.map((entry) => entry.entryId),
      essenceGained: 0,
      resolvedPredicate: "character",
      cardTransfigurations: gainedEntries.map((entry, index) => ({
        entryId: entry.entryId,
        cardId: offered[index].id,
        beforeTransfiguration: null,
        afterTransfiguration: "Kindled",
      })),
      nightmareGains: nightmareEntries.map((entry) => ({
        entryId: entry.entryId,
        cardId: NIGHTMARE_CARD_ID,
      })),
    };
    const build = (nextResolution: ExplorationResolution) =>
      buildExplorationSiteView({
        sceneNode: null,
        site: explorationSite,
        guide,
        guideLine: assertLocalized("Fixture line."),
        state: {
          ...createDefaultState(),
          activeSiteId: explorationSite.id,
          deck: [...gainedEntries, ...nightmareEntries],
        },
        content,
        runtime: {
          kind: "exploration",
          encounterCardId: source.id,
          actionOffers: [offer],
          resolution: nextResolution,
        },
      });

    expect(build(resolution)).toMatchObject({
      outcomeKind: "compound-card-mutation",
      reward: {
        kind: "compound-card-mutation",
        sourceKind: "take-transfigured-cards-and-gain-nightmares",
        purged: [],
        transfigurations: [
          {
            entryId: gainedEntries[0].entryId,
            cardId: offered[0].id,
            afterTransfiguration: "Kindled",
          },
          {
            entryId: gainedEntries[1].entryId,
            cardId: offered[1].id,
            afterTransfiguration: "Kindled",
          },
        ],
        nightmares: nightmareEntries.map((entry) => ({
          entryId: entry.entryId,
        })),
      },
    });
    expect(
      build({
        ...resolution,
        selection: { cardIds: [offered[0].id, offered[0].id] },
      })?.reward,
    ).toBeNull();
    expect(
      build({
        ...resolution,
        affectedEntryIds: [],
      })?.reward,
    ).toBeNull();
    const firstNightmareGain = resolution.nightmareGains?.[0];
    if (firstNightmareGain === undefined) {
      throw new Error("Expected a persisted Nightmare gain");
    }
    expect(
      build({
        ...resolution,
        nightmareGains: [
          ...(resolution.nightmareGains ?? []),
          firstNightmareGain,
        ],
      })?.reward,
    ).toBeNull();
  });

  it.each([
    {
      effectKind: "transfigure-selected",
      mode: "chosen-flexible",
      policy: "transfiguration-value",
      predicate: "event",
      fixedForm: undefined,
    },
    {
      effectKind: "transfigure-random-cards",
      mode: "random-flexible",
      policy: "uniform",
      predicate: "event",
      fixedForm: undefined,
    },
    {
      effectKind: "transfigure-fixed-random-cards",
      mode: "random-fixed",
      policy: "uniform",
      predicate: "cheap-character",
      fixedForm: "Kindled",
    },
    {
      effectKind: "transfigure-fixed-selected",
      mode: "chosen-fixed",
      policy: "transfiguration-value",
      predicate: "warrior",
      fixedForm: "Kindled",
    },
  ] as const)(
    "builds the complete $effectKind multi-card chooser or concealed automatic action and its generic persisted mappings",
    ({ effectKind, mode, policy, predicate, fixedForm }) => {
      const source = card(sourceId, 17);
      const first = {
        ...card(testCardId("f2000000-0000-4000-8000-000000000020"), 20),
        cardType:
          predicate === "event" ? ("Event" as const) : ("Character" as const),
        subtype:
          predicate === "event"
            ? ""
            : predicate === "warrior"
              ? "Warrior"
              : "Survivor",
      };
      const second = {
        ...card(testCardId("f2000000-0000-4000-8000-000000000021"), 21),
        cardType:
          predicate === "event" ? ("Event" as const) : ("Character" as const),
        subtype:
          predicate === "event"
            ? ""
            : predicate === "warrior"
              ? "Warrior"
              : "Survivor",
      };
      const eligibleCards = [first, second].map((candidate, index) => ({
        entryId: parseDeckEntryId(
          `multi-transfiguration-entry-${String(index + 1)}`,
        ),
        cardId: candidate.id,
        transfigurations:
          fixedForm === undefined
            ? predicate === "event"
              ? (["Empowered", "Inspired"] as const)
              : (["Empowered", "Kindled"] as const)
            : ([fixedForm] as const),
      }));
      const targets =
        mode === "chosen-flexible" || mode === "chosen-fixed"
          ? []
          : eligibleCards.map((binding, index) => ({
              entryId: binding.entryId,
              cardId: binding.cardId,
              transfiguration: fixedForm ?? binding.transfigurations[index % 2],
            }));
      const preparation: ExplorationMultiCardTransfigurationPreparation = {
        mode,
        eligibleCards,
        targets,
        selectionRulesVersion: parseSelectionRulesVersion("2"),
        selectionContentRevision: parseSelectionContentRevision("multi-transfiguration-content-v1"),
        selectionKey: parseSelectionKey("multi-transfiguration-key"),
        selectorSignatures:
          mode === "chosen-flexible" || mode === "chosen-fixed"
            ? []
            : [stableDigest("targets"), stableDigest("forms")],
        selectorTraces: [],
        planSignature: stableDigest("multi-transfiguration-plan"),
      };
      const action: ExplorationActionContent = {
        id: testExplorationActionId(`multi-${effectKind}`),
        label: "Rewrite two forms",
        effectText: "Transfigure two cards",
        followupTitle: "Rewrite two forms",
        followupSubtitle: "Choose exactly two cards and their forms.",
        effectKind,
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: policy,
        predicate,
        count: 2,
        ...(fixedForm === undefined ? {} : { transfiguration: fixedForm }),
      };
      const fallback: ExplorationActionContent = {
        id: testExplorationActionId("multi-transfiguration-fallback"),
        label: "Fallback",
        effectText: "Gain a card",
        effectKind: "gain-card",
        cardId: source.id,
      };
      const content = {
        cardDatabase: new Map([
          [source.cardNumber, source],
          [first.cardNumber, first],
          [second.cardNumber, second],
        ]),
        avatars: [],
        dreamwellCards: [],
        dreamsignTemplates: [],
        dreamscapes: [],
        affiliations: [],
        guides: [guide],
        atlasData: MINIMAL_ATLAS_DATA,
        sitesData: MINIMAL_SITES_DATA,
        economyData: economyFixture(),
        exploration: {
          customCards: [],
          customDreamsigns: [],
          encounters: [
            {
              cardId: source.id,
              prose: "A synthetic multi-transfiguration scene.",
              actions: [action, fallback],
            },
          ],
        },
      } as unknown as JourneyContent;
      const baseState: JourneyState = {
        ...createDefaultState(),
        deck: [first, second].map((candidate, index) => ({
          entryId: eligibleCards[index].entryId,
          cardNumber: candidate.cardNumber,
          transfiguration: null,
          isBane: false,
        })),
      };
      const build = (
        state: JourneyState,
        resolution: ExplorationResolution | null,
        offerOverrides: Partial<
          ExplorationSiteRuntime["actionOffers"][number]
        > = {},
      ) =>
        buildExplorationSiteView({
          sceneNode: null,
          site: explorationSite,
          guide,
          guideLine: assertLocalized("Fixture line."),
          state,
          content,
          runtime: {
            kind: "exploration",
            encounterCardId: source.id,
            actionOffers: [
              {
                actionId: action.id,
                canonicalMechanicId: "transfigure-deck-entry",
                selectionPolicyId: policy,
                selectionRulesVersion: preparation.selectionRulesVersion,
                selectionContentRevision: preparation.selectionContentRevision,
                selectionKey: preparation.selectionKey,
                selectionSignature: preparation.planSignature,
                selectionTraces: [...preparation.selectorTraces],
                multiCardTransfigurationPreparation: preparation,
                offeredCardIds: [],
                offeredDeckEntryIds: [],
                packCardIds: [],
                replacementCardIdByEntryId: {},
                transfigurationByEntryId: Object.fromEntries(
                  targets.map((target) => [
                    target.entryId,
                    target.transfiguration,
                  ]),
                ),
                ...offerOverrides,
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

      const prepared = build(baseState, null);
      if (effectKind === "transfigure-selected") {
        expect(prepared?.actions[0]).toMatchObject({
          available: true,
          followup: {
            kind: "multi-card-transfiguration",
            count: 2,
            candidates: [
              { entryId: eligibleCards[0].entryId },
              { entryId: eligibleCards[1].entryId },
            ],
          },
        });
        expect(prepared?.actions[0].automaticSelection).toBeUndefined();
      } else if (effectKind === "transfigure-fixed-selected") {
        expect(prepared?.actions[0]).toMatchObject({
          available: true,
          effectDisclosure: "(Fixture Kindled effect)",
          followup: {
            kind: "cards",
            mode: "exact",
            selectionOperation: "transfigure",
            min: 2,
            max: 2,
            cards: [
              { entryId: eligibleCards[0].entryId },
              { entryId: eligibleCards[1].entryId },
            ],
          },
        });
        expect(prepared?.actions[0].automaticSelection).toBeUndefined();
      } else {
        expect(prepared?.actions[0]).toMatchObject({
          available: true,
          followup: { kind: "none" },
          automaticSelection: {},
        });
        const concealed = serializedActionView(prepared?.actions[0]);
        expect(concealed).not.toContain(eligibleCards[0].entryId);
      }
      expect(
        build(baseState, null, { selectionSignature: stableDigest("tampered") })?.actions[0]
          .available,
      ).toBe(false);

      const committedTargets =
        mode === "chosen-flexible" || mode === "chosen-fixed"
          ? eligibleCards.map((binding, index) => ({
              entryId: binding.entryId,
              cardId: binding.cardId,
              transfiguration: fixedForm ?? binding.transfigurations[index % 2],
            }))
          : targets;
      const finalState: JourneyState = {
        ...baseState,
        deck: baseState.deck.map((entry, index) => ({
          ...entry,
          transfiguration: committedTargets[index].transfiguration,
        })),
      };
      const cardTransfigurations = committedTargets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      }));
      const resolution: ExplorationResolution = {
        actionId: action.id,
        selection:
          mode === "chosen-flexible"
            ? {
                entryIds: committedTargets
                  .map((target) => target.entryId)
                  .map(parseDeckEntryId),
                transfigurations: committedTargets.map(
                  (target) => target.transfiguration,
                ),
              }
            : mode === "chosen-fixed"
              ? {
                  entryIds: committedTargets
                    .map((target) => target.entryId)
                    .map(parseDeckEntryId),
                }
              : {},
        gainedCardIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: committedTargets
          .map((target) => target.entryId)
          .map(parseDeckEntryId),
        cardTransfigurations,
        essenceGained: 0,
      };
      const resolved = build(finalState, resolution);
      expect(resolved).toMatchObject({
        outcomeKind: "multi-card-transfiguration",
        reward: {
          kind: "multi-card-transfiguration",
          sourceKind: effectKind,
          transfigurations: [
            {
              entryId: committedTargets[0].entryId,
              cardId: committedTargets[0].cardId,
              beforeTransfiguration: null,
              afterTransfiguration: committedTargets[0].transfiguration,
              before: {
                entryId: committedTargets[0].entryId,
                model: { cardId: committedTargets[0].cardId },
              },
              after: {
                entryId: committedTargets[0].entryId,
                model: {
                  cardId: committedTargets[0].cardId,
                  transfiguration: {
                    type: committedTargets[0].transfiguration,
                  },
                },
              },
            },
            { entryId: committedTargets[1].entryId },
          ],
        },
      });
      expect(
        build(finalState, {
          ...resolution,
          cardTransfigurations: [
            { ...cardTransfigurations[0], afterTransfiguration: "Inspired" },
            cardTransfigurations[1],
          ],
        })?.reward,
      ).toBeNull();
      if (mode === "chosen-flexible" || mode === "chosen-fixed") {
        expect(
          build(finalState, {
            ...resolution,
            selection: {
              entryIds: [...committedTargets]
                .reverse()
                .map((target) => target.entryId)
                .map(parseDeckEntryId),
              ...(mode === "chosen-flexible"
                ? {
                    transfigurations: committedTargets.map(
                      (target) => target.transfiguration,
                    ),
                  }
                : {}),
            },
          })?.reward,
        ).toBeNull();
        expect(
          build(finalState, {
            ...resolution,
            selection: {
              entryIds: [
                committedTargets[0].entryId,
                committedTargets[0].entryId,
              ],
              ...(mode === "chosen-flexible"
                ? {
                    transfigurations: [
                      committedTargets[0].transfiguration,
                      committedTargets[0].transfiguration,
                    ],
                  }
                : {}),
            },
            affectedEntryIds: [
              committedTargets[0].entryId,
              committedTargets[0].entryId,
            ],
            cardTransfigurations: [
              cardTransfigurations[0],
              cardTransfigurations[0],
            ],
          })?.reward,
        ).toBeNull();
      }
    },
  );

  it.each([
    {
      effectKind: "transfigure-random-starter-cards",
      preparationKind: "random-count",
      count: 2,
    },
    {
      effectKind: "transfigure-all-starter-cards",
      preparationKind: "all",
      count: undefined,
    },
  ] as const)(
    "keeps the signed $effectKind targets concealed and resolves exact persisted form mappings",
    ({ effectKind, preparationKind, count }) => {
      const source = card(sourceId, 17);
      const firstStarter = {
        ...card(testCardId("f1000000-0000-4000-8000-000000000024"), 24),
        isStarter: true,
      };
      const secondStarter = {
        ...card(testCardId("f1000000-0000-4000-8000-000000000025"), 25),
        isStarter: true,
      };
      const starterCards = [
        {
          entryId: parseDeckEntryId("starter-transfigure-a"),
          cardId: firstStarter.id,
        },
        {
          entryId: parseDeckEntryId("starter-transfigure-b"),
          cardId: secondStarter.id,
        },
      ];
      const targets = [
        { ...starterCards[0], transfiguration: "Empowered" as const },
        { ...starterCards[1], transfiguration: "Kindled" as const },
      ];
      const preparation: ExplorationStarterCardTransfigurationPreparation = {
        kind: preparationKind,
        starterCards,
        eligibleStarterCards: starterCards,
        targets,
        selectionRulesVersion: parseSelectionRulesVersion("starter-transfiguration-rules-v1"),
        selectionContentRevision: parseSelectionContentRevision("starter-transfiguration-content-v1"),
        selectionKey: parseSelectionKey("starter-transfiguration-key"),
        selectorSignatures: [
          stableDigest("starter-targets"),
          stableDigest("starter-forms"),
        ],
        selectorTraces: [],
        planSignature: stableDigest("starter-transfiguration-plan"),
      };
      const action: ExplorationActionContent = {
        id: testExplorationActionId(`starter-transfiguration-${effectKind}`),
        label: "Rewrite the origins",
        effectText: "Transfigure the starter cards",
        effectKind,
        canonicalMechanicId: "transfigure-deck-entry",
        selectionPolicyId: "uniform",
        ...(count === undefined ? {} : { count }),
      };
      const fallback: ExplorationActionContent = {
        id: testExplorationActionId("starter-transfiguration-fallback"),
        label: "Fallback",
        effectText: "Gain a card",
        effectKind: "gain-card",
        cardId: source.id,
      };
      const content = {
        cardDatabase: new Map([
          [source.cardNumber, source],
          [firstStarter.cardNumber, firstStarter],
          [secondStarter.cardNumber, secondStarter],
        ]),
        avatars: [],
        dreamwellCards: [],
        dreamsignTemplates: [],
        dreamscapes: [],
        affiliations: [],
        guides: [guide],
        atlasData: MINIMAL_ATLAS_DATA,
        sitesData: MINIMAL_SITES_DATA,
        economyData: economyFixture(),
        exploration: {
          customCards: [],
          customDreamsigns: [],
          encounters: [
            {
              cardId: source.id,
              prose: "A synthetic starter-transfiguration scene.",
              actions: [action, fallback],
            },
          ],
        },
      } as unknown as JourneyContent;
      const baseState: JourneyState = {
        ...createDefaultState(),
        deck: [
          {
            entryId: starterCards[0].entryId,
            cardNumber: firstStarter.cardNumber,
            transfiguration: null,
            isBane: false,
          },
          {
            entryId: starterCards[1].entryId,
            cardNumber: secondStarter.cardNumber,
            transfiguration: null,
            isBane: false,
          },
        ],
      };
      const runtime = (
        state: JourneyState,
        resolution: ExplorationResolution | null,
        offerOverrides: Partial<
          ExplorationSiteRuntime["actionOffers"][number]
        > = {},
      ): ReturnType<typeof buildExplorationSiteView> =>
        buildExplorationSiteView({
          sceneNode: null,
          site: explorationSite,
          guide,
          guideLine: assertLocalized("Fixture line."),
          state,
          content,
          runtime: {
            kind: "exploration",
            encounterCardId: source.id,
            actionOffers: [
              {
                actionId: action.id,
                canonicalMechanicId: "transfigure-deck-entry",
                selectionPolicyId: "uniform",
                selectionRulesVersion: preparation.selectionRulesVersion,
                selectionContentRevision: preparation.selectionContentRevision,
                selectionKey: preparation.selectionKey,
                selectionSignature: preparation.planSignature,
                selectionTraces: [...preparation.selectorTraces],
                starterCardTransfigurationPreparation: preparation,
                offeredCardIds: [],
                offeredDeckEntryIds: [],
                packCardIds: [],
                replacementCardIdByEntryId: {},
                transfigurationByEntryId: Object.fromEntries(
                  targets.map((target) => [
                    target.entryId,
                    target.transfiguration,
                  ]),
                ),
                ...offerOverrides,
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

      const preparedView = runtime(baseState, null);
      expect(preparedView?.actions[0]).toMatchObject({
        available: true,
        followup: { kind: "none" },
        automaticSelection: {},
      });
      expect(preparedView?.actions[0].effectText.annotations).toEqual({});
      const concealedView = serializedActionView(preparedView?.actions[0]);
      expect(concealedView).not.toContain(starterCards[0].entryId);
      expect(concealedView).not.toContain(targets[0].transfiguration);
      expect(
        runtime(baseState, null, { selectionSignature: stableDigest("tampered-plan") })
          ?.actions[0].available,
      ).toBe(false);

      const finalState: JourneyState = {
        ...baseState,
        deck: baseState.deck.map((entry, index) => ({
          ...entry,
          transfiguration: targets[index].transfiguration,
        })),
      };
      const mappings = targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      }));
      const resolution: ExplorationResolution = {
        actionId: action.id,
        selection: {},
        gainedCardIds: [],
        gainedEntryIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        purgedEntryIds: [],
        purgedEntrySnapshots: [],
        starterCardReplacements: [],
        starterCardTransfigurations: mappings,
        affectedEntryIds: targets.map((target) => target.entryId),
        essenceGained: 0,
      };
      const resolvedView = runtime(finalState, resolution);
      expect(resolvedView).toMatchObject({
        outcomeKind: "starter-card-transfiguration",
        reward: {
          kind: "starter-card-transfiguration",
          sourceKind: effectKind,
          transfigurations: [
            {
              entryId: starterCards[0].entryId,
              cardId: firstStarter.id,
              beforeTransfiguration: null,
              afterTransfiguration: targets[0].transfiguration,
              before: {
                entryId: starterCards[0].entryId,
                model: { cardId: firstStarter.id },
              },
              after: {
                entryId: starterCards[0].entryId,
                model: {
                  cardId: firstStarter.id,
                  transfiguration: { type: targets[0].transfiguration },
                },
              },
            },
            {
              entryId: starterCards[1].entryId,
              cardId: secondStarter.id,
              beforeTransfiguration: null,
              afterTransfiguration: targets[1].transfiguration,
            },
          ],
        },
      });

      const mismatched = runtime(finalState, {
        ...resolution,
        starterCardTransfigurations: [
          { ...mappings[0], afterTransfiguration: "Inspired" },
          mappings[1],
        ],
      });
      expect(mismatched?.reward).toBeNull();
    },
  );

  it("conceals prepared multi-card replacements and reconstructs authoritative replacement mappings", () => {
    const encounter = card(sourceId, 17);
    const firstSource = {
      ...card(testCardId("f3000000-0000-4000-8000-000000000031"), 31),
      cardType: "Event" as const,
      subtype: "",
    };
    const secondSource = {
      ...card(testCardId("f3000000-0000-4000-8000-000000000032"), 32),
      cardType: "Event" as const,
      subtype: "",
    };
    const firstReplacement = {
      ...card(testCardId("f3000000-0000-4000-8000-000000000033"), 33),
      cardType: "Event" as const,
      subtype: "",
    };
    const secondReplacement = {
      ...card(testCardId("f3000000-0000-4000-8000-000000000034"), 34),
      cardType: "Event" as const,
      subtype: "",
    };
    const bindings = [
      {
        sourceEntryId: parseDeckEntryId("replace-source-a"),
        sourceCardId: firstSource.id,
        replacementCardId: firstReplacement.id,
      },
      {
        sourceEntryId: parseDeckEntryId("replace-source-b"),
        sourceCardId: secondSource.id,
        replacementCardId: secondReplacement.id,
      },
    ];
    const selectorTraces = [{ fixture: "a" }, { fixture: "b" }] as never;
    const preparation: MultiCardReplacementPreparation = {
      kind: "chosen-replacement",
      predicate: "event",
      authoredMaximumCount: 2,
      bindings,
      selectionRulesVersion: parseSelectionRulesVersion("2"),
      selectionContentRevision: parseSelectionContentRevision("replacement-content-v1"),
      selectionKey: parseSelectionKey("replacement-action"),
      selectorSignatures: [
        stableDigest("replacement-a"),
        stableDigest("replacement-b"),
      ],
      selectorTraces,
      planSignature: stableDigest("replacement-plan"),
    };
    const action: ExplorationActionContent = {
      id: testExplorationActionId("replacement-action"),
      label: "Exchange two echoes",
      effectText: "Replace up to two Events",
      followupTitle: "Choose echoes",
      followupSubtitle: "Choose one or two Events.",
      effectKind: "replace-selected",
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "card-fit-quality",
      predicate: "event",
      count: 2,
    };
    const content = {
      cardDatabase: new Map(
        [
          encounter,
          firstSource,
          secondSource,
          firstReplacement,
          secondReplacement,
        ].map((candidate) => [candidate.cardNumber, candidate]),
      ),
      avatars: [],
      dreamwellCards: [],
      dreamsignTemplates: [],
      dreamscapes: [],
      affiliations: [],
      guides: [guide],
      atlasData: MINIMAL_ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      economyData: economyFixture(),
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: encounter.id,
            prose: "A synthetic replacement scene.",
            actions: [action],
          },
        ],
      },
    } as unknown as JourneyContent;
    const sourceEntries = [firstSource, secondSource].map(
      (candidate, index) => ({
        entryId: bindings[index].sourceEntryId,
        cardNumber: candidate.cardNumber,
        transfiguration: null,
        isBane: false,
      }),
    );
    const offer = {
      actionId: action.id,
      canonicalMechanicId: "replace-deck-entry" as const,
      selectionPolicyId: "card-fit-quality" as const,
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionKey: preparation.selectionKey,
      selectionSignature: preparation.planSignature,
      selectionTraces: [...preparation.selectorTraces],
      multiCardReplacementPreparation: preparation,
      offeredCardIds: [],
      offeredDeckEntryIds: [],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
    };
    const build = (
      state: JourneyState,
      resolution: ExplorationResolution | null,
      offerOverrides: Partial<typeof offer> = {},
    ) =>
      buildExplorationSiteView({
        sceneNode: null,
        site: explorationSite,
        guide,
        guideLine: assertLocalized("Fixture line."),
        state,
        content,
        runtime: {
          kind: "exploration",
          encounterCardId: encounter.id,
          actionOffers: [{ ...offer, ...offerOverrides }],
          resolution,
        },
      });
    const beforeState = { ...createDefaultState(), deck: sourceEntries };
    const prepared = build(beforeState, null);
    expect(prepared?.actions[0]).toMatchObject({
      available: true,
      followup: {
        kind: "cards",
        mode: "exact",
        min: 1,
        max: 2,
        selectionOperation: "purge",
        cards: [
          { entryId: bindings[0].sourceEntryId },
          { entryId: bindings[1].sourceEntryId },
        ],
      },
    });
    expect(prepared?.actions[0].automaticSelection).toBeUndefined();
    expect(serializedActionView(prepared?.actions[0])).not.toContain(
      firstReplacement.id,
    );
    expect(
      build(beforeState, null, { selectionSignature: stableDigest("tampered") })?.actions[0]
        .available,
    ).toBe(false);

    const gainedEntries = [
      {
        entryId: parseDeckEntryId("replace-gained-a"),
        cardNumber: firstReplacement.cardNumber,
        transfiguration: null,
        isBane: false,
      },
      {
        entryId: parseDeckEntryId("replace-gained-b"),
        cardNumber: secondReplacement.cardNumber,
        transfiguration: null,
        isBane: false,
      },
    ];
    const mappings = bindings.map((binding, index) => ({
      sourceEntryId: binding.sourceEntryId,
      sourceCardId: binding.sourceCardId,
      replacementEntryId: gainedEntries[index].entryId,
      replacementCardId: binding.replacementCardId,
    }));
    const resolution: ExplorationResolution = {
      actionId: action.id,
      selection: { entryIds: bindings.map((binding) => binding.sourceEntryId) },
      gainedCardIds: mappings.map((mapping) => mapping.replacementCardId),
      gainedEntryIds: mappings.map((mapping) => mapping.replacementEntryId),
      gainedDreamsignIds: [],
      purgedCardIds: mappings.map((mapping) => mapping.sourceCardId),
      purgedEntryIds: mappings.map((mapping) => mapping.sourceEntryId),
      purgedEntrySnapshots: sourceEntries,
      affectedEntryIds: mappings.map((mapping) => mapping.sourceEntryId),
      cardReplacements: mappings,
      essenceGained: 0,
    };
    expect(
      build({ ...beforeState, deck: gainedEntries }, resolution),
    ).toMatchObject({
      outcomeKind: "card-replacements",
      reward: {
        kind: "card-replacements",
        sourceKind: "replace-selected",
        replacements: [
          {
            purged: { entryId: bindings[0].sourceEntryId },
            gained: { entryId: gainedEntries[0].entryId },
          },
          {
            purged: { entryId: bindings[1].sourceEntryId },
            gained: { entryId: gainedEntries[1].entryId },
          },
        ],
      },
    });
    expect(
      build(
        { ...beforeState, deck: gainedEntries },
        {
          ...resolution,
          cardReplacements: [
            { ...mappings[0], replacementCardId: secondReplacement.id },
            mappings[1],
          ],
        },
      )?.reward,
    ).toBeNull();
    const duplicateSourceMapping = mappings[0];
    expect(
      build(
        { ...beforeState, deck: [gainedEntries[0]] },
        {
          ...resolution,
          selection: {
            entryIds: [
              duplicateSourceMapping.sourceEntryId,
              duplicateSourceMapping.sourceEntryId,
            ],
          },
          gainedCardIds: [
            duplicateSourceMapping.replacementCardId,
            duplicateSourceMapping.replacementCardId,
          ],
          gainedEntryIds: [
            duplicateSourceMapping.replacementEntryId,
            duplicateSourceMapping.replacementEntryId,
          ],
          purgedCardIds: [
            duplicateSourceMapping.sourceCardId,
            duplicateSourceMapping.sourceCardId,
          ],
          purgedEntryIds: [
            duplicateSourceMapping.sourceEntryId,
            duplicateSourceMapping.sourceEntryId,
          ],
          purgedEntrySnapshots: [sourceEntries[0], sourceEntries[0]],
          affectedEntryIds: [
            duplicateSourceMapping.sourceEntryId,
            duplicateSourceMapping.sourceEntryId,
          ],
          cardReplacements: [duplicateSourceMapping, duplicateSourceMapping],
        },
      )?.reward,
    ).toBeNull();
  });

  it.each([
    {
      effectKind: "copy-random-cards",
      mechanicId: "duplicate-deck-entry",
      predicate: "character" as const,
      cardType: undefined,
    },
    {
      effectKind: "change-random-card-type",
      mechanicId: "change-entry-card-type",
      predicate: undefined,
      cardType: "Event" as const,
    },
  ] as const)(
    "conceals $effectKind targets and reconstructs its exact persisted mappings",
    ({ effectKind, mechanicId, predicate, cardType }) => {
      const encounter = card(sourceId, 17);
      const first = card(testCardId("f4000000-0000-4000-8000-000000000041"), 41);
      const second =
        effectKind === "copy-random-cards"
          ? first
          : card(testCardId("f4000000-0000-4000-8000-000000000042"), 42);
      const bindings = [first, second].map((candidate, index) => ({
        entryId: parseDeckEntryId(`random-target-${String(index + 1)}`),
        cardId: candidate.id,
      }));
      const selectorTrace = { fixture: effectKind } as never;
      const preparation: ExplorationRandomDeckTargetPreparation = {
        effectKind,
        count: 2,
        ...(predicate === undefined ? {} : { predicate }),
        ...(cardType === undefined ? {} : { cardType }),
        eligibleCards: bindings,
        targets: bindings,
        selectionRulesVersion: parseSelectionRulesVersion("2"),
        selectionContentRevision: parseSelectionContentRevision("random-target-content-v1"),
        selectionKey: parseSelectionKey(
          "random-target-action:random-deck-targets",
        ),
        selectorSignature: stableDigest("random-target-selector"),
        selectorTrace,
        planSignature: stableDigest("random-target-plan"),
      };
      const action: ExplorationActionContent = {
        id: testExplorationActionId("random-target-action"),
        label: "Resolve random cards",
        effectText: "Resolve two random cards",
        effectKind,
        canonicalMechanicId: mechanicId,
        selectionPolicyId: "uniform",
        count: 2,
        ...(predicate === undefined ? {} : { predicate }),
        ...(cardType === undefined ? {} : { cardType }),
      };
      const content = {
        cardDatabase: new Map(
          [encounter, first, second].map((candidate) => [
            candidate.cardNumber,
            candidate,
          ]),
        ),
        avatars: [],
        dreamwellCards: [],
        dreamsignTemplates: [],
        dreamscapes: [],
        affiliations: [],
        guides: [guide],
        atlasData: MINIMAL_ATLAS_DATA,
        sitesData: MINIMAL_SITES_DATA,
        economyData: economyFixture(),
        exploration: {
          customCards: [],
          customDreamsigns: [],
          encounters: [
            {
              cardId: encounter.id,
              prose: "A synthetic random target scene.",
              actions: [action],
            },
          ],
        },
      } as unknown as JourneyContent;
      const beforeEntries = [first, second].map((candidate, index) => ({
        entryId: bindings[index].entryId,
        cardNumber: candidate.cardNumber,
        transfiguration: null,
        isBane: false,
      }));
      const offer = {
        actionId: action.id,
        canonicalMechanicId: mechanicId,
        selectionPolicyId: "uniform" as const,
        selectionRulesVersion: preparation.selectionRulesVersion,
        selectionContentRevision: preparation.selectionContentRevision,
        selectionKey: preparation.selectionKey,
        selectionSignature: preparation.planSignature,
        selectionTrace: preparation.selectorTrace,
        randomDeckTargetPreparation: preparation,
        offeredCardIds: [],
        offeredDeckEntryIds: [],
        packCardIds: [],
        replacementCardIdByEntryId: {},
        transfigurationByEntryId: {},
      };
      const build = (
        state: JourneyState,
        resolution: ExplorationResolution | null,
        offerOverrides: Partial<typeof offer> = {},
      ) =>
        buildExplorationSiteView({
          sceneNode: null,
          site: explorationSite,
          guide,
          guideLine: assertLocalized("Fixture line."),
          state,
          content,
          runtime: {
            kind: "exploration",
            encounterCardId: encounter.id,
            actionOffers: [{ ...offer, ...offerOverrides }],
            resolution,
          },
        });
      const beforeState = { ...createDefaultState(), deck: beforeEntries };
      const prepared = build(beforeState, null);
      expect(prepared?.actions[0]).toMatchObject({
        available: true,
        followup: { kind: "none" },
        automaticSelection: {},
      });
      const concealed = serializedActionView(prepared?.actions[0]);
      expect(concealed).not.toContain(bindings[0].entryId);
      expect(concealed).not.toContain(bindings[1].entryId);
      expect(
        build(beforeState, null, { selectionSignature: stableDigest("tampered") })?.actions[0]
          .available,
      ).toBe(false);

      if (effectKind === "copy-random-cards") {
        const copies = beforeEntries.map((entry, index) => ({
          ...entry,
          entryId: parseDeckEntryId(`random-copy-${String(index + 1)}`),
        }));
        const mappings = bindings.map((binding, index) => ({
          sourceEntryId: binding.entryId,
          sourceCardId: binding.cardId,
          mintedEntryId: copies[index].entryId,
          mintedCardId: binding.cardId,
        }));
        const resolution: ExplorationResolution = {
          actionId: action.id,
          selection: {},
          gainedCardIds: mappings.map((mapping) => mapping.mintedCardId),
          gainedEntryIds: mappings
            .map((mapping) => mapping.mintedEntryId)
            .map(parseDeckEntryId),
          gainedDreamsignIds: [],
          purgedCardIds: [],
          affectedEntryIds: mappings
            .map((mapping) => mapping.sourceEntryId)
            .map(parseDeckEntryId),
          cardCopies: mappings,
          essenceGained: 0,
        };
        expect(
          build(
            { ...beforeState, deck: [...beforeEntries, ...copies] },
            resolution,
          ),
        ).toMatchObject({
          outcomeKind: "card-copies-multiple",
          reward: {
            kind: "card-copies-multiple",
            pairs: [
              {
                source: { entryId: bindings[0].entryId },
                copy: { entryId: copies[0].entryId },
              },
              {
                source: { entryId: bindings[1].entryId },
                copy: { entryId: copies[1].entryId },
              },
            ],
          },
        });
        expect(
          build(
            { ...beforeState, deck: [...beforeEntries, ...copies] },
            {
              ...resolution,
              cardCopies: [
                {
                  ...mappings[0],
                  sourceEntryId: bindings[1].entryId,
                },
                mappings[1],
              ],
            },
          )?.reward,
        ).toBeNull();
        expect(
          build(
            { ...beforeState, deck: [...beforeEntries, ...copies] },
            {
              ...resolution,
              gainedEntryIds: [
                copies[0].entryId,
                copies[0].entryId,
              ],
              cardCopies: [
                mappings[0],
                {
                  ...mappings[1],
                  mintedEntryId: copies[0].entryId,
                },
              ],
            },
          )?.reward,
        ).toBeNull();
        return;
      }

      const afterTypeChange: CardTypeChange = {
        predicateId: parseCardTypeChangePredicateId("exploration:card-type:Event"),
        cardType: "Event" as const,
        subtype: "",
        label: "Event",
      };
      const finalEntries = beforeEntries.map((entry) => ({
        ...entry,
        typeChange: afterTypeChange,
      }));
      const mappings = bindings.map((binding) => ({
        entryId: binding.entryId,
        cardId: binding.cardId,
        beforeCardType: "Character" as const,
        afterCardType: "Event" as const,
        beforeTypeChange: null,
        afterTypeChange,
      }));
      const resolution: ExplorationResolution = {
        actionId: action.id,
        selection: {},
        gainedCardIds: [],
        gainedEntryIds: [],
        gainedDreamsignIds: [],
        purgedCardIds: [],
        affectedEntryIds: mappings
          .map((mapping) => mapping.entryId)
          .map(parseDeckEntryId),
        resolvedCardType: "Event",
        cardTypeChanges: mappings,
        essenceGained: 0,
      };
      expect(
        build({ ...beforeState, deck: finalEntries }, resolution),
      ).toMatchObject({
        outcomeKind: "card-type-changes",
        reward: {
          kind: "card-type-changes",
          sourceKind: "change-random-card-type",
          changes: [
            {
              entryId: bindings[0].entryId,
              cardId: bindings[0].cardId,
              beforeCardType: "Character",
              afterCardType: "Event",
              before: {
                model: { displaySnapshot: { cardType: "Character" } },
              },
              after: { model: { displaySnapshot: { cardType: "Event" } } },
            },
            { entryId: bindings[1].entryId },
          ],
        },
      });
      expect(
        build(
          { ...beforeState, deck: finalEntries },
          {
            ...resolution,
            cardTypeChanges: [
              { ...mappings[0], afterCardType: "Character" },
              mappings[1],
            ],
          },
        )?.reward,
      ).toBeNull();
    },
  );

  it("conceals a fixed replacement source and reconstructs its exact before/after pair", () => {
    const encounter = card(sourceId, 17);
    const source = card(testCardId("f4800000-0000-4000-8000-000000000048"), 48);
    const replacement = card(
      testCardId("f4800000-0000-4000-8000-000000000049"),
      49,
    );
    const sourceEntry = {
      entryId: parseDeckEntryId("random-replacement-source"),
      cardNumber: source.cardNumber,
      transfiguration: null,
      isBane: false,
    };
    const gainedEntry = {
      entryId: parseDeckEntryId("random-replacement-gained"),
      cardNumber: replacement.cardNumber,
      transfiguration: null,
      isBane: false,
    };
    const action: ExplorationActionContent = {
      id: testExplorationActionId("random-fixed-replacement-action"),
      label: "Replace one card",
      effectText: txa(
        "Replace a random Character with {fixed_card}",
        { fixed_card: opaque(assertLocalized(replacement.name)) },
        "[exploration] Synthetic effect replacing a concealed card with one fixed card. fixed_card is the replacement card's proper name.",
      ),
      effectKind: "replace-random-with-card",
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "uniform",
      predicate: "character",
      cardId: replacement.id,
    };
    const preparation: ExplorationRandomDeckTargetPreparation = {
      effectKind: "replace-random-with-card",
      count: 1,
      predicate: "character",
      replacementCardId: replacement.id,
      eligibleCards: [{ entryId: sourceEntry.entryId, cardId: source.id }],
      targets: [{ entryId: sourceEntry.entryId, cardId: source.id }],
      selectionRulesVersion: parseSelectionRulesVersion("2"),
      selectionContentRevision: parseSelectionContentRevision("replacement-content-v1"),
      selectionKey: parseSelectionKey(`${action.id}:random-deck-targets`),
      selectorSignature: stableDigest("replacement-selector"),
      selectorTrace: { fixture: "replacement" } as never,
      planSignature: stableDigest("replacement-plan"),
    };
    const content = {
      cardDatabase: new Map(
        [encounter, source, replacement].map((candidate) => [
          candidate.cardNumber,
          candidate,
        ]),
      ),
      guides: [guide],
      sitesData: MINIMAL_SITES_DATA,
      atlasData: MINIMAL_ATLAS_DATA,
      economyData: economyFixture(),
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: encounter.id,
            prose: "A concealed replacement fixture.",
            actions: [action],
          },
        ],
      },
    } as unknown as JourneyContent;
    const offer = {
      actionId: action.id,
      canonicalMechanicId: "replace-deck-entry" as const,
      selectionPolicyId: "uniform" as const,
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionKey: preparation.selectionKey,
      selectionSignature: preparation.planSignature,
      selectionTrace: preparation.selectorTrace,
      randomDeckTargetPreparation: preparation,
      offeredCardIds: [],
      offeredDeckEntryIds: [],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
    };
    const build = (
      state: JourneyState,
      resolution: ExplorationResolution | null,
    ) =>
      buildExplorationSiteView({
        sceneNode: null,
        site: explorationSite,
        guide,
        guideLine: assertLocalized("Fixture line."),
        state,
        content,
        runtime: {
          kind: "exploration",
          encounterCardId: encounter.id,
          actionOffers: [offer],
          resolution,
        },
      });
    const beforeState = { ...createDefaultState(), deck: [sourceEntry] };
    const prepared = build(beforeState, null);
    expect(prepared?.actions[0]).toMatchObject({
      available: true,
      followup: { kind: "none" },
      automaticSelection: {},
    });
    expect(prepared?.actions[0].effectText.annotations).toMatchObject({
      fixed_card: { kind: "card", card: { id: replacement.id } },
    });
    expect(serializedActionView(prepared?.actions[0])).not.toContain(
      sourceEntry.entryId,
    );
    const mapping = {
      sourceEntryId: sourceEntry.entryId,
      sourceCardId: source.id,
      replacementEntryId: gainedEntry.entryId,
      replacementCardId: replacement.id,
    };
    const resolution: ExplorationResolution = {
      actionId: action.id,
      selection: {},
      gainedCardIds: [replacement.id],
      gainedEntryIds: [gainedEntry.entryId],
      gainedDreamsignIds: [],
      purgedCardIds: [source.id],
      purgedEntryIds: [sourceEntry.entryId],
      purgedEntrySnapshots: [sourceEntry],
      affectedEntryIds: [sourceEntry.entryId],
      resolvedPredicate: "character",
      cardReplacements: [mapping],
      essenceGained: 0,
    };
    expect(
      build({ ...beforeState, deck: [gainedEntry] }, resolution),
    ).toMatchObject({
      outcomeKind: "card-replacements",
      reward: {
        kind: "card-replacements",
        sourceKind: "replace-random-with-card",
        replacements: [
          {
            purged: { entryId: sourceEntry.entryId },
            gained: { entryId: gainedEntry.entryId },
          },
        ],
      },
    });
  });

  it("discloses one prepared card-type target and reconstructs its persisted flip", () => {
    const encounter = card(sourceId, 17);
    const event = {
      ...card(testCardId("f5300000-0000-4000-8000-000000000053"), 53),
      cardType: "Event" as const,
      subtype: "",
      spark: null,
    };
    const entry = {
      entryId: parseDeckEntryId("disclosed-type-target"),
      cardNumber: event.cardNumber,
      transfiguration: null,
      isBane: false,
    };
    const action: ExplorationActionContent = {
      id: testExplorationActionId("disclosed-type-action"),
      label: "Change the revealed card",
      effectText: txa(
        "Change {deck_card} to become a {card_type}",
        {
          deck_card: opaque(assertLocalized(event.name)),
          card_type: opaque(assertLocalized("Character")),
        },
        "[exploration] Synthetic effect changing one disclosed deck card's card type. deck_card is the proper card name and card_type is the canonical destination card type.",
      ),
      effectKind: "change-card-type-selected",
      canonicalMechanicId: "change-entry-card-type",
      selectionPolicyId: "deck-entry-centrality",
      cardType: "Character",
      deckTarget: "offered",
    };
    const preparation: ExplorationDisclosedDeckTargetPreparation = {
      effectKind: "change-card-type-selected",
      cardType: "Character",
      eligibleCards: [{ entryId: entry.entryId, cardId: event.id }],
      target: { entryId: entry.entryId, cardId: event.id },
      selectionRulesVersion: parseSelectionRulesVersion("2"),
      selectionContentRevision: parseSelectionContentRevision("disclosed-content-v1"),
      selectionKey: parseSelectionKey(`${action.id}:disclosed-deck-target`),
      selectorSignature: stableDigest("disclosed-selector"),
      selectorTrace: { fixture: "disclosed" } as never,
      planSignature: stableDigest("disclosed-plan"),
    };
    const content = {
      cardDatabase: new Map(
        [encounter, event].map((candidate) => [
          candidate.cardNumber,
          candidate,
        ]),
      ),
      guides: [guide],
      sitesData: MINIMAL_SITES_DATA,
      atlasData: MINIMAL_ATLAS_DATA,
      economyData: economyFixture(),
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: encounter.id,
            prose: "A disclosed type fixture.",
            actions: [action],
          },
        ],
      },
    } as unknown as JourneyContent;
    const offer = {
      actionId: action.id,
      canonicalMechanicId: "change-entry-card-type" as const,
      selectionPolicyId: "deck-entry-centrality" as const,
      selectionRulesVersion: preparation.selectionRulesVersion,
      selectionContentRevision: preparation.selectionContentRevision,
      selectionKey: preparation.selectionKey,
      selectionSignature: preparation.planSignature,
      selectionTrace: preparation.selectorTrace,
      disclosedDeckTargetPreparation: preparation,
      offeredCardIds: [],
      offeredDeckEntryIds: [entry.entryId],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
    };
    const build = (
      state: JourneyState,
      resolution: ExplorationResolution | null,
    ) =>
      buildExplorationSiteView({
        sceneNode: null,
        site: explorationSite,
        guide,
        guideLine: assertLocalized("Fixture line."),
        state,
        content,
        runtime: {
          kind: "exploration",
          encounterCardId: encounter.id,
          actionOffers: [offer],
          resolution,
        },
      });
    const beforeState = { ...createDefaultState(), deck: [entry] };
    const preparedAction = build(beforeState, null)?.actions[0];
    expect(preparedAction).toMatchObject({
      available: true,
      followup: { kind: "none" },
      automaticSelection: { entryIds: [entry.entryId] },
    });
    expect(preparedAction?.effectText.annotations).toMatchObject({
      deck_card: {
        kind: "card",
        entryId: entry.entryId,
        card: { id: event.id },
      },
    });
    expect(
      resolveSource(preparedAction!.effectText.localized),
    ).not.toContain("{card_type}");
    expect(Object.keys(preparedAction!.effectText.annotations)).toEqual([
      "deck_card",
    ]);
    const afterTypeChange: CardTypeChange = {
      predicateId: parseCardTypeChangePredicateId(
        "exploration:card-type:character",
      ),
      cardType: "Character" as const,
      subtype: "",
      label: "Character",
    };
    const finalEntry = { ...entry, typeChange: afterTypeChange };
    const resolution: ExplorationResolution = {
      actionId: action.id,
      selection: { entryIds: [entry.entryId] },
      gainedCardIds: [],
      gainedEntryIds: [],
      gainedDreamsignIds: [],
      purgedCardIds: [],
      affectedEntryIds: [entry.entryId],
      resolvedCardType: "Character",
      cardTypeChanges: [
        {
          entryId: entry.entryId,
          cardId: event.id,
          beforeCardType: "Event",
          afterCardType: "Character",
          beforeTypeChange: null,
          afterTypeChange,
        },
      ],
      essenceGained: 0,
    };
    expect(
      build({ ...beforeState, deck: [finalEntry] }, resolution),
    ).toMatchObject({
      outcomeKind: "card-type-changes",
      reward: {
        kind: "card-type-changes",
        sourceKind: "change-card-type-selected",
        changes: [
          {
            entryId: entry.entryId,
            beforeCardType: "Event",
            afterCardType: "Character",
          },
        ],
      },
    });
  });

  it("builds fixed-site actions automatically and reveals only the atlas-confirmed insertion", () => {
    const source = card(sourceId, 17);
    const action: ExplorationActionContent = {
      id: testExplorationActionId("41000000-0000-4000-8000-000000000041"),
      label: "Open the passage",
      effectText: "Add a duplication site to this dreamscape.",
      effectKind: "add-fixed-site",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "fixed",
      siteType: "Duplication",
    };
    const siblingSite: SiteState = {
      id: parseSiteId("site-draft-fixture"),
      type: "Draft",
      isEnhanced: false,
      isVisited: false,
    };
    const insertedSite = {
      id: parseSiteId(`site-exploration-${explorationSite.id}-${action.id}`),
      type: "Duplication" as const,
      isEnhanced: false,
      isVisited: false,
    };
    const nodeId = parseAtlasNodeId("fixture-node");
    const node = {
      id: nodeId,
      layer: LayerName.One,
      indexInLayer: 0,
      dreamscapeId: testDreamscapeId("fixture-dreamscape"),
      sites: [explorationSite, siblingSite],
      position: { x: 0, y: 0 },
      state: "available",
      enhancedSiteType: null,
      forwardIds: [],
      backwardIds: [],
      knownDreamsignId: null,
    } as DreamscapeNode;
    const preparation = {
      sourceSiteId: explorationSite.id,
      sourceActionId: action.id,
      targetNodeId: nodeId,
      insertionIndex: node.sites.length,
      siblingSiteIdsBefore: node.sites.map((site) => site.id),
      insertedSite,
      planSignature: stableDigest("fixed-site-plan-signature"),
    };
    const offer = {
      actionId: action.id,
      canonicalMechanicId: "add-site" as const,
      selectionPolicyId: "fixed" as const,
      selectionRulesVersion: parseSelectionRulesVersion("selection-rules-v1"),
      selectionContentRevision: parseSelectionContentRevision("selection-content-v1"),
      selectionKey: parseSelectionKey(action.id),
      selectionSignature: preparation.planSignature,
      siteInsertionPreparation: preparation,
      offeredCardIds: [],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
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
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "A passage unfolds.",
            actions: [action],
          },
        ],
      },
    } as unknown as JourneyContent;
    const defaultState = createDefaultState();
    const beforeState = {
      ...defaultState,
      activeSiteId: explorationSite.id,
      currentDreamscape: nodeId,
      atlas: {
        ...defaultState.atlas,
        currentNodeId: nodeId,
        nodes: { [nodeId]: node },
      },
    };
    const before = buildExplorationSiteView({
      sceneNode: node,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      state: beforeState,
      content,
      runtime: {
        kind: "exploration",
        encounterCardId: source.id,
        actionOffers: [offer],
        resolution: null,
      },
    });

    expect(before?.actions[0]).toMatchObject({
      effectKind: "add-fixed-site",
      mechanics: { siteType: "Duplication" },
      followup: { kind: "none" },
      automaticSelection: {},
      available: true,
    });
    expect(before?.actions[0]?.effectDisclosure).toBeUndefined();

    const resolvedNode: DreamscapeNode = {
      ...node,
      sites: [...node.sites, insertedSite],
    };
    const resolution: ExplorationResolution = {
      actionId: action.id,
      selection: {},
      selectionSignature: preparation.planSignature,
      gainedCardIds: [],
      gainedDreamsignIds: [],
      purgedCardIds: [],
      affectedEntryIds: [],
      essenceGained: 0,
      siteInsertion: {
        targetNodeId: nodeId,
        insertionIndex: preparation.insertionIndex,
        siblingSiteIdsBefore: preparation.siblingSiteIdsBefore,
        insertedSite: insertedSite,
      },
    };
    const resolvedState = {
      ...beforeState,
      atlas: {
        ...beforeState.atlas,
        nodes: { [nodeId]: resolvedNode },
      },
    };
    const resolved = buildExplorationSiteView({
      sceneNode: resolvedNode,
      site: explorationSite,
      guide,
      guideLine: assertLocalized("Fixture line."),
      state: resolvedState,
      content,
      runtime: {
        kind: "exploration",
        encounterCardId: source.id,
        actionOffers: [offer],
        resolution,
      },
    });

    expect(resolved).toMatchObject({
      outcomeKind: "site-insertion",
      reward: {
        kind: "site-insertion",
        targetNodeId: nodeId,
        insertionIndex: 2,
        siblingSiteIdsBefore: [explorationSite.id, siblingSite.id],
        model: {
          id: insertedSite.id,
          type: insertedSite.type,
          isVisited: insertedSite.isVisited,
          index: 2,
          isInteractive: false,
          icon: MINIMAL_SITES_DATA.siteTypes.Duplication.icon,
        },
      },
    });
    expect(
      buildExplorationSiteView({
        sceneNode: resolvedNode,
        site: explorationSite,
        guide,
        guideLine: assertLocalized("Fixture line."),
        state: resolvedState,
        content,
        runtime: {
          kind: "exploration",
          encounterCardId: source.id,
          actionOffers: [offer],
          resolution: {
            ...resolution,
            siteInsertion: {
              ...resolution.siteInsertion!,
              insertionIndex: 1,
            },
          },
        },
      })?.reward,
    ).toBeNull();
  });

  it("builds a signed site-type chooser and reconstructs the selected insertion", () => {
    const source = card(sourceId, 18);
    const action: ExplorationActionContent = {
      id: testExplorationActionId("46000000-0000-4000-8000-000000000046"),
      label: "Shape three futures",
      effectText: "Choose a site to add to this dreamscape.",
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
      followupTitle: "Choose a future",
      followupSubtitle: "Choose one prepared site.",
    };
    const siblingSite: SiteState = {
      id: parseSiteId("site-draft-choice-fixture"),
      type: "Draft",
      isEnhanced: false,
      isVisited: false,
    };
    const nodeId = parseAtlasNodeId("fixture-choice-node");
    const node = {
      id: nodeId,
      layer: LayerName.One,
      indexInLayer: 0,
      dreamscapeId: testDreamscapeId("fixture-choice-dreamscape"),
      sites: [explorationSite, siblingSite],
      position: { x: 0, y: 0 },
      state: "available",
      enhancedSiteType: null,
      forwardIds: [],
      backwardIds: [],
      knownDreamsignId: null,
    } as DreamscapeNode;
    const preparedSiteId = `site-exploration-${explorationSite.id}-${action.id}`;
    const siteTypes = ["Shop", "Purge", "Transfiguration"] as const;
    const choices = siteTypes.map((siteType) => ({
      siteType,
      insertedSite: {
        id: parseSiteId(preparedSiteId),
        type: siteType,
        isEnhanced: false,
        isVisited: false,
      },
    }));
    const preparation = {
      sourceSiteId: explorationSite.id,
      sourceActionId: action.id,
      targetNodeId: nodeId,
      insertionIndex: node.sites.length,
      siblingSiteIdsBefore: node.sites.map((site) => site.id),
      choices,
      selectorSignature: stableDigest("site-selector-signature"),
      planSignature: stableDigest("site-choice-plan-signature"),
    };
    const selectionTrace = {
      selectionRulesVersion: parseSelectionRulesVersion("2"),
      selectionContentRevision: parseSelectionContentRevision("selection-content-v1"),
      mechanicId: "add-site" as const,
      policyId: "site-uniform" as const,
      selectionKey: parseSelectionKey(action.id),
      keyKind: "siteType" as const,
      saltParts: ["exploration", explorationSite.id, action.id],
      purpose: "site-type-choice",
      drawsConsumed: 3,
      streams: [],
      constraints: {},
      candidateCount: 4,
      candidateDigest: stableDigest("candidate-digest"),
      band: {
        fraction: 1,
        minimum: 3,
        size: 4,
        cutoffScore: null,
        candidates: [],
      },
      selectedKeys: siteTypes.map(parseRewardCandidateKey),
      fallback: [],
      tuning: {},
      effectiveDeck: [],
      effectiveDeckDigest: stableDigest("effective-deck-digest"),
    };
    const offer = {
      actionId: action.id,
      canonicalMechanicId: "add-site" as const,
      selectionPolicyId: "site-uniform" as const,
      selectionRulesVersion: parseSelectionRulesVersion("selection-rules-v1"),
      selectionContentRevision: parseSelectionContentRevision("selection-content-v1"),
      selectionKey: parseSelectionKey(action.id),
      selectionSignature: preparation.planSignature,
      selectionTrace,
      siteTypeChoicePreparation: preparation,
      offeredCardIds: [],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
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
      economyData: economyFixture(),
      exploration: {
        customCards: [],
        customDreamsigns: [],
        encounters: [
          {
            cardId: source.id,
            prose: "Three passages unfold.",
            actions: [action],
          },
        ],
      },
    } as unknown as JourneyContent;
    const defaultState = createDefaultState();
    const beforeState = {
      ...defaultState,
      activeSiteId: explorationSite.id,
      currentDreamscape: nodeId,
      atlas: {
        ...defaultState.atlas,
        currentNodeId: nodeId,
        nodes: { [nodeId]: node },
      },
    };
    const build = (
      state: JourneyState,
      runtimeOffer = offer,
      resolution: ExplorationResolution | null = null,
    ) =>
      buildExplorationSiteView({
        sceneNode: state.atlas.nodes[nodeId] ?? null,
        site: explorationSite,
        guide,
        guideLine: assertLocalized("Fixture line."),
        state,
        content,
        runtime: {
          kind: "exploration",
          encounterCardId: source.id,
          actionOffers: [runtimeOffer],
          resolution,
        },
      });

    const before = build(beforeState);
    expect(before?.actions[0]).toMatchObject({
      effectKind: "choose-site-type",
      mechanics: { offerCount: 3 },
      followup: {
        kind: "site-types",
        choices: [
          {
            siteType: "Shop",
            model: {
              id: choices[0].insertedSite.id,
              type: choices[0].insertedSite.type,
              isVisited: choices[0].insertedSite.isVisited,
            },
          },
          {
            siteType: "Purge",
            model: {
              id: choices[1].insertedSite.id,
              type: choices[1].insertedSite.type,
              isVisited: choices[1].insertedSite.isVisited,
            },
          },
          {
            siteType: "Transfiguration",
            model: {
              id: choices[2].insertedSite.id,
              type: choices[2].insertedSite.type,
              isVisited: choices[2].insertedSite.isVisited,
            },
          },
        ],
      },
      available: true,
    });
    expect(before?.actions[0]?.automaticSelection).toBeUndefined();
    const malformed = build(beforeState, {
      ...offer,
      siteTypeChoicePreparation: {
        ...preparation,
        choices: [choices[0], choices[0], choices[2]],
      },
    });
    expect(malformed?.actions[0]?.available).toBe(false);

    const chosen = choices[1];
    const resolvedNode: DreamscapeNode = {
      ...node,
      sites: [...node.sites, chosen.insertedSite],
    };
    const resolvedState: JourneyState = {
      ...beforeState,
      atlas: {
        ...beforeState.atlas,
        nodes: { [nodeId]: resolvedNode },
      },
    };
    const resolution: ExplorationResolution = {
      actionId: action.id,
      selection: { siteType: chosen.siteType },
      selectionSignature: preparation.planSignature,
      gainedCardIds: [],
      gainedDreamsignIds: [],
      purgedCardIds: [],
      affectedEntryIds: [],
      essenceGained: 0,
      siteInsertion: {
        targetNodeId: nodeId,
        insertionIndex: preparation.insertionIndex,
        siblingSiteIdsBefore: preparation.siblingSiteIdsBefore,
        insertedSite: chosen.insertedSite,
      },
    };
    expect(build(resolvedState, offer, resolution)).toMatchObject({
      outcomeKind: "site-insertion",
      reward: {
        kind: "site-insertion",
        sourceKind: "choose-site-type",
        targetNodeId: nodeId,
        insertionIndex: 2,
        model: {
          id: chosen.insertedSite.id,
          type: chosen.insertedSite.type,
          isVisited: chosen.insertedSite.isVisited,
          isInteractive: false,
          icon: MINIMAL_SITES_DATA.siteTypes.Purge.icon,
        },
      },
    });
    expect(
      build(resolvedState, offer, {
        ...resolution,
        selection: { siteType: "Shop" },
      })?.reward,
    ).toBeNull();
  });

  it.each([
    {
      effectKind: "free-next-shop" as const,
      count: undefined,
      shopModifier: {
        kind: "free-next-shop" as const,
        sourceSiteId: explorationSite.id,
        sourceActionId: testExplorationActionId("shop-modifier-action"),
      },
      essenceBefore: undefined,
      essenceSpent: undefined,
      essenceAfter: undefined,
      expected: {
        modifier: "free-next-shop",
        sourceSiteId: explorationSite.id,
        sourceActionId: testExplorationActionId("shop-modifier-action"),
      },
    },
    {
      effectKind: "lose-half-essence-and-free-purchases" as const,
      count: 3,
      shopModifier: {
        kind: "free-purchases" as const,
        sourceSiteId: explorationSite.id,
        sourceActionId: testExplorationActionId("shop-modifier-action"),
        initialCount: 3,
        remainingCount: 3,
      },
      essenceBefore: 255,
      essenceSpent: 127,
      essenceAfter: 128,
      expected: {
        modifier: "free-purchases",
        sourceSiteId: explorationSite.id,
        sourceActionId: testExplorationActionId("shop-modifier-action"),
        freePurchaseCount: 3,
        essenceBefore: 255,
        essenceSpent: 127,
        essenceAfter: 128,
      },
    },
  ])(
    "projects the persisted $effectKind outcome without recomputing it",
    ({
      effectKind,
      count,
      shopModifier,
      essenceBefore,
      essenceSpent,
      essenceAfter,
      expected,
    }) => {
      const source = card(sourceId, 18);
      const action: ExplorationActionContent = {
        id: testExplorationActionId("shop-modifier-action"),
        label: "Fixture choice",
        effectText: "Fixture effect.",
        effectKind,
        canonicalMechanicId: "shop-purchase-modifier",
        ...(count === undefined ? {} : { count }),
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
        exploration: {
          customCards: [],
          customDreamsigns: [],
          encounters: [
            {
              cardId: source.id,
              prose: "A passage unfolds.",
              actions: [action],
            },
          ],
        },
      } as unknown as JourneyContent;
      const runtime: ExplorationSiteRuntime = {
        kind: "exploration",
        encounterCardId: source.id,
        actionOffers: [
          {
            actionId: action.id,
            canonicalMechanicId: "shop-purchase-modifier",
            offeredCardIds: [],
            packCardIds: [],
            replacementCardIdByEntryId: {},
            transfigurationByEntryId: {},
          },
        ],
        resolution: {
          actionId: action.id,
          gainedCardIds: [],
          gainedDreamsignIds: [],
          purgedCardIds: [],
          affectedEntryIds: [],
          essenceGained: 0,
          shopModifier,
          ...(essenceBefore === undefined ? {} : { essenceBefore }),
          ...(essenceSpent === undefined ? {} : { essenceSpent }),
          ...(essenceAfter === undefined ? {} : { essenceAfter }),
        },
      };

      const result = buildExplorationSiteView({
        sceneNode: null,
        site: explorationSite,
        guide,
        guideLine: assertLocalized("Fixture line."),
        state: createDefaultState(),
        content,
        runtime,
      });

      expect(result?.actions[0]?.followup).toEqual({ kind: "none" });
      expect(result).toMatchObject({
        outcomeKind: "shop-modifier",
        reward: { kind: "shop-modifier", ...expected },
      });
    },
  );
});
