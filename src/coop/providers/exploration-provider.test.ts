import { testJourneySeed } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import { stableDigest } from "../../reward-selection/stable";
import { describe, expect, it } from "vitest";
import { parseCardTypeChangePredicateId } from "../../types/identifiers";
import { economyFixture } from "../../testing/economy-fixture";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { draftDataFixture } from "../../testing/draft-data-fixture";
import { CONFIG_DATA_FIXTURE } from "../../testing/config-data-fixture";
import {
  MINIMAL_ATLAS_DATA,
  MINIMAL_SITES_DATA,
} from "../../__test-helpers__/atlas-fixtures";
import { resolveDeckEntryCard } from "../../card-type-change";
import type {
  ExplorationActionContent,
  ExplorationContent,
} from "../../data/exploration";
import type { JourneyContent } from "../../data/journey-content";
import { NIGHTMARE_CARD_ID } from "../../data/nightmare";
import { assertJsonSafe } from "../../eventlog/hash";
import type { EventDraft } from "../../eventlog/client";
import { foldEvents } from "../../eventlog/fold";
import type { GameEvent, Genesis } from "../../eventlog/types";
import { GAME_ENGINE_CONFIG } from "../../rules/replay/replay";
import { registerSiteContentProvider } from "../../rules/journey/sites";
import { createDefaultState } from "../../state/journey-context";
import { LayerName } from "../../types/layer-name";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type { CardId } from "../../types/card-identity";
import type {
  CardTypeChange,
  ExplorationResolution,
  JourneyState,
  SiteState,
} from "../../types/journey";
import {
  parseSelectionRulesVersion,
  SELECTION_RULES_VERSION,
} from "../../reward-selection";
import { makeActions } from "../actions";
import {
  buildExplorationRuntime,
  buildLegacyExplorationRuntime,
  mapDeterministicDrawToInclusiveInteger,
  resolveExplorationChoice,
} from "./exploration-provider";
import { createSiteContentProvider } from "./site-provider";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import type { DreamsignId, ExplorationActionId } from "../../types/identifiers";
import {
  testCardId,
  testCardSubtype,
  testDreamAvatarId,
  testDreamscapeId,
  testDreamsignId,
  testExplorationActionId,
  testFoldHash,
} from "../../types/test-identities";

const SOURCE_CARD_ID = testCardId("161482b6-af07-4d9e-822d-8c738672beb9");
const CHARM_POUCH_ID = "2d4eb3ee-0931-45ed-8365-69f18096ead5";
const NIGHTMARE_ID = NIGHTMARE_CARD_ID;

function card(
  idSeed: string,
  cardNumber: number,
  cardType: CardData["cardType"],
  subtype: string,
  energyCost = 2,
): CardData {
  return {
    id: testCardId(idSeed),
    name: parseCardName(`Exploration fixture ${String(cardNumber)}`),
    cardNumber,
    cardType,
    subtype: testCardSubtype(subtype),
    isStarter: false,
    energyCost,
    spark: cardType === "Character" ? 2 : null,
    isFast: false,
    renderedText: "Synthetic rules text.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

function catalogCards(): CardData[] {
  return [
    card(SOURCE_CARD_ID, 1, "Character", "Warrior", 1),
    card(NIGHTMARE_ID, 2, "Event", "", 0),
    card("f0000000-0000-4000-8000-000000000001", 101, "Event", "", 1),
    ...Array.from({ length: 4 }, (_, index) =>
      card(
        `f0000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`,
        110 + index,
        "Character",
        "Survivor",
      ),
    ),
    ...Array.from({ length: 6 }, (_, index) =>
      card(
        `f0000000-0000-4000-8000-${String(index + 20).padStart(12, "0")}`,
        120 + index,
        "Character",
        "Warrior",
      ),
    ),
    ...Array.from({ length: 8 }, (_, index) =>
      card(
        `f0000000-0000-4000-8000-${String(index + 30).padStart(12, "0")}`,
        130 + index,
        "Character",
        "Spirit Animal",
      ),
    ),
  ];
}

function contentFixture(
  actions: readonly [ExplorationActionContent, ExplorationActionContent],
): JourneyContent {
  const cards = catalogCards();
  const exploration: ExplorationContent = {
    customCards: [],
    customDreamsigns: [],
    encounters: [
      {
        cardId: SOURCE_CARD_ID,
        prose: "A synthetic scene.",
        actions,
      },
    ],
  };
  return {
    ...CONFIG_DATA_FIXTURE,
    draftData: draftDataFixture(),
    cardDatabase: new Map(cards.map((entry) => [entry.cardNumber, entry])),
    exploration,
    dreamAvatars: Array.from({ length: 4 }, (_, index) => ({
      id: testDreamAvatarId(`dream-avatar-${String(index)}`),
      name: `Dream Avatar ${String(index)}`,
      title: "Synthetic",
      renderedText: "A synthetic Dream Avatar ability.",
      imageNumber: String(index),
      startingEssence: 250,
      signatureCards: [],
    })),
    dreamwellCards: [],
    dreamsignTemplates: [
      {
        id: testDreamsignId(CHARM_POUCH_ID),
        name: "Charm Pouch",
        effectDescription: "A fixture effect.",
      },
    ],
    dreamscapes: [],
    affiliations: [],
    guides: [],
    atlasData: MINIMAL_ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    economyData: economyFixture(),
    opponentsData: opponentsFixture(),
  };
}

function journeyFixture(content: JourneyContent): JourneyState {
  const event = content.cardDatabase.get(101);
  const spiritAnimal = content.cardDatabase.get(130);
  if (event === undefined || spiritAnimal === undefined) {
    throw new Error("Expected synthetic deck fixture cards");
  }
  return {
    ...createDefaultState(),
    seed: testJourneySeed("exploration-provider-test"),
    screen: { type: "site", siteId: site.id },
    activeSiteId: site.id,
    essence: 100,
    maxDreamsigns: 12,
    deck: Array.from({ length: 8 }, (_, index) =>
      index % 2 === 0 ? event : spiritAnimal,
    ).map((entry, index) => ({
      entryId: parseDeckEntryId(`entry-${String(index)}`),
      cardNumber: entry.cardNumber,
      transfiguration: null,
      isBane: false,
    })),
  };
}

const site: SiteState = {
  id: parseSiteId("exploration-site"),
  type: "Exploration",
  isEnhanced: false,
  isVisited: false,
};

function explorationFoldJourney(journey: JourneyState): JourneyState {
  return {
    ...journey,
    currentDreamscape: parseAtlasNodeId("exploration-node"),
    atlas: {
      ...journey.atlas,
      nodes: {
        [parseAtlasNodeId("exploration-node")]: {
          id: parseAtlasNodeId("exploration-node"),
          layer: LayerName.Two,
          indexInLayer: 0,
          dreamscapeId: testDreamscapeId("fixture-dreamscape"),
          sites: [site],
          position: { x: 0, y: 0 },
          state: "available",
          enhancedSiteType: null,
          forwardIds: [],
          backwardIds: [],
          knownDreamsignId: null,
        },
      },
      startingNodeId: parseAtlasNodeId("exploration-node"),
      currentNodeId: parseAtlasNodeId("exploration-node"),
    },
  };
}

function buildState(
  content: JourneyContent,
  journey = journeyFixture(content),
): {
  journey: JourneyState;
  runtime: NonNullable<ReturnType<typeof buildExplorationRuntime>>;
} {
  const runtime = buildExplorationRuntime(journey, site, content, () => 0.37);
  if (runtime === null) throw new Error("Expected Exploration runtime");
  return {
    runtime,
    journey: {
      ...journey,
      siteRuntime: { ...journey.siteRuntime, [site.id]: runtime },
    },
  };
}

function resolve(
  content: JourneyContent,
  journey: JourneyState,
  actionId: ExplorationActionId,
  selection: Record<string, unknown> = {},
): JourneyState {
  const runtime = journey.siteRuntime[site.id];
  const result = resolveExplorationChoice({
    journey,
    site,
    payload: {
      actionId,
      selection,
      ...(runtime?.kind === "exploration" &&
      runtime.selectionRulesVersion !== undefined
        ? { selectionRulesVersion: runtime.selectionRulesVersion }
        : {}),
    },
    seq: 91,
    content,
  });
  if (result === null) throw new Error(`Expected ${actionId} to resolve`);
  return result;
}

function explorationResolutionFor(
  journey: JourneyState,
): ExplorationResolution {
  const runtime = journey.siteRuntime[site.id];
  if (runtime?.kind !== "exploration" || runtime.resolution === null) {
    throw new Error("Expected a resolved Exploration runtime");
  }
  return runtime.resolution;
}

function dreamsignId(index: number): DreamsignId {
  return testDreamsignId(
    `d0000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
}

function dreamsignContent(
  action: ExplorationActionContent,
  dreamsignCount = 10,
): JourneyContent {
  const fallback: ExplorationActionContent = {
    id: testExplorationActionId(`${action.id}-fallback`),
    label: "Gain the source card",
    effectText: "Gain a card",
    effectKind: "gain-card",
    cardId: SOURCE_CARD_ID,
  };
  const base = contentFixture([action, fallback]);
  return {
    ...base,
    dreamsignTemplates: Array.from({ length: dreamsignCount }, (_, index) => ({
      id: dreamsignId(index + 1),
      name: `Dreamsign ${String(index + 1)}`,
      effectDescription: `Synthetic Dreamsign ${String(index + 1)}.`,
    })),
  };
}

function withDreamsignPool(
  content: JourneyContent,
  options: {
    heldCount?: number;
    maxDreamsigns?: number;
    remainingIds?: readonly DreamsignId[];
    packageIds?: readonly DreamsignId[];
  } = {},
): JourneyState {
  const heldCount = options.heldCount ?? 0;
  const heldTemplates = content.dreamsignTemplates.slice(0, heldCount);
  const allIds = content.dreamsignTemplates.map(({ id }) => id);
  const remainingIds = options.remainingIds ?? allIds.slice(heldCount);
  const packageIds = options.packageIds ?? allIds;
  const dreamAvatar = content.dreamAvatars[0];
  if (dreamAvatar === undefined)
    throw new Error("Expected a Dream Avatar fixture");
  return {
    ...journeyFixture(content),
    maxDreamsigns: options.maxDreamsigns ?? 12,
    dreamsigns: heldTemplates.map((template) => ({ ...template })),
    remainingDreamsignPool: [...remainingIds],
    resolvedPackage: {
      dreamAvatar,
      draftPoolCopiesByCard: {},
      dreamsignPoolIds: [...packageIds],
      mandatoryOnlyPoolSize: 0,
      draftPoolSize: 0,
      doubledCardCount: 0,
      legalSubsetCount: 1,
      preferredSubsetCount: 1,
    },
  };
}

function starterContent(
  actions: readonly [ExplorationActionContent, ExplorationActionContent],
): JourneyContent {
  const base = contentFixture(actions);
  return {
    ...base,
    cardDatabase: new Map(
      [...base.cardDatabase].map(([cardNumber, value]) => [
        cardNumber,
        cardNumber === 101 || cardNumber === 130
          ? {
              ...value,
              isStarter: true,
              roles: ["starter-deck" as const],
              rarity: "Starter" as const,
            }
          : value,
      ]),
    ),
  };
}

function starterJourney(
  content: JourneyContent,
  starterCount: number,
): JourneyState {
  const starterNumbers = [...content.cardDatabase.values()]
    .filter((value) => value.isStarter)
    .map((value) => value.cardNumber);
  if (starterNumbers.length === 0) {
    throw new Error("Expected starter cards in synthetic content");
  }
  return {
    ...journeyFixture(content),
    deck: Array.from({ length: starterCount }, (_, index) => ({
      entryId: parseDeckEntryId(`starter-entry-${String(index + 1)}`),
      cardNumber: starterNumbers[index % starterNumbers.length],
      transfiguration: null,
      isBane: false,
    })),
  };
}

describe("Exploration provider", () => {
  it("keeps the frozen unversioned offer algorithm available for legacy room replay", () => {
    const offeredAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-offered"),
      label: "Invite someone through",
      effectText: "Gain $OFFERED_CARD",
      effectKind: "gain-offered-card",
      predicate: "cheap-character",
    };
    const fallbackAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-card"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([offeredAction, fallbackAction]);
    const journey = journeyFixture(content);
    const legacy = buildLegacyExplorationRuntime(
      journey,
      site,
      content,
      () => 0.37,
    );
    const current = buildExplorationRuntime(journey, site, content, () => 0.37);

    expect(legacy).toMatchObject({
      kind: "exploration",
      encounterCardId: SOURCE_CARD_ID,
    });
    expect(legacy?.actionOffers[0]).toMatchObject({
      actionId: offeredAction.id,
      offeredCardIds: ["f0000000-0000-4000-8000-000000000033"],
    });
    expect(legacy).not.toHaveProperty("selectionRulesVersion");
    expect(legacy?.actionOffers[0]).not.toHaveProperty("canonicalMechanicId");
    expect(current?.selectionRulesVersion).toBe(SELECTION_RULES_VERSION);
  });

  it("routes unversioned opens to legacy replay and current opens to shared selection", () => {
    const offeredAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-offered"),
      label: "Invite someone through",
      effectText: "Gain $OFFERED_CARD",
      effectKind: "gain-offered-card",
      predicate: "cheap-character",
    };
    const fallbackAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-card"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([offeredAction, fallbackAction]);
    const provider = createSiteContentProvider(content);
    const input = {
      journey: journeyFixture(content),
      site,
      rng: () => 0.37,
    };
    const legacy = provider.openSite(input);
    const current = provider.openSite({
      ...input,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });

    expect(legacy?.runtime).not.toHaveProperty("selectionRulesVersion");
    expect(current?.runtime).toMatchObject({
      kind: "exploration",
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });
    expect(
      provider.openSite({
        ...input,
        selectionRulesVersion: parseSelectionRulesVersion("unsupported-selection-version"),
      }),
    ).toBeNull();
  });

  it("maps deterministic draws to both endpoints of an inclusive integer range", () => {
    expect(mapDeterministicDrawToInclusiveInteger(0, 50, 150)).toBe(50);
    expect(mapDeterministicDrawToInclusiveInteger(1, 50, 150)).toBe(150);
    expect(
      mapDeterministicDrawToInclusiveInteger(0.9999999999999999, 50, 150),
    ).toBe(150);
  });

  it("adds authored Essence once and persists the exact balance transition", () => {
    const gainEssence: ExplorationActionContent = {
      id: testExplorationActionId("fixed-essence"),
      label: "Gather light",
      effectText: "Gain 100 essence",
      effectKind: "gain-essence",
      essence: 100,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([gainEssence, fallback]);
    const state = buildState(content);
    expect(state.runtime.actionOffers[0]).toMatchObject({
      canonicalMechanicId: "essence-mutation",
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionKey: `${SOURCE_CARD_ID}:${gainEssence.id}`,
    });

    const result = resolve(content, state.journey, gainEssence.id);
    expect(result.essence).toBe(200);
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: {},
        essenceBefore: 100,
        essenceGained: 100,
        essenceAfter: 200,
        selectionSignature: state.runtime.actionOffers[0]?.selectionSignature,
      },
    });
    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: gainEssence.id,
          selection: { cardIds: [] },
          selectionRulesVersion: state.runtime.selectionRulesVersion,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("prepares random Essence once, replays it stably, and rejects tampering", () => {
    const gainRandomEssence: ExplorationActionContent = {
      id: testExplorationActionId("random-essence"),
      label: "Gather sparks",
      effectText: "Gain a random amount of essence between 50 and 150",
      effectKind: "gain-random-essence",
      minimumEssence: 50,
      maximumEssence: 150,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([gainRandomEssence, fallback]);
    const first = buildState(content);
    const replay = buildState(content);
    const offer = first.runtime.actionOffers[0];
    expect(replay.runtime.actionOffers[0]).toEqual(offer);
    expect(offer).toMatchObject({
      canonicalMechanicId: "essence-mutation",
      selectionPolicyId: "uniform",
      selectionKey: `${SOURCE_CARD_ID}:${gainRandomEssence.id}`,
      selectionRulesVersion: SELECTION_RULES_VERSION,
      essencePreparation: {
        minimumEssence: 50,
        maximumEssence: 150,
        purpose: "essence-amount",
        drawsConsumed: 1,
      },
    });
    expect(offer?.essencePreparation?.saltParts).toEqual([
      SELECTION_RULES_VERSION,
      first.journey.seed,
      site.id,
      `${SOURCE_CARD_ID}:${gainRandomEssence.id}`,
      "uniform",
      "essence-amount",
    ]);
    expect(offer?.preparedEssenceAmount).toBeGreaterThanOrEqual(50);
    expect(offer?.preparedEssenceAmount).toBeLessThanOrEqual(150);

    const result = resolve(content, first.journey, gainRandomEssence.id);
    const replayed = resolve(content, first.journey, gainRandomEssence.id);
    expect(replayed).toEqual(result);
    expect(result.essence).toBe(
      first.journey.essence + (offer?.preparedEssenceAmount ?? 0),
    );
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: {},
        essenceBefore: 100,
        essenceGained: offer?.preparedEssenceAmount,
        essenceAfter: result.essence,
        essencePreparation: offer?.essencePreparation,
        selectionContentRevision: offer?.selectionContentRevision,
        selectionSignature: offer?.selectionSignature,
      },
    });

    const originalAmount = offer?.preparedEssenceAmount;
    if (originalAmount === undefined) {
      throw new Error("Expected a prepared Essence amount");
    }
    const tamperedAmount = originalAmount === 50 ? 51 : originalAmount - 1;
    const tamperedRuntime = {
      ...first.runtime,
      actionOffers: [
        { ...offer, preparedEssenceAmount: tamperedAmount },
        ...first.runtime.actionOffers.slice(1),
      ],
    };
    expect(
      resolveExplorationChoice({
        journey: {
          ...first.journey,
          siteRuntime: {
            ...first.journey.siteRuntime,
            [site.id]: tamperedRuntime,
          },
        },
        site,
        payload: {
          actionId: gainRandomEssence.id,
          selection: {},
          selectionRulesVersion: first.runtime.selectionRulesVersion,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("doubles positive and zero Essence as persisted successful resolutions", () => {
    const doubleEssence: ExplorationActionContent = {
      id: testExplorationActionId("double-essence"),
      label: "Mirror the light",
      effectText: "Double your current essence",
      effectKind: "double-essence",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([doubleEssence, fallback]);
    for (const [before, after] of [
      [125, 250],
      [0, 0],
    ] as const) {
      const state = buildState(content, {
        ...journeyFixture(content),
        essence: before,
      });
      const result = resolve(content, state.journey, doubleEssence.id);
      expect(result.essence).toBe(after);
      expect(result.siteRuntime[site.id]).toMatchObject({
        kind: "exploration",
        resolution: {
          selection: {},
          essenceBefore: before,
          essenceGained: before,
          essenceAfter: after,
        },
      });
    }
  });

  it("queues T56 modifiers in FIFO order and rejects a tampered persisted offer", () => {
    const freeNextShop: ExplorationActionContent = {
      id: testExplorationActionId("free-next-shop-action"),
      label: "Carry the market's favor",
      effectText: "All items in the next shop you visit are free",
      effectKind: "free-next-shop",
      canonicalMechanicId: "shop-purchase-modifier",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("free-next-shop-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([freeNextShop, fallback]);
    const earlier = {
      kind: "free-next-shop" as const,
      sourceSiteId: parseSiteId("earlier-site"),
      sourceActionId: testExplorationActionId("earlier-action"),
    };
    const state = buildState(content, {
      ...journeyFixture(content),
      shopModifiers: {
        ...journeyFixture(content).shopModifiers,
        freeNextShopModifiers: [earlier],
      },
    });
    expect(state.runtime.actionOffers[0]).toEqual({
      actionId: freeNextShop.id,
      canonicalMechanicId: "shop-purchase-modifier",
      offeredCardIds: [],
      offeredDreamsignIds: [],
      offeredDeckEntryIds: [],
      offeredDreamAvatarIds: [],
      packCardIds: [],
      replacementCardIdByEntryId: {},
      transfigurationByEntryId: {},
    });

    const result = resolve(content, state.journey, freeNextShop.id);
    const appended = {
      kind: "free-next-shop" as const,
      sourceSiteId: site.id,
      sourceActionId: freeNextShop.id,
    };
    expect(result.shopModifiers.freeNextShopModifiers).toEqual([
      earlier,
      appended,
    ]);
    expect(explorationResolutionFor(result)).toMatchObject({
      selection: {},
      shopModifier: appended,
    });

    const offer = state.runtime.actionOffers[0];
    const tamperedRuntime = {
      ...state.runtime,
      actionOffers: [
        { ...offer, preparedEssenceAmount: 1 },
        ...state.runtime.actionOffers.slice(1),
      ],
    };
    expect(
      resolveExplorationChoice({
        journey: {
          ...state.journey,
          siteRuntime: {
            ...state.journey.siteRuntime,
            [site.id]: tamperedRuntime,
          },
        },
        site,
        payload: {
          actionId: freeNextShop.id,
          selection: {},
          selectionRulesVersion: state.runtime.selectionRulesVersion,
        },
        seq: 92,
        content,
      }),
    ).toBeNull();
  });

  it("loses floor-half Essence, retains ceil-half, and appends T82 counters", () => {
    const freePurchases: ExplorationActionContent = {
      id: testExplorationActionId("half-essence-free-purchases"),
      label: "Offer half the light",
      effectText: "Lose half your current essence. The next 3 items are free",
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 3,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("half-essence-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([freePurchases, fallback]);
    const earlier = {
      kind: "free-purchases" as const,
      sourceSiteId: parseSiteId("earlier-site"),
      sourceActionId: testExplorationActionId("earlier-action"),
      initialCount: 1,
      remainingCount: 1,
    };

    for (const [before, spent, after] of [
      [0, 0, 0],
      [1, 0, 1],
      [2, 1, 1],
      [5, 2, 3],
    ] as const) {
      const baseJourney = journeyFixture(content);
      const state = buildState(content, {
        ...baseJourney,
        essence: before,
        shopModifiers: {
          ...baseJourney.shopModifiers,
          freePurchaseModifiers: [earlier],
        },
      });
      const result = resolve(content, state.journey, freePurchases.id);
      const appended = {
        kind: "free-purchases" as const,
        sourceSiteId: site.id,
        sourceActionId: freePurchases.id,
        initialCount: 3,
        remainingCount: 3,
      };
      expect(result.essence).toBe(after);
      expect(result.shopModifiers.freePurchaseModifiers).toEqual([
        earlier,
        appended,
      ]);
      expect(explorationResolutionFor(result)).toMatchObject({
        selection: {},
        essenceBefore: before,
        essenceSpent: spent,
        essenceAfter: after,
        shopModifier: appended,
      });
      expect(JSON.parse(JSON.stringify(result))).toEqual(result);
    }
  });

  it("folds one T82 resolution once and replays the persisted counter byte-for-byte", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("folded-free-purchases"),
      label: "Offer half the light",
      effectText: "Lose half your current essence. The next 2 items are free",
      effectKind: "lose-half-essence-and-free-purchases",
      canonicalMechanicId: "shop-purchase-modifier",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("folded-free-purchases-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const initialJourney = explorationFoldJourney(journeyFixture(content));
    const genesis: Genesis = {
      seed: testJourneySeed("free-purchases-fold"),
      reducerVersion: "test",
      createdAt: 0,
      contentConfig: { poolVariant: "tides4" },
    };
    const payload = {
      siteId: site.id,
      actionId: action.id,
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selection: {},
    };
    const events = [
      {
        seq: 1,
        event: {
          type: "OPEN_SITE",
          payload: {
            siteId: site.id,
            selectionRulesVersion: SELECTION_RULES_VERSION,
          },
          actor: testEventActor("client-a"),
          clientTimestamp: "1970-01-01T00:00:00.000Z",
          basedOnSeq: 0,
        },
      },
      {
        seq: 2,
        event: {
          type: "RESOLVE_EXPLORATION_CHOICE",
          payload,
          actor: testEventActor("client-a"),
          clientTimestamp: "1970-01-01T00:00:01.000Z",
          basedOnSeq: 1,
        },
      },
      {
        seq: 3,
        event: {
          type: "RESOLVE_EXPLORATION_CHOICE",
          payload,
          actor: testEventActor("client-b"),
          clientTimestamp: "1970-01-01T00:00:02.000Z",
          basedOnSeq: 2,
        },
      },
    ] satisfies Array<{ seq: number; event: GameEvent }>;

    registerSiteContentProvider(createSiteContentProvider(content));
    try {
      const fold = () =>
        foldEvents(
          GAME_ENGINE_CONFIG,
          genesis,
          {
            seq: 0,
            state: {
              ...GAME_ENGINE_CONFIG.genesisState(genesis),
              journey: initialJourney,
            },
          },
          events,
          { devMode: true },
        );
      const first = fold();
      const replay = fold();
      expect(first.outcomes.map(({ outcome }) => outcome)).toEqual([
        "applied",
        "applied",
        "bounced",
      ]);
      expect(replay.state).toEqual(first.state);
      expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state);
      expect(first.state.journey.essence).toBe(50);
      expect(first.state.journey.shopModifiers.freePurchaseModifiers).toEqual([
        {
          kind: "free-purchases",
          sourceSiteId: site.id,
          sourceActionId: action.id,
          initialCount: 2,
          remainingCount: 2,
        },
      ]);
    } finally {
      registerSiteContentProvider(null);
    }
  });

  it("applies an Essence mutation only once when duplicate intents are folded", () => {
    const gainEssence: ExplorationActionContent = {
      id: testExplorationActionId("folded-essence"),
      label: "Gather light",
      effectText: "Gain 75 essence",
      effectKind: "gain-essence",
      essence: 75,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([gainEssence, fallback]);
    const prepared = buildState(content);
    const foldJourney: JourneyState = {
      ...prepared.journey,
      currentDreamscape: parseAtlasNodeId("exploration-node"),
      atlas: {
        ...prepared.journey.atlas,
        nodes: {
          [parseAtlasNodeId("exploration-node")]: {
            id: parseAtlasNodeId("exploration-node"),
            layer: LayerName.Two,
            indexInLayer: 0,
            dreamscapeId: testDreamscapeId("fixture-dreamscape"),
            sites: [site],
            position: { x: 0, y: 0 },
            state: "available",
            enhancedSiteType: null,
            forwardIds: [],
            backwardIds: [],
            knownDreamsignId: null,
          },
        },
        startingNodeId: parseAtlasNodeId("exploration-node"),
        currentNodeId: parseAtlasNodeId("exploration-node"),
      },
    };
    const genesis: Genesis = {
      seed: testJourneySeed("essence-mutation-fold"),
      reducerVersion: "test",
      createdAt: 0,
      contentConfig: { poolVariant: "tides4" },
    };
    const payload = {
      siteId: site.id,
      actionId: gainEssence.id,
      selection: {},
      selectionRulesVersion: prepared.runtime.selectionRulesVersion,
    };
    const events = [
      {
        seq: 1,
        event: {
          type: "RESOLVE_EXPLORATION_CHOICE",
          payload,
          actor: testEventActor("client-a"),
          clientTimestamp: "1970-01-01T00:00:00.000Z",
          basedOnSeq: 0,
        },
      },
      {
        seq: 2,
        event: {
          type: "RESOLVE_EXPLORATION_CHOICE",
          payload,
          actor: testEventActor("client-a"),
          clientTimestamp: "1970-01-01T00:00:01.000Z",
          basedOnSeq: 1,
        },
      },
    ] satisfies Array<{ seq: number; event: GameEvent }>;

    registerSiteContentProvider(createSiteContentProvider(content));
    try {
      const folded = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        {
          seq: 0,
          state: {
            ...GAME_ENGINE_CONFIG.genesisState(genesis),
            journey: foldJourney,
          },
        },
        events,
        { devMode: true },
      );
      expect(folded.outcomes.map(({ outcome }) => outcome)).toEqual([
        "applied",
        "bounced",
      ]);
      expect(folded.state.journey.essence).toBe(175);
      expect(folded.state.journey.siteRuntime[site.id]).toMatchObject({
        kind: "exploration",
        resolution: {
          essenceBefore: 100,
          essenceGained: 75,
          essenceAfter: 175,
        },
      });
    } finally {
      registerSiteContentProvider(null);
    }
  });

  it("builds and resolves the offered-card and unrestricted transfiguration effects", () => {
    const offeredAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-offered"),
      label: "Invite someone through",
      effectText: "Gain $OFFERED_CARD",
      effectKind: "gain-offered-card",
      predicate: "cheap-character",
    };
    const transfigureAction: ExplorationActionContent = {
      id: testExplorationActionId("transfigure"),
      label: "Send a possession through",
      effectText: "Apply a transfiguration to a chosen card",
      effectKind: "transfigure-selected",
      count: 1,
    };
    const content = contentFixture([offeredAction, transfigureAction]);
    const offeredState = buildState(content);
    const offered = offeredState.runtime.actionOffers[0]?.offeredCardIds ?? [];

    expect(offered).toHaveLength(1);
    expect(offered).not.toContain(SOURCE_CARD_ID);
    const gained = resolve(content, offeredState.journey, offeredAction.id, {
      cardIds: offered,
    });
    expect(gained.deck).toHaveLength(offeredState.journey.deck.length + 1);
    expect(gained.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: { gainedCardIds: offered },
    });

    const transfigureState = buildState(content);
    const entryId = transfigureState.journey.deck[0]?.entryId;
    if (entryId === undefined) throw new Error("Expected a deck entry");
    expect(
      transfigureState.runtime.actionOffers[1]?.transfigurationByEntryId,
    ).toEqual({});
    const transfigured = resolve(
      content,
      transfigureState.journey,
      transfigureAction.id,
      { entryIds: [entryId], transfiguration: "Empowered" },
    );
    expect(
      transfigured.deck.find((entry) => entry.entryId === entryId)
        ?.transfiguration,
    ).toBe("Empowered");
    expect(transfigured.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        affectedEntryIds: [entryId],
        chosenTransfiguration: "Empowered",
      },
    });

    expect(
      resolveExplorationChoice({
        journey: transfigureState.journey,
        site,
        payload: {
          actionId: transfigureAction.id,
          selection: { entryIds: [entryId], transfiguration: "Perfected" },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("persists and replays every eligible bulk transfiguration target for one essence cost", async () => {
    const transfigureAllAction: ExplorationActionContent = {
      id: testExplorationActionId("transfigure-all-events"),
      label: "Enter Spiraling Light",
      effectText:
        "Lose 100 essence. Apply Inspired to every eligible Event card in your deck.",
      effectKind: "transfigure-all-for-essence",
      canonicalMechanicId: "transfigure-deck-for-essence",
      essence: 100,
      predicate: "event",
      transfiguration: "Inspired",
    };
    const fallbackAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-source"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const baseContent = contentFixture([transfigureAllAction, fallbackAction]);
    const source = baseContent.cardDatabase.get(1);
    if (source === undefined) throw new Error("Expected source card");
    const content: JourneyContent = {
      ...baseContent,
      cardDatabase: new Map(baseContent.cardDatabase).set(1, {
        ...source,
        cardType: "Event",
        subtype: "",
        spark: null,
      }),
    };
    const starting = journeyFixture(content);
    const alreadyTransfiguredId = "entry-2";
    const prepared = buildState(content, {
      ...starting,
      essence: 150,
      deck: [
        ...starting.deck.map((entry) =>
          entry.entryId === alreadyTransfiguredId
            ? { ...entry, transfiguration: "Inspired" as const }
            : entry,
        ),
        {
          entryId: parseDeckEntryId("entry-source"),
          cardNumber: 1,
          transfiguration: null,
          isBane: false,
        },
      ],
    });
    const offer = prepared.runtime.actionOffers[0];

    expect(offer).toMatchObject({
      canonicalMechanicId: "transfigure-deck-for-essence",
      eligibleDeckEntryIds: ["entry-0", "entry-4", "entry-6", "entry-source"],
      selectionKey: transfigureAllAction.id,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    });
    expect(typeof offer?.selectionSignature).toBe("string");
    expect(typeof offer?.selectionContentRevision).toBe("string");
    expect(offer?.selectionContentRevision).toBe(
      prepared.runtime.selectionContentRevision,
    );

    const reordered = buildState(content, {
      ...starting,
      essence: 150,
      deck: [...prepared.journey.deck].reverse(),
    });
    expect(reordered.runtime.actionOffers[0]).toMatchObject({
      eligibleDeckEntryIds: offer?.eligibleDeckEntryIds,
      selectionSignature: offer?.selectionSignature,
      selectionContentRevision: offer?.selectionContentRevision,
    });

    if (content.exploration === undefined) {
      throw new Error("Expected Exploration fixture");
    }
    const revisedContent: JourneyContent = {
      ...content,
      exploration: {
        ...content.exploration,
        foldHash: testFoldHash("e"),
      },
    };
    const revised = buildState(revisedContent, prepared.journey);
    expect(revised.runtime.actionOffers[0]?.selectionContentRevision).not.toBe(
      offer?.selectionContentRevision,
    );
    expect(revised.runtime.actionOffers[0]?.selectionSignature).not.toBe(
      offer?.selectionSignature,
    );

    const result = resolve(content, prepared.journey, transfigureAllAction.id);
    const replayed = resolve(
      content,
      prepared.journey,
      transfigureAllAction.id,
    );
    expect(replayed).toEqual(result);
    expect(result.essence).toBe(50);
    expect(
      result.deck
        .filter((entry) =>
          ["entry-0", "entry-4", "entry-6", "entry-source"].includes(
            entry.entryId,
          ),
        )
        .map((entry) => entry.transfiguration),
    ).toEqual(["Inspired", "Inspired", "Inspired", "Inspired"]);
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        affectedEntryIds: [
          parseDeckEntryId("entry-0"),
          parseDeckEntryId("entry-4"),
          parseDeckEntryId("entry-6"),
          parseDeckEntryId("entry-source"),
        ],
        chosenTransfiguration: "Inspired",
        resolvedPredicate: "event",
        essenceGained: 0,
        essenceSpent: 100,
        selectionContentRevision: offer?.selectionContentRevision,
        selectionSignature: offer?.selectionSignature,
      },
    });

    const drafts: EventDraft[] = [];
    const actions = makeActions((draft) => {
      drafts.push(draft);
      return Promise.resolve(drafts.length);
    });
    await actions.resolveExplorationChoice(site.id, transfigureAllAction.id);
    const draft = drafts[0];
    if (draft === undefined) throw new Error("Expected a coop intent");
    const genesis: Genesis = {
      seed: testJourneySeed("bulk-transfiguration-fold"),
      reducerVersion: "test",
      createdAt: 0,
      contentConfig: { poolVariant: "tides4" },
    };
    const event: GameEvent = {
      type: draft.type,
      payload: draft.payload,
      actor: testEventActor("client-a"),
      clientTimestamp: "1970-01-01T00:00:00.000Z",
      basedOnSeq: 0,
      ...(draft.intentKey === undefined ? {} : { intentKey: draft.intentKey }),
    };
    const foldJourney: JourneyState = {
      ...prepared.journey,
      currentDreamscape: parseAtlasNodeId("exploration-node"),
      atlas: {
        ...prepared.journey.atlas,
        nodes: {
          [parseAtlasNodeId("exploration-node")]: {
            id: parseAtlasNodeId("exploration-node"),
            layer: LayerName.Two,
            indexInLayer: 0,
            dreamscapeId: testDreamscapeId("fixture-dreamscape"),
            sites: [site],
            position: { x: 0, y: 0 },
            state: "available",
            enhancedSiteType: null,
            forwardIds: [],
            backwardIds: [],
            knownDreamsignId: null,
          },
        },
        startingNodeId: parseAtlasNodeId("exploration-node"),
        currentNodeId: parseAtlasNodeId("exploration-node"),
      },
    };
    const base = {
      seq: 0,
      state: {
        ...GAME_ENGINE_CONFIG.genesisState(genesis),
        journey: foldJourney,
      },
    };
    registerSiteContentProvider(createSiteContentProvider(content));
    try {
      const first = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [{ seq: 1, event }],
        { devMode: true },
      );
      const replay = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [{ seq: 1, event }],
        { devMode: true },
      );
      expect(first.outcomes[0]?.outcome).toBe("applied");
      expect(replay.state).toEqual(first.state);
      expect(first.state.journey.siteRuntime[site.id]).toMatchObject({
        kind: "exploration",
        resolution: {
          affectedEntryIds: offer?.eligibleDeckEntryIds,
          chosenTransfiguration: "Inspired",
          resolvedPredicate: "event",
          essenceSpent: 100,
        },
      });
    } finally {
      registerSiteContentProvider(null);
    }

    const unaffordable = buildState(content, {
      ...starting,
      essence: 99,
    });
    expect(unaffordable.runtime.actionOffers[0]?.eligibleDeckEntryIds).toEqual([
      "entry-0",
      "entry-2",
      "entry-4",
      "entry-6",
    ]);
    expect(
      resolveExplorationChoice({
        journey: unaffordable.journey,
        site,
        payload: {
          actionId: transfigureAllAction.id,
          selectionRulesVersion: unaffordable.runtime.selectionRulesVersion,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("excludes ineligible bulk targets and rejects tampered target snapshots atomically", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("bulk-hastened"),
      label: "Enter Spiraling Light",
      effectText: "Spend essence to transfigure Events.",
      effectKind: "transfigure-all-for-essence",
      essence: 100,
      predicate: "event",
      transfiguration: "Hastened",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const base = contentFixture([action, fallback]);
    const supported = base.cardDatabase.get(101);
    if (supported === undefined) throw new Error("Expected Event fixture");
    const unsupported = {
      ...supported,
      id: testCardId("f0000000-0000-4000-8000-000000000102"),
      cardNumber: 102,
      isFast: true,
    };
    const content: JourneyContent = {
      ...base,
      cardDatabase: new Map(base.cardDatabase).set(102, unsupported),
    };
    const prepared = buildState(content, {
      ...journeyFixture(content),
      essence: 150,
      deck: [
        {
          entryId: parseDeckEntryId("supported"),
          cardNumber: 101,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("already-transfigured"),
          cardNumber: 101,
          transfiguration: "Hastened",
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("unsupported"),
          cardNumber: 102,
          transfiguration: null,
          isBane: false,
        },
      ],
    });
    expect(prepared.runtime.actionOffers[0]?.eligibleDeckEntryIds).toEqual([
      "supported",
    ]);

    const originalOffer = prepared.runtime.actionOffers[0];
    if (originalOffer === undefined) throw new Error("Expected bulk offer");
    const tamperedRuntime = {
      ...prepared.runtime,
      actionOffers: [
        {
          ...originalOffer,
          eligibleDeckEntryIds: [
            parseDeckEntryId("supported"),
            parseDeckEntryId("unsupported"),
          ],
        },
        ...prepared.runtime.actionOffers.slice(1),
      ],
    };
    const tamperedJourney: JourneyState = {
      ...prepared.journey,
      siteRuntime: { [site.id]: tamperedRuntime },
    };
    const before = structuredClone(tamperedJourney);
    expect(
      resolveExplorationChoice({
        journey: tamperedJourney,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: tamperedRuntime.selectionRulesVersion,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(tamperedJourney).toEqual(before);

    const zeroEligible = buildState(content, {
      ...journeyFixture(content),
      deck: [
        {
          entryId: parseDeckEntryId("unsupported"),
          cardNumber: 102,
          transfiguration: null,
          isBane: false,
        },
      ],
    });
    expect(zeroEligible.runtime.actionOffers[0]?.eligibleDeckEntryIds).toEqual(
      [],
    );
    expect(
      resolveExplorationChoice({
        journey: zeroEligible.journey,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: zeroEligible.runtime.selectionRulesVersion,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("derives essence from matching deck entries and stacks spark on every Character", () => {
    const essenceAction: ExplorationActionContent = {
      id: testExplorationActionId("essence-per-card"),
      label: "Sound a gathering call",
      effectText: "Gain 15 essence for each Spirit Animal card in your deck",
      effectKind: "gain-essence-per-card",
      predicate: "spirit-animal",
      essencePerCard: 15,
    };
    const sparkAction: ExplorationActionContent = {
      id: testExplorationActionId("increase-spark"),
      label: "Receive Their Blessing",
      effectText: "All characters in your deck gain +1✦",
      effectKind: "increase-spark-all",
      sparkBonus: 1,
    };
    const content = contentFixture([essenceAction, sparkAction]);
    const essenceState = buildState(content);
    const spiritAnimalCount = essenceState.journey.deck.filter((entry) => {
      const base = content.cardDatabase.get(entry.cardNumber);
      return (
        base !== undefined &&
        resolveDeckEntryCard(
          CONFIG_DATA_FIXTURE.transfigurationData,
          base,
          entry,
        ).subtype === "Spirit Animal"
      );
    }).length;
    const withEssence = resolve(
      content,
      essenceState.journey,
      essenceAction.id,
    );
    expect(withEssence.essence).toBe(100 + spiritAnimalCount * 15);
    const essenceRuntime = withEssence.siteRuntime[site.id];
    expect(essenceRuntime?.kind).toBe("exploration");
    if (essenceRuntime?.kind !== "exploration") {
      throw new Error("Expected Exploration resolution");
    }
    expect(essenceRuntime.resolution?.essenceGained).toBe(
      spiritAnimalCount * 15,
    );
    expect(essenceRuntime.resolution?.affectedEntryIds).toEqual(
      expect.arrayContaining(
        essenceState.journey.deck
          .filter(
            (entry) =>
              content.cardDatabase.get(entry.cardNumber)?.subtype ===
              "Spirit Animal",
          )
          .map((entry) => entry.entryId),
      ),
    );

    const firstCharacterId = essenceState.journey.deck.find(
      (entry) =>
        content.cardDatabase.get(entry.cardNumber)?.cardType === "Character",
    )?.entryId;
    if (firstCharacterId === undefined) throw new Error("Expected a Character");
    const stackedJourney = {
      ...essenceState.journey,
      deck: essenceState.journey.deck.map((entry) =>
        entry.entryId === firstCharacterId
          ? { ...entry, sparkBonus: 2 }
          : entry,
      ),
    };
    const sparkState = buildState(content, stackedJourney);
    const withSpark = resolve(content, sparkState.journey, sparkAction.id);
    for (const entry of withSpark.deck) {
      const base = content.cardDatabase.get(entry.cardNumber);
      if (base?.cardType === "Character") {
        expect(entry.sparkBonus).toBe(
          entry.entryId === firstCharacterId ? 3 : 1,
        );
      } else {
        expect(entry.sparkBonus).toBeUndefined();
      }
    }
  });

  it("persists a uniformly purged subtype entry and exact survivor spark changes", () => {
    const oathAction: ExplorationActionContent = {
      id: testExplorationActionId("blood-oath"),
      label: "Swear a Blood Oath",
      effectText:
        "Purge a random Warrior. Every other Warrior in your deck gains +1✦.",
      effectKind: "purge-random-subtype-and-increase-spark",
      subtype: "Warrior",
      sparkBonus: 1,
    };
    const fallbackAction: ExplorationActionContent = {
      id: testExplorationActionId("battle-energy"),
      label: "Take the high road",
      effectText: "Gain 1 additional energy at the start of your next battle",
      effectKind: "next-battle-starting-energy",
      count: 1,
    };
    const content = contentFixture([oathAction, fallbackAction]);
    const warriors = [120, 121, 122].map((cardNumber, index) => ({
      entryId: parseDeckEntryId(`warrior-${String(index)}`),
      cardNumber,
      transfiguration: null,
      isBane: false,
    }));
    const prepared = buildState(content, {
      ...journeyFixture(content),
      deck: warriors,
    });
    const offer = prepared.runtime.actionOffers[0];
    expect(offer).toMatchObject({
      canonicalMechanicId: "purge-deck-entry",
      selectionPolicyId: "uniform",
      offeredDeckEntryIds: [expect.stringMatching(/^warrior-/u)],
    });
    expect(offer?.selectionTrace?.candidateCount).toBe(3);

    const resolved = resolve(content, prepared.journey, oathAction.id);
    const runtime = resolved.siteRuntime[site.id];
    if (runtime?.kind !== "exploration" || runtime.resolution === null) {
      throw new Error("Expected persisted Exploration resolution");
    }
    const victimId = offer?.offeredDeckEntryIds?.[0];
    const survivorIds = warriors
      .map((entry) => entry.entryId)
      .filter((entryId) => entryId !== victimId);
    expect(runtime.resolution.selection).toEqual({ entryIds: [victimId] });
    expect(runtime.resolution.purgedEntryIds).toEqual([victimId]);
    expect(runtime.resolution.affectedEntryIds).toEqual(survivorIds);
    expect(runtime.resolution.sparkBeforeByEntryId).toEqual(
      Object.fromEntries(survivorIds.map((entryId) => [entryId, 2])),
    );
    expect(runtime.resolution.sparkAfterByEntryId).toEqual(
      Object.fromEntries(survivorIds.map((entryId) => [entryId, 3])),
    );
    expect(resolved.deck).toHaveLength(2);
    expect(resolved.deck.every((entry) => entry.sparkBonus === 1)).toBe(true);
    expect(resolve(content, prepared.journey, oathAction.id)).toEqual(resolved);

    const unavailable = buildState(content, {
      ...journeyFixture(content),
      deck: warriors.slice(0, 1),
    });
    expect(unavailable.runtime.actionOffers[0]?.offeredDeckEntryIds).toEqual(
      [],
    );
    expect(
      resolveExplorationChoice({
        journey: unavailable.journey,
        site,
        payload: {
          actionId: oathAction.id,
          selectionRulesVersion: unavailable.runtime.selectionRulesVersion,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("builds two distinct Warrior packs and resolves the selected pack", () => {
    const packAction: ExplorationActionContent = {
      id: testExplorationActionId("warrior-packs"),
      label: "Answer Their Muster",
      effectText: "Choose one of 2 packs of Warrior cards to add to your deck",
      effectKind: "choose-pack",
      predicate: "warrior",
      packCount: 2,
      packSize: 3,
    };
    const randomAction: ExplorationActionContent = {
      id: testExplorationActionId("random-survivors"),
      label: "Open the Passage",
      effectText: "Gain 2 random Survivor cards",
      effectKind: "gain-random-cards",
      predicate: "survivor",
      count: 2,
    };
    const content = contentFixture([packAction, randomAction]);
    const state = buildState(content);
    const packs = state.runtime.actionOffers[0]?.packCardIds ?? [];

    expect(packs).toHaveLength(2);
    expect(packs.every((pack) => pack.length === 3)).toBe(true);
    expect(new Set(packs.flat()).size).toBe(6);
    expect(
      packs
        .flat()
        .every((cardId) =>
          [...content.cardDatabase.values()].some(
            (entry) => entry.id === cardId && entry.subtype === "Warrior",
          ),
        ),
    ).toBe(true);
    const result = resolve(content, state.journey, packAction.id, {
      packIndex: 0,
    });
    expect(result.deck).toHaveLength(state.journey.deck.length + 3);
  });

  it("replaces a UUID-selected Dreamsign at the collection cap", () => {
    const heldDreamsignId = testDreamsignId(
      "d0000000-0000-4000-8000-000000000099",
    );
    const dreamsignAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-dreamsign"),
      label: "Reach toward the tusks",
      effectText: "Gain Charm Pouch",
      effectKind: "gain-dreamsign",
      dreamsignId: testDreamsignId(CHARM_POUCH_ID),
    };
    const gainCardAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-card"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([dreamsignAction, gainCardAction]);
    const journey = {
      ...journeyFixture(content),
      maxDreamsigns: 1,
      dreamsigns: [
        {
          id: heldDreamsignId,
          name: "Held Dreamsign",
          effectDescription: "A held fixture.",
        },
      ],
    };
    const state = buildState(content, journey);
    const result = resolve(content, state.journey, dreamsignAction.id, {
      replacedDreamsignId: heldDreamsignId,
    });

    expect(result.dreamsigns).toHaveLength(1);
    expect(result.dreamsigns[0]?.id).toBe(CHARM_POUCH_ID);
  });

  it("resolves a fixed custom Dreamsign by UUID", () => {
    const customDreamsignId = "custom-exploration-dreamsign";
    const dreamsignAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-custom-dreamsign"),
      label: "Take the custom sign",
      effectText: "Gain a custom Dreamsign",
      effectKind: "gain-dreamsign",
      dreamsignId: testDreamsignId(customDreamsignId),
    };
    const fallbackAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-card"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const base = contentFixture([dreamsignAction, fallbackAction]);
    if (base.exploration === undefined) {
      throw new Error("Expected Exploration content");
    }
    const content: JourneyContent = {
      ...base,
      exploration: {
        ...base.exploration,
        customDreamsigns: [
          {
            id: testDreamsignId(customDreamsignId),
            name: "Custom Exploration Dreamsign",
            effectDescription: "A synthetic custom effect.",
          },
        ],
      },
    };
    const state = buildState(content);
    const result = resolve(content, state.journey, dreamsignAction.id);

    expect(result.dreamsigns).toContainEqual({
      id: testDreamsignId(customDreamsignId),
      name: "Custom Exploration Dreamsign",
      effectDescription: "A synthetic custom effect.",
    });
  });

  it("drafts one offered card and gains the authored number of copies", () => {
    const draftAction: ExplorationActionContent = {
      id: testExplorationActionId("draft-two-copies"),
      label: "Call for Reinforcements",
      effectText: "Draft a Survivor from 4 choices and gain 2 copies of it",
      effectKind: "draft-card",
      predicate: "survivor",
      offerCount: 4,
      count: 2,
    };
    const fallbackAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-source"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([draftAction, fallbackAction]);
    const state = buildState(content);
    const selectedId = state.runtime.actionOffers[0]?.offeredCardIds[0];
    if (selectedId === undefined) throw new Error("Expected a draft offer");

    const result = resolve(content, state.journey, draftAction.id, {
      cardIds: [selectedId],
    });
    const gained = result.siteRuntime[site.id];
    expect(result.deck).toHaveLength(state.journey.deck.length + 2);
    expect(gained).toMatchObject({
      kind: "exploration",
      resolution: { gainedCardIds: [selectedId, selectedId] },
    });
  });

  it("purges an unrestricted selected card when the action has no predicate", () => {
    const purgeAction: ExplorationActionContent = {
      id: testExplorationActionId("purge-any-card"),
      label: "Purge a chosen card",
      effectText: "Purge a chosen card",
      effectKind: "purge-selected",
      count: 1,
    };
    const fallbackAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-source"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([purgeAction, fallbackAction]);
    const state = buildState(content);
    const selectedEntry = state.journey.deck[0];
    if (selectedEntry === undefined) throw new Error("Expected a deck entry");
    const purgedCardId = content.cardDatabase.get(selectedEntry.cardNumber)?.id;
    if (purgedCardId === undefined) throw new Error("Expected a catalog card");

    const result = resolve(content, state.journey, purgeAction.id, {
      entryIds: [selectedEntry.entryId],
    });
    expect(result.deck).toHaveLength(state.journey.deck.length - 1);
    expect(
      result.deck.some((entry) => entry.entryId === selectedEntry.entryId),
    ).toBe(false);
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        affectedEntryIds: [],
        purgedCardIds: [purgedCardId],
        purgedEntryIds: [selectedEntry.entryId],
        purgedEntrySnapshots: [selectedEntry],
      },
    });
  });

  it("replays zero, one, or two distinct selected Warriors for a bounded purge", () => {
    const purgeAction: ExplorationActionContent = {
      id: testExplorationActionId("purge-up-to-two-warriors"),
      label: "Stand Down the Escort",
      effectText: "Purge up to 2 chosen Warrior cards",
      effectKind: "purge-selected",
      predicate: "warrior",
      count: 2,
    };
    const fallbackAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-source"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([purgeAction, fallbackAction]);
    const warriorEntries = [120, 121].map((cardNumber, index) => ({
      entryId: parseDeckEntryId(`warrior-entry-${String(index)}`),
      cardNumber,
      transfiguration: null,
      isBane: false,
    }));
    const eventEntry = {
      entryId: parseDeckEntryId("event-entry"),
      cardNumber: 101,
      transfiguration: null,
      isBane: false,
    };
    const state = buildState(content, {
      ...journeyFixture(content),
      deck: [...warriorEntries, eventEntry],
    });

    const none = resolve(content, state.journey, purgeAction.id, {
      entryIds: [],
    });
    expect(none.deck).toEqual(state.journey.deck);
    expect(none.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: [] },
        purgedCardIds: [],
        purgedEntryIds: [],
        purgedEntrySnapshots: [],
      },
    });

    const selectedEntryIds = warriorEntries.map((entry) => entry.entryId);
    const both = resolve(content, state.journey, purgeAction.id, {
      entryIds: selectedEntryIds.map(parseDeckEntryId),
    });
    const replayed = resolve(content, state.journey, purgeAction.id, {
      entryIds: selectedEntryIds.map(parseDeckEntryId),
    });
    expect(both.deck).toEqual([eventEntry]);
    expect(replayed).toEqual(both);
    expect(both.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: selectedEntryIds.map(parseDeckEntryId) },
        purgedEntryIds: selectedEntryIds.map(parseDeckEntryId),
        purgedEntrySnapshots: warriorEntries,
      },
    });

    for (const entryIds of [
      [warriorEntries[0]?.entryId, warriorEntries[0]?.entryId],
      [...selectedEntryIds, eventEntry.entryId],
      [eventEntry.entryId],
    ]) {
      expect(
        resolveExplorationChoice({
          journey: state.journey,
          site,
          payload: {
            actionId: purgeAction.id,
            selection: { entryIds },
            selectionRulesVersion: SELECTION_RULES_VERSION,
          },
          seq: 91,
          content,
        }),
      ).toBeNull();
    }
  });

  it("prepares an offered Dreamsign plan without spending the pool and resolves append or cap replacement", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("offered-dreamsign"),
      label: "Choose a sign",
      effectText: "Choose one of three Dreamsigns",
      effectKind: "gain-offered-dreamsign",
      offerCount: 3,
    };
    const content = dreamsignContent(action);
    const stalePool = [
      dreamsignId(5).toUpperCase(),
      dreamsignId(3),
      dreamsignId(5),
      "not-a-dreamsign",
      dreamsignId(4),
      dreamsignId(6),
    ].map(testDreamsignId);
    const state = buildState(
      content,
      withDreamsignPool(content, {
        heldCount: 1,
        maxDreamsigns: 4,
        remainingIds: stalePool,
      }),
    );
    const offer = state.runtime.actionOffers[0];
    const plan = offer?.dreamsignPreparation;
    expect(plan).toMatchObject({
      kind: "offered-gain",
      requestedCount: 3,
      heldIdsAtPreparation: [dreamsignId(1)],
      maxDreamsignsAtPreparation: 4,
      poolBeforeIds: [
        dreamsignId(3),
        dreamsignId(4),
        dreamsignId(5),
        dreamsignId(6),
      ],
      poolRegenerated: false,
      requiredOverflowReplacementCount: 0,
    });
    expect(plan?.preparedDreamsignIds).toHaveLength(3);
    expect(new Set(plan?.preparedDreamsignIds).size).toBe(3);
    expect(offer?.offeredDreamsignIds).toEqual(plan?.preparedDreamsignIds);
    expect(state.journey.remainingDreamsignPool).toEqual(stalePool);
    expect(JSON.parse(JSON.stringify(state.runtime))).toEqual(state.runtime);
    expect(() =>
      assertJsonSafe(state.runtime, "exploration-runtime"),
    ).not.toThrow();

    const offeredDreamsignId = plan?.preparedDreamsignIds[0];
    if (offeredDreamsignId === undefined) throw new Error("Expected an offer");
    const appended = resolve(content, state.journey, action.id, {
      offeredDreamsignId,
    });
    const replayed = resolve(content, state.journey, action.id, {
      offeredDreamsignId,
    });
    expect(replayed).toEqual(appended);
    expect(appended.dreamsigns.map(({ id }) => id)).toEqual([
      dreamsignId(1),
      offeredDreamsignId,
    ]);
    expect(appended.remainingDreamsignPool).toEqual(
      plan?.poolBasisIds.filter((id) => id !== offeredDreamsignId),
    );
    expect(appended.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { offeredDreamsignId },
        gainedDreamsignIds: [offeredDreamsignId],
        purgedDreamsignIds: [],
        dreamsignMutation: {
          beforeIds: [dreamsignId(1)],
          afterIds: [dreamsignId(1), offeredDreamsignId],
          offeredIds: plan?.preparedDreamsignIds,
          gainedIds: [offeredDreamsignId],
          purgedIds: [],
          replacements: [],
        },
      },
    });

    const cappedState = buildState(
      content,
      withDreamsignPool(content, { heldCount: 2, maxDreamsigns: 2 }),
    );
    const cappedOffer = cappedState.runtime.actionOffers[0];
    const cappedGain =
      cappedOffer?.dreamsignPreparation?.preparedDreamsignIds[0];
    if (cappedGain === undefined) throw new Error("Expected a capped offer");
    expect(
      resolveExplorationChoice({
        journey: cappedState.journey,
        site,
        payload: {
          actionId: action.id,
          selection: { offeredDreamsignId: cappedGain },
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    const replaced = resolve(content, cappedState.journey, action.id, {
      offeredDreamsignId: cappedGain,
      replacedDreamsignId: dreamsignId(2),
    });
    expect(replaced.dreamsigns.map(({ id }) => id)).toEqual([
      dreamsignId(1),
      cappedGain,
    ]);
    expect(
      explorationResolutionFor(replaced).dreamsignMutation?.replacements,
    ).toEqual([
      {
        removedDreamsignId: dreamsignId(2),
        gainedDreamsignId: cappedGain,
      },
    ]);
  });

  it("atomically gains exact Nightmares with a fixed global or custom Dreamsign", () => {
    const fixedDreamsignId = dreamsignId(4);
    const action: ExplorationActionContent = {
      id: testExplorationActionId("nightmares-and-fixed-dreamsign"),
      label: "Take the marked sign",
      effectText: "Gain two Nightmares and a fixed Dreamsign",
      effectKind: "gain-nightmare-and-dreamsign",
      dreamsignId: fixedDreamsignId,
      nightmareCount: 2,
    };
    const content = dreamsignContent(action, 8);
    const state = buildState(
      content,
      withDreamsignPool(content, { heldCount: 1, maxDreamsigns: 3 }),
    );
    const offer = state.runtime.actionOffers[0];
    expect(offer).toMatchObject({
      canonicalMechanicId: "gain-dreamsign",
      selectionPolicyId: "fixed",
      offeredDreamsignIds: [],
      dreamsignPreparation: {
        kind: "fixed-gain",
        requestedCount: 1,
        nightmareCount: 2,
        preparedDreamsignIds: [fixedDreamsignId],
        requiredOverflowReplacementCount: 0,
      },
    });
    expect(state.journey.remainingDreamsignPool).toContain(fixedDreamsignId);

    const resolved = resolve(content, state.journey, action.id);
    const replayed = resolve(content, state.journey, action.id);
    expect(replayed).toEqual(resolved);
    expect(resolved.deck).toHaveLength(state.journey.deck.length + 2);
    expect(resolved.dreamsigns.map(({ id }) => id)).toEqual([
      dreamsignId(1),
      fixedDreamsignId,
    ]);
    expect(resolved.remainingDreamsignPool).not.toContain(fixedDreamsignId);
    expect(explorationResolutionFor(resolved)).toMatchObject({
      selection: {},
      gainedCardIds: [NIGHTMARE_ID, NIGHTMARE_ID],
      gainedEntryIds: [parseDeckEntryId("deck-91-0"), parseDeckEntryId("deck-91-1")],
      gainedDreamsignIds: [fixedDreamsignId],
      dreamsignMutation: {
        beforeIds: [dreamsignId(1)],
        afterIds: [dreamsignId(1), fixedDreamsignId],
        offeredIds: [],
        gainedIds: [fixedDreamsignId],
        purgedIds: [],
        replacements: [],
      },
    });
    const resolvedRuntime = resolved.siteRuntime[site.id];
    expect(JSON.parse(JSON.stringify(resolvedRuntime))).toEqual(
      resolvedRuntime,
    );
    expect(() =>
      assertJsonSafe(resolvedRuntime, "fixed-nightmare-bundle"),
    ).not.toThrow();

    const capped = buildState(
      content,
      withDreamsignPool(content, { heldCount: 2, maxDreamsigns: 2 }),
    );
    expect(capped.runtime.actionOffers[0]?.dreamsignPreparation).toMatchObject({
      requiredOverflowReplacementCount: 1,
    });
    for (const replacedDreamsignId of [undefined, "not-held"]) {
      expect(
        resolveExplorationChoice({
          journey: capped.journey,
          site,
          payload: {
            actionId: action.id,
            selection:
              replacedDreamsignId === undefined
                ? {}
                : { replacedDreamsignId: testDreamsignId(replacedDreamsignId) },
            selectionRulesVersion: SELECTION_RULES_VERSION,
          },
          seq: 91,
          content,
        }),
      ).toBeNull();
    }
    const replaced = resolve(content, capped.journey, action.id, {
      replacedDreamsignId: dreamsignId(2),
    });
    expect(replaced.dreamsigns.map(({ id }) => id)).toEqual([
      dreamsignId(1),
      fixedDreamsignId,
    ]);
    expect(
      explorationResolutionFor(replaced).dreamsignMutation?.replacements,
    ).toEqual([
      {
        removedDreamsignId: dreamsignId(2),
        gainedDreamsignId: fixedDreamsignId,
      },
    ]);

    const customDreamsignId = "d0000000-0000-4000-8000-000000000098";
    const customAction: ExplorationActionContent = {
      ...action,
      id: testExplorationActionId("nightmares-and-custom-dreamsign"),
      dreamsignId: testDreamsignId(customDreamsignId),
    };
    const customBase = dreamsignContent(customAction, 4);
    if (customBase.exploration === undefined)
      throw new Error("Expected Exploration content");
    const customContent: JourneyContent = {
      ...customBase,
      exploration: {
        ...customBase.exploration,
        customDreamsigns: [
          {
            id: testDreamsignId(customDreamsignId),
            name: "Custom Nightmare Sign",
            effectDescription: "A synthetic custom effect.",
          },
        ],
      },
    };
    const customState = buildState(customContent);
    const custom = resolve(customContent, customState.journey, customAction.id);
    expect(custom.dreamsigns).toContainEqual({
      id: testDreamsignId(customDreamsignId),
      name: "Custom Nightmare Sign",
      effectDescription: "A synthetic custom effect.",
    });
    expect(custom.remainingDreamsignPool).toEqual(
      customState.journey.remainingDreamsignPool,
    );
  });

  it("rejects unavailable or tampered fixed Nightmare bundles without partial mutation", () => {
    const fixedDreamsignId = dreamsignId(1);
    const action: ExplorationActionContent = {
      id: testExplorationActionId("guarded-nightmare-and-fixed-dreamsign"),
      label: "Take the marked sign",
      effectText: "Gain a Nightmare and a fixed Dreamsign",
      effectKind: "gain-nightmare-and-dreamsign",
      dreamsignId: fixedDreamsignId,
      nightmareCount: 1,
    };
    const content = dreamsignContent(action, 5);
    const alreadyHeld = buildState(
      content,
      withDreamsignPool(content, { heldCount: 1 }),
    );
    expect(
      alreadyHeld.runtime.actionOffers[0]?.dreamsignPreparation,
    ).toMatchObject({ unavailableReason: "insufficient-candidates" });
    expect(
      resolveExplorationChoice({
        journey: alreadyHeld.journey,
        site,
        payload: {
          actionId: action.id,
          selection: {},
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();

    const zeroCapacity = buildState(
      content,
      withDreamsignPool(content, { heldCount: 0, maxDreamsigns: 0 }),
    );
    expect(
      zeroCapacity.runtime.actionOffers[0]?.dreamsignPreparation,
    ).toMatchObject({ unavailableReason: "capacity-too-small" });

    const validAction = {
      ...action,
      dreamsignId: dreamsignId(3),
    };
    const validContent = dreamsignContent(validAction, 6);
    const prepared = buildState(validContent);
    const tamperedContent: JourneyContent = {
      ...validContent,
      exploration: {
        ...validContent.exploration!,
        encounters: validContent.exploration!.encounters.map((encounter) => ({
          ...encounter,
          actions: encounter.actions.map((candidate) =>
            candidate.id === validAction.id
              ? { ...candidate, nightmareCount: 2 }
              : candidate,
          ),
        })),
      },
    };
    expect(
      resolveExplorationChoice({
        journey: prepared.journey,
        site,
        payload: {
          actionId: validAction.id,
          selection: {},
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
        seq: 91,
        content: tamperedContent,
      }),
    ).toBeNull();

    const cardsWithoutNightmare = new Map(
      [...validContent.cardDatabase].filter(
        ([, candidate]) => candidate.id !== NIGHTMARE_ID,
      ),
    );
    const missingNightmareContent = {
      ...validContent,
      cardDatabase: cardsWithoutNightmare,
    };
    const missingNightmare = buildState(missingNightmareContent);
    const before = structuredClone(missingNightmare.journey);
    expect(
      resolveExplorationChoice({
        journey: missingNightmare.journey,
        site,
        payload: {
          actionId: validAction.id,
          selection: {},
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
        seq: 91,
        content: missingNightmareContent,
      }),
    ).toBeNull();
    expect(missingNightmare.journey).toEqual(before);
  });

  it("prepares a non-spending offered Nightmare bundle and spends only the chosen Dreamsign", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("nightmares-and-offered-dreamsign"),
      label: "Choose a dark sign",
      effectText: "Gain two Nightmares and one of three Dreamsigns",
      effectKind: "gain-nightmare-and-offered-dreamsign",
      offerCount: 3,
      nightmareCount: 2,
    };
    const content = dreamsignContent(action, 9);
    const originalPool = [
      dreamsignId(3),
      dreamsignId(4),
      dreamsignId(5),
      dreamsignId(6),
    ].map(testDreamsignId);
    const state = buildState(
      content,
      withDreamsignPool(content, {
        heldCount: 2,
        maxDreamsigns: 4,
        remainingIds: originalPool,
      }),
    );
    const offer = state.runtime.actionOffers[0];
    const plan = offer?.dreamsignPreparation;
    expect(offer).toMatchObject({
      canonicalMechanicId: "gain-dreamsign",
      selectionPolicyId: "dreamsign-match",
      dreamsignPreparation: {
        kind: "offered-gain",
        requestedCount: 3,
        nightmareCount: 2,
        requiredOverflowReplacementCount: 0,
      },
    });
    expect(offer?.offeredDreamsignIds).toEqual(plan?.preparedDreamsignIds);
    expect(state.journey.remainingDreamsignPool).toEqual(originalPool);
    const selected = plan?.preparedDreamsignIds[1];
    if (selected === undefined) throw new Error("Expected a Dreamsign offer");
    const resolved = resolve(content, state.journey, action.id, {
      offeredDreamsignId: selected,
    });
    expect(resolved.remainingDreamsignPool).toEqual(
      plan?.poolBasisIds.filter((id) => id !== selected),
    );
    for (const unchosen of plan?.preparedDreamsignIds ?? []) {
      if (unchosen !== selected) {
        expect(resolved.remainingDreamsignPool).toContain(unchosen);
      }
    }
    expect(explorationResolutionFor(resolved)).toMatchObject({
      selection: { offeredDreamsignId: selected },
      gainedCardIds: [NIGHTMARE_ID, NIGHTMARE_ID],
      gainedEntryIds: [parseDeckEntryId("deck-91-0"), parseDeckEntryId("deck-91-1")],
      gainedDreamsignIds: [selected],
      dreamsignMutation: {
        offeredIds: plan?.preparedDreamsignIds,
        gainedIds: [selected],
      },
    });
    expect(
      resolve(content, state.journey, action.id, {
        offeredDreamsignId: selected,
      }),
    ).toEqual(resolved);
    expect(JSON.parse(JSON.stringify(resolved))).toEqual(resolved);

    const capped = buildState(
      content,
      withDreamsignPool(content, { heldCount: 2, maxDreamsigns: 2 }),
    );
    const cappedPlan = capped.runtime.actionOffers[0]?.dreamsignPreparation;
    const cappedSelected = cappedPlan?.preparedDreamsignIds[0];
    if (cappedSelected === undefined)
      throw new Error("Expected a capped Dreamsign offer");
    expect(cappedPlan?.requiredOverflowReplacementCount).toBe(1);
    expect(
      resolveExplorationChoice({
        journey: capped.journey,
        site,
        payload: {
          actionId: action.id,
          selection: { offeredDreamsignId: cappedSelected },
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    const replaced = resolve(content, capped.journey, action.id, {
      offeredDreamsignId: cappedSelected,
      replacedDreamsignId: dreamsignId(1),
    });
    expect(replaced.dreamsigns.map(({ id }) => id)).toEqual([
      cappedSelected,
      dreamsignId(2),
    ]);

    const cappedOffer = capped.runtime.actionOffers[0];
    if (cappedOffer === undefined || cappedPlan === undefined)
      throw new Error("Expected a signed capped plan");
    const tamperedJourney: JourneyState = {
      ...capped.journey,
      siteRuntime: {
        ...capped.journey.siteRuntime,
        [site.id]: {
          ...capped.runtime,
          actionOffers: [
            {
              ...cappedOffer,
              dreamsignPreparation: {
                ...cappedPlan,
                requiredOverflowReplacementCount: 0,
              },
            },
            ...capped.runtime.actionOffers.slice(1),
          ],
        },
      },
    };
    expect(
      resolveExplorationChoice({
        journey: tamperedJourney,
        site,
        payload: {
          actionId: action.id,
          selection: {
            offeredDreamsignId: cappedSelected,
            replacedDreamsignId: dreamsignId(1),
          },
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("replays one compound Nightmare and Dreamsign intent byte-identically and rejects its duplicate", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("replayed-nightmares-and-dreamsign"),
      label: "Choose a dark sign",
      effectText: "Gain two Nightmares and one of three Dreamsigns",
      effectKind: "gain-nightmare-and-offered-dreamsign",
      offerCount: 3,
      nightmareCount: 2,
    };
    const content = dreamsignContent(action, 8);
    const prepared = buildState(
      content,
      withDreamsignPool(content, { heldCount: 0, maxDreamsigns: 4 }),
    );
    const offeredDreamsignId =
      prepared.runtime.actionOffers[0]?.dreamsignPreparation
        ?.preparedDreamsignIds[0];
    if (offeredDreamsignId === undefined)
      throw new Error("Expected a prepared Dreamsign");
    const foldJourney: JourneyState = {
      ...prepared.journey,
      currentDreamscape: parseAtlasNodeId("exploration-node"),
      atlas: {
        ...prepared.journey.atlas,
        nodes: {
          [parseAtlasNodeId("exploration-node")]: {
            id: parseAtlasNodeId("exploration-node"),
            layer: LayerName.Two,
            indexInLayer: 0,
            dreamscapeId: testDreamscapeId("fixture-dreamscape"),
            sites: [site],
            position: { x: 0, y: 0 },
            state: "available",
            enhancedSiteType: null,
            forwardIds: [],
            backwardIds: [],
            knownDreamsignId: null,
          },
        },
        startingNodeId: parseAtlasNodeId("exploration-node"),
        currentNodeId: parseAtlasNodeId("exploration-node"),
      },
    };
    const genesis: Genesis = {
      seed: testJourneySeed("nightmare-dreamsign-fold"),
      reducerVersion: "test",
      createdAt: 0,
      contentConfig: { poolVariant: "tides4" },
    };
    const payload = {
      siteId: site.id,
      actionId: action.id,
      selection: { offeredDreamsignId },
      selectionRulesVersion: prepared.runtime.selectionRulesVersion,
    };
    const event: GameEvent = {
      type: "RESOLVE_EXPLORATION_CHOICE",
      payload,
      actor: testEventActor("client-a"),
      clientTimestamp: "1970-01-01T00:00:00.000Z",
      basedOnSeq: 0,
    };
    const duplicate: GameEvent = {
      ...event,
      clientTimestamp: "1970-01-01T00:00:01.000Z",
      basedOnSeq: 1,
    };
    const base = {
      seq: 0,
      state: {
        ...GAME_ENGINE_CONFIG.genesisState(genesis),
        journey: foldJourney,
      },
    };
    expect(JSON.parse(JSON.stringify(event))).toEqual(event);
    expect(() =>
      assertJsonSafe(event, "nightmare-dreamsign-event"),
    ).not.toThrow();

    registerSiteContentProvider(createSiteContentProvider(content));
    try {
      const first = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [{ seq: 1, event }],
        { devMode: true },
      );
      const replay = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [{ seq: 1, event }],
        { devMode: true },
      );
      const duplicateFold = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [
          { seq: 1, event },
          { seq: 2, event: duplicate },
        ],
        { devMode: true },
      );
      expect(first.outcomes[0]?.outcome).toBe("applied");
      expect(replay.state).toEqual(first.state);
      expect(duplicateFold.outcomes.map(({ outcome }) => outcome)).toEqual([
        "applied",
        "bounced",
      ]);
      expect(duplicateFold.state.journey).toEqual(first.state.journey);
      expect(first.state.journey.siteRuntime[site.id]).toMatchObject({
        kind: "exploration",
        resolution: {
          gainedCardIds: [NIGHTMARE_ID, NIGHTMARE_ID],
          gainedEntryIds: [
            parseDeckEntryId("deck-1-0"),
            parseDeckEntryId("deck-1-1"),
          ],
          gainedDreamsignIds: [offeredDreamsignId],
        },
      });
    } finally {
      registerSiteContentProvider(null);
    }
  });

  it("replaces one chosen held Dreamsign atomically even with free capacity", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("offered-dreamsign-replacement"),
      label: "Exchange a sign",
      effectText: "Replace a Dreamsign with one of three",
      effectKind: "replace-selected-dreamsign-with-offered",
      offerCount: 3,
    };
    const content = dreamsignContent(action);
    const state = buildState(
      content,
      withDreamsignPool(content, { heldCount: 2, maxDreamsigns: 8 }),
    );
    const plan = state.runtime.actionOffers[0]?.dreamsignPreparation;
    const offeredDreamsignId = plan?.preparedDreamsignIds[1];
    if (offeredDreamsignId === undefined) throw new Error("Expected an offer");
    expect(plan).toMatchObject({
      kind: "offered-replacement",
      heldIdsAtPreparation: [dreamsignId(1), dreamsignId(2)],
    });

    const result = resolve(content, state.journey, action.id, {
      offeredDreamsignId,
      replacedDreamsignId: dreamsignId(1),
    });
    expect(result.dreamsigns.map(({ id }) => id)).toEqual([
      offeredDreamsignId,
      dreamsignId(2),
    ]);
    for (const selection of [
      { offeredDreamsignId },
      {
        offeredDreamsignId: dreamsignId(1),
        replacedDreamsignId: dreamsignId(2),
      },
      {
        offeredDreamsignId,
        replacedDreamsignId: testDreamsignId("not-held"),
      },
      {
        offeredDreamsignId,
        replacedDreamsignId: dreamsignId(1),
        purgedDreamsignId: dreamsignId(2),
      },
    ]) {
      expect(
        resolveExplorationChoice({
          journey: state.journey,
          site,
          payload: {
            actionId: action.id,
            selection,
            selectionRulesVersion: SELECTION_RULES_VERSION,
          },
          seq: 91,
          content,
        }),
      ).toBeNull();
    }
  });

  it("renews once and replaces all held Dreamsigns in stable slot order", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("replace-all-dreamsigns"),
      label: "Recast every sign",
      effectText: "Replace all Dreamsigns randomly",
      effectKind: "replace-all-dreamsigns-random",
    };
    const content = dreamsignContent(action, 8);
    const state = buildState(
      content,
      withDreamsignPool(content, {
        heldCount: 3,
        maxDreamsigns: 5,
        remainingIds: [dreamsignId(4)],
      }),
    );
    const offer = state.runtime.actionOffers[0];
    const plan = offer?.dreamsignPreparation;
    expect(plan).toMatchObject({
      kind: "replace-all-random",
      requestedCount: 3,
      heldIdsAtPreparation: [dreamsignId(1), dreamsignId(2), dreamsignId(3)],
      poolBeforeIds: [dreamsignId(4)],
      poolRegenerated: true,
      poolBasisIds: [
        dreamsignId(4),
        dreamsignId(5),
        dreamsignId(6),
        dreamsignId(7),
        dreamsignId(8),
      ],
    });
    expect(offer?.offeredDreamsignIds).toEqual([]);
    expect(state.journey.remainingDreamsignPool).toEqual([dreamsignId(4)]);

    const result = resolve(content, state.journey, action.id);
    expect(result.dreamsigns.map(({ id }) => id)).toEqual(
      plan?.preparedDreamsignIds,
    );
    const mutation = explorationResolutionFor(result).dreamsignMutation;
    expect(mutation?.replacements).toEqual(
      [dreamsignId(1), dreamsignId(2), dreamsignId(3)].map(
        (removedDreamsignId, index) => ({
          removedDreamsignId: removedDreamsignId,
          gainedDreamsignId: plan?.preparedDreamsignIds[index],
        }),
      ),
    );
    expect(mutation?.purgedIds).toEqual([]);
    expect(mutation?.poolRegenerated).toBe(true);
    expect(mutation?.poolAfterIds).not.toContain(dreamsignId(1));
  });

  it("purges exactly one Dreamsign and handles zero, one, or two overflow replacements", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("purge-and-gain-dreamsigns"),
      label: "Break and gather signs",
      effectText: "Purge one Dreamsign and gain three random Dreamsigns",
      effectKind: "purge-selected-dreamsign-and-gain-random",
      count: 3,
    };
    const content = dreamsignContent(action, 12);
    for (const heldCount of [1, 2, 3]) {
      const state = buildState(
        content,
        withDreamsignPool(content, { heldCount, maxDreamsigns: 3 }),
      );
      const plan = state.runtime.actionOffers[0]?.dreamsignPreparation;
      const overflowCount = heldCount - 1;
      expect(plan).toMatchObject({
        kind: "purge-and-gain-random",
        requestedCount: 3,
        requiredOverflowReplacementCount: overflowCount,
      });
      expect(state.runtime.actionOffers[0]?.offeredDreamsignIds).toEqual([]);
      const purgedDreamsignId = dreamsignId(1);
      const overflowReplacementDreamsignIds = Array.from(
        { length: overflowCount },
        (_, index) => dreamsignId(index + 2),
      ).reverse();
      const result = resolve(content, state.journey, action.id, {
        purgedDreamsignId,
        overflowReplacementDreamsignIds,
      });
      const resolution = explorationResolutionFor(result);
      const mutation = resolution.dreamsignMutation;
      expect(result.dreamsigns).toHaveLength(3);
      expect(mutation?.gainedIds).toHaveLength(3);
      expect(mutation?.purgedIds).toEqual([purgedDreamsignId]);
      expect(mutation?.replacements).toEqual(
        Array.from({ length: overflowCount }, (_, index) => ({
          removedDreamsignId: dreamsignId(index + 2),
          gainedDreamsignId: plan?.preparedDreamsignIds[index],
        })),
      );
      expect(resolution.purgedDreamsignIds).toEqual([purgedDreamsignId]);
      if (heldCount === 3) {
        for (const invalidSelection of [
          {
            purgedDreamsignId,
            overflowReplacementDreamsignIds: [dreamsignId(2)],
          },
          {
            purgedDreamsignId,
            overflowReplacementDreamsignIds: [dreamsignId(2), dreamsignId(2)],
          },
          {
            purgedDreamsignId,
            overflowReplacementDreamsignIds: [
              purgedDreamsignId,
              dreamsignId(2),
            ],
          },
        ]) {
          expect(
            resolveExplorationChoice({
              journey: state.journey,
              site,
              payload: {
                actionId: action.id,
                selection: invalidSelection,
                selectionRulesVersion: SELECTION_RULES_VERSION,
              },
              seq: 91,
              content,
            }),
          ).toBeNull();
        }
      }
    }
  });

  it("persists action-level Dreamsign unavailability and rejects stale or tampered plans", () => {
    const replaceAll: ExplorationActionContent = {
      id: testExplorationActionId("unavailable-replace-all"),
      label: "Recast every sign",
      effectText: "Replace all Dreamsigns randomly",
      effectKind: "replace-all-dreamsigns-random",
    };
    const emptyContent = dreamsignContent(replaceAll, 2);
    const emptyState = buildState(
      emptyContent,
      withDreamsignPool(emptyContent, { heldCount: 0 }),
    );
    expect(
      emptyState.runtime.actionOffers[0]?.dreamsignPreparation,
    ).toMatchObject({
      unavailableReason: "requires-held-dreamsign",
    });
    expect(
      resolveExplorationChoice({
        journey: emptyState.journey,
        site,
        payload: {
          actionId: replaceAll.id,
          selection: {},
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
        seq: 91,
        content: emptyContent,
      }),
    ).toBeNull();

    const offered: ExplorationActionContent = {
      id: testExplorationActionId("insufficient-offer"),
      label: "Choose a sign",
      effectText: "Choose one of three Dreamsigns",
      effectKind: "gain-offered-dreamsign",
      offerCount: 3,
    };
    const insufficientContent = dreamsignContent(offered, 2);
    const insufficientState = buildState(
      insufficientContent,
      withDreamsignPool(insufficientContent, {
        packageIds: [dreamsignId(1), dreamsignId(2)],
      }),
    );
    expect(insufficientState.runtime.actionOffers).toHaveLength(2);
    expect(
      insufficientState.runtime.actionOffers[0]?.dreamsignPreparation,
    ).toMatchObject({
      poolRegenerated: true,
      unavailableReason: "insufficient-candidates",
      preparedDreamsignIds: [],
    });
    expect(
      resolveExplorationChoice({
        journey: insufficientState.journey,
        site,
        payload: {
          actionId: offered.id,
          selection: { offeredDreamsignId: dreamsignId(1) },
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
        seq: 91,
        content: insufficientContent,
      }),
    ).toBeNull();

    const purgeAndGain: ExplorationActionContent = {
      id: testExplorationActionId("capacity-too-small"),
      label: "Break and gather signs",
      effectText: "Purge one and gain three",
      effectKind: "purge-selected-dreamsign-and-gain-random",
      count: 3,
    };
    const capacityContent = dreamsignContent(purgeAndGain, 8);
    const capacityState = buildState(
      capacityContent,
      withDreamsignPool(capacityContent, {
        heldCount: 1,
        maxDreamsigns: 2,
      }),
    );
    expect(
      capacityState.runtime.actionOffers[0]?.dreamsignPreparation,
    ).toMatchObject({ unavailableReason: "capacity-too-small" });

    const content = dreamsignContent(offered, 8);
    const prepared = buildState(content, withDreamsignPool(content));
    const offer = prepared.runtime.actionOffers[0];
    const originalPlan = offer?.dreamsignPreparation;
    if (offer === undefined || originalPlan === undefined) {
      throw new Error("Expected a signed Dreamsign plan");
    }
    const offeredDreamsignId = originalPlan.preparedDreamsignIds[0];
    if (offeredDreamsignId === undefined) throw new Error("Expected an offer");
    const resolveRaw = (journey: JourneyState) =>
      resolveExplorationChoice({
        journey,
        site,
        payload: {
          actionId: offered.id,
          selection: { offeredDreamsignId },
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
        seq: 91,
        content,
      });
    expect(
      resolveRaw({
        ...prepared.journey,
        maxDreamsigns: prepared.journey.maxDreamsigns - 1,
      }),
    ).toBeNull();
    expect(
      resolveRaw({
        ...prepared.journey,
        remainingDreamsignPool:
          prepared.journey.remainingDreamsignPool.slice(1),
      }),
    ).toBeNull();
    expect(
      resolveRaw({
        ...prepared.journey,
        siteRuntime: {
          ...prepared.journey.siteRuntime,
          [site.id]: {
            ...prepared.runtime,
            actionOffers: [
              {
                ...offer,
                dreamsignPreparation: {
                  ...originalPlan,
                  preparedDreamsignIds: [
                    dreamsignId(8),
                    ...originalPlan.preparedDreamsignIds.slice(1),
                  ],
                },
              },
              ...prepared.runtime.actionOffers.slice(1),
            ],
          },
        },
      }),
    ).toBeNull();
  });

  it("mints a random Dreamsign offer and purges a UUID-selected Dreamsign for essence", () => {
    const randomDreamsignAction: ExplorationActionContent = {
      id: testExplorationActionId("random-dreamsign"),
      label: "Read the suspended pattern",
      effectText: "Gain a random dreamsign",
      effectKind: "gain-random-dreamsign",
    };
    const purgeDreamsignAction: ExplorationActionContent = {
      id: testExplorationActionId("purge-dreamsign"),
      label: "Break the suspended pattern",
      effectText: "Purge a chosen dreamsign and gain 50 essence",
      effectKind: "purge-dreamsign-for-essence",
      essence: 50,
    };
    const content = contentFixture([
      randomDreamsignAction,
      purgeDreamsignAction,
    ]);
    const randomState = buildState(content, {
      ...journeyFixture(content),
      remainingDreamsignPool: [testDreamsignId(CHARM_POUCH_ID)],
    });
    expect(randomState.runtime.actionOffers[0]?.offeredDreamsignIds).toEqual([
      CHARM_POUCH_ID,
    ]);
    const gained = resolve(
      content,
      randomState.journey,
      randomDreamsignAction.id,
    );
    expect(gained.dreamsigns.map((dreamsign) => dreamsign.id)).toContain(
      CHARM_POUCH_ID,
    );
    expect(gained.remainingDreamsignPool).not.toContain(CHARM_POUCH_ID);

    const alternateDreamsignId = "3D4EB3EE-0931-45ED-8365-69F18096EAD5";
    const purgeContent = {
      ...content,
      dreamsignTemplates: [
        ...content.dreamsignTemplates,
        {
          id: testDreamsignId(alternateDreamsignId),
          name: "Alternate Sign",
          effectDescription: "Another fixture effect.",
        },
      ],
    };
    const purgeState = buildState(purgeContent, {
      ...journeyFixture(content),
      dreamsigns: [
        {
          id: testDreamsignId(CHARM_POUCH_ID),
          name: "Charm Pouch",
          effectDescription: "A fixture effect.",
        },
      ],
      remainingDreamsignPool: [testDreamsignId(alternateDreamsignId)],
    });
    const purged = resolve(
      purgeContent,
      purgeState.journey,
      purgeDreamsignAction.id,
      {
        dreamsignId: testDreamsignId(CHARM_POUCH_ID),
      },
    );
    expect(purged.dreamsigns).toEqual([]);
    expect(purged.essence).toBe(150);
    expect(purged.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        purgedDreamsignIds: [CHARM_POUCH_ID],
        essenceGained: 50,
      },
    });
  });

  it("makes the deck fast and applies cost reduction before adding Nightmare cards", () => {
    const fastAction: ExplorationActionContent = {
      id: testExplorationActionId("make-fast"),
      label: "Accept the charge",
      effectText: "All cards in your deck become fast",
      effectKind: "make-fast-all",
    };
    const costAction: ExplorationActionContent = {
      id: testExplorationActionId("reduce-and-nightmares"),
      label: "Overload the aperture",
      effectText: "Reduce all costs and gain three Nightmare cards",
      effectKind: "reduce-cost-all-and-gain-nightmares",
      energyCostReduction: 1,
      nightmareCount: 3,
    };
    const content = contentFixture([fastAction, costAction]);
    const fastState = buildState(content);
    const fast = resolve(content, fastState.journey, fastAction.id);
    expect(
      fast.deck.every((entry) => entry.keywordModification?.fast === true),
    ).toBe(true);

    const costState = buildState(content);
    const originalEntryIds = new Set(
      costState.journey.deck.map((entry) => entry.entryId),
    );
    const reduced = resolve(content, costState.journey, costAction.id);
    expect(reduced.deck).toHaveLength(costState.journey.deck.length + 3);
    for (const entry of reduced.deck) {
      const base = content.cardDatabase.get(entry.cardNumber);
      if (base === undefined) throw new Error("Expected a catalog card");
      if (originalEntryIds.has(entry.entryId)) {
        expect(entry.keywordModification?.energyCostReduction).toBe(1);
        expect(
          resolveDeckEntryCard(
            CONFIG_DATA_FIXTURE.transfigurationData,
            base,
            entry,
          ).energyCost,
        ).toBe(
          base.energyCost === null ? null : Math.max(0, base.energyCost - 1),
        );
      } else {
        expect(base.id).toBe(NIGHTMARE_ID);
        expect(entry.isBane).toBe(true);
        expect(entry.keywordModification?.energyCostReduction).toBeUndefined();
      }
    }
  });

  it("mints deck-entry offers and persists exact duplicated entry UUIDs", () => {
    const selectedCopy: ExplorationActionContent = {
      id: testExplorationActionId("copy-selected"),
      label: "Copy a selected card",
      effectText: "Gain 2 copies of {deck_card}",
      effectKind: "copy-selected-card",
      deckTarget: "offered",
      predicate: "cheap-character",
      count: 2,
    };
    const offeredCopy: ExplorationActionContent = {
      id: testExplorationActionId("copy-offered"),
      label: "Copy an offered card",
      effectText: "Choose one of four deck cards to copy",
      effectKind: "copy-offered-deck-card",
      offerCount: 4,
    };
    const content = contentFixture([selectedCopy, offeredCopy]);
    const selectedState = buildState(content);
    const selectedEntryId =
      selectedState.runtime.actionOffers[0]?.offeredDeckEntryIds?.[0];
    if (selectedEntryId === undefined)
      throw new Error("Expected a selected card");
    const copied = resolve(content, selectedState.journey, selectedCopy.id, {
      entryIds: [selectedEntryId],
    });
    const copiedRuntime = copied.siteRuntime[site.id];
    expect(copied.deck).toHaveLength(selectedState.journey.deck.length + 2);
    expect(copiedRuntime).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: [selectedEntryId] },
        affectedEntryIds: [selectedEntryId],
        gainedEntryIds: [
          parseDeckEntryId("deck-91-0"),
          parseDeckEntryId("deck-91-1"),
        ],
      },
    });
    expect(
      resolveExplorationChoice({
        journey: selectedState.journey,
        site,
        payload: {
          actionId: selectedCopy.id,
          selection: { entryIds: [parseDeckEntryId("foreign-entry")] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();

    const offeredState = buildState(content);
    const offeredEntryIds =
      offeredState.runtime.actionOffers[1]?.offeredDeckEntryIds ?? [];
    expect(offeredEntryIds).toHaveLength(4);
    const offeredEntryId = offeredEntryIds[0];
    if (offeredEntryId === undefined) throw new Error("Expected a deck offer");
    const offered = resolve(content, offeredState.journey, offeredCopy.id, {
      entryIds: [offeredEntryId],
    });
    expect(offered.deck).toHaveLength(offeredState.journey.deck.length + 1);
    expect(
      resolveExplorationChoice({
        journey: offeredState.journey,
        site,
        payload: {
          actionId: offeredCopy.id,
          selection: { entryIds: [parseDeckEntryId("foreign-entry")] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("copies each of two UUID-selected deck entries atomically", () => {
    const copyTwo: ExplorationActionContent = {
      id: testExplorationActionId("copy-two-selected"),
      label: "Separate the fragments",
      effectText: "Gain one copy of each of 2 chosen cards",
      effectKind: "copy-selected-cards",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([copyTwo, fallback]);
    const state = buildState(content);
    const selectedEntryIds = state.journey.deck
      .slice(1, 3)
      .map((entry) => entry.entryId);
    const result = resolve(content, state.journey, copyTwo.id, {
      entryIds: selectedEntryIds,
    });
    const replayed = resolve(content, state.journey, copyTwo.id, {
      entryIds: selectedEntryIds,
    });

    expect(result.deck).toHaveLength(state.journey.deck.length + 2);
    expect(replayed).toEqual(result);
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: selectedEntryIds },
        affectedEntryIds: selectedEntryIds,
        gainedEntryIds: [
          parseDeckEntryId("deck-91-0"),
          parseDeckEntryId("deck-91-1"),
        ],
      },
    });
    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: copyTwo.id,
          selection: {
            entryIds: [selectedEntryIds[0], parseDeckEntryId("foreign-entry")],
          },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: copyTwo.id,
          selection: { entryIds: [selectedEntryIds[0], selectedEntryIds[0]] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("persists the exact modified card purged for its spark value", () => {
    const purgeForEssence: ExplorationActionContent = {
      id: testExplorationActionId("purge-for-essence"),
      label: "Yield",
      effectText: "Purge a chosen card and gain 20 essence for each ✦ it had",
      effectKind: "purge-for-essence",
      essencePerSpark: 20,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([purgeForEssence, fallback]);
    const journey = journeyFixture(content);
    const target = journey.deck[1];
    if (target === undefined)
      throw new Error("Expected a Character deck entry");
    const modifiedTarget = { ...target, sparkBonus: 3 };
    const state = buildState(content, {
      ...journey,
      deck: journey.deck.map((entry) =>
        entry.entryId === target.entryId ? modifiedTarget : entry,
      ),
    });
    const result = resolve(content, state.journey, purgeForEssence.id, {
      entryIds: [target.entryId],
    });

    expect(result.essence).toBe(state.journey.essence + 100);
    expect(result.deck.some((entry) => entry.entryId === target.entryId)).toBe(
      false,
    );
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: [target.entryId] },
        purgedEntryIds: [target.entryId],
        purgedEntrySnapshots: [modifiedTarget],
        essenceGained: 100,
      },
    });
  });

  it("persists the purge snapshot, copied source, and minted copy entry for purge-and-copy", () => {
    const purgeAndCopy: ExplorationActionContent = {
      id: testExplorationActionId("purge-and-copy"),
      label: "Exchange",
      effectText: "Purge a chosen card and gain a copy of another chosen card",
      effectKind: "purge-and-copy",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([purgeAndCopy, fallback]);
    const state = buildState(content);
    const purged = state.journey.deck[0];
    const copied = state.journey.deck[1];
    if (purged === undefined || copied === undefined) {
      throw new Error("Expected purge-and-copy deck entries");
    }
    const copiedCardId = content.cardDatabase.get(copied.cardNumber)?.id;
    if (copiedCardId === undefined)
      throw new Error("Expected copied card UUID");
    const copiesBefore = state.journey.deck.filter(
      (entry) => entry.cardNumber === copied.cardNumber,
    ).length;

    const result = resolve(content, state.journey, purgeAndCopy.id, {
      purgeEntryId: purged.entryId,
      copyEntryId: copied.entryId,
    });

    expect(result.deck.some((entry) => entry.entryId === purged.entryId)).toBe(
      false,
    );
    expect(
      result.deck.filter((entry) => entry.cardNumber === copied.cardNumber),
    ).toHaveLength(copiesBefore + 1);
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: {
          purgeEntryId: purged.entryId,
          copyEntryId: copied.entryId,
        },
        purgedEntryIds: [purged.entryId],
        purgedEntrySnapshots: [purged],
        gainedCardIds: [copiedCardId],
        gainedEntryIds: [parseDeckEntryId("deck-91-0")],
        affectedEntryIds: [copied.entryId],
      },
    });
  });

  it("mints a non-matching subtype target and rejects another eligible card", () => {
    const subtypeAction: ExplorationActionContent = {
      id: testExplorationActionId("become-survivor"),
      label: "Fit a matching hood",
      effectText: "Change {deck_card} to become a Survivor",
      effectKind: "change-subtype-selected",
      deckTarget: "offered",
      predicate: "cheap-character",
      subtype: "Survivor",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([subtypeAction, fallback]);
    const source = content.cardDatabase.get(1);
    const survivor = content.cardDatabase.get(110);
    const warrior = content.cardDatabase.get(120);
    if (
      source === undefined ||
      survivor === undefined ||
      warrior === undefined
    ) {
      throw new Error("Expected subtype fixtures");
    }
    const journey = {
      ...journeyFixture(content),
      deck: [
        {
          entryId: parseDeckEntryId("source-entry"),
          cardNumber: source.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("survivor-entry"),
          cardNumber: survivor.cardNumber,
          transfiguration: null,
          isBane: false,
        },
        {
          entryId: parseDeckEntryId("warrior-entry"),
          cardNumber: warrior.cardNumber,
          transfiguration: null,
          isBane: false,
        },
      ],
    };
    const state = buildState(content, journey);

    expect(state.runtime.actionOffers[0]?.offeredDeckEntryIds).toEqual([
      "warrior-entry",
    ]);
    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: subtypeAction.id,
          selection: { entryIds: [parseDeckEntryId("survivor-entry")] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();

    const changed = resolve(content, state.journey, subtypeAction.id, {
      entryIds: [parseDeckEntryId("warrior-entry")],
    });
    const changedEntry = changed.deck.find(
      (entry) => entry.entryId === "warrior-entry",
    );
    if (changedEntry === undefined) throw new Error("Expected changed entry");
    expect(
      resolveDeckEntryCard(
        CONFIG_DATA_FIXTURE.transfigurationData,
        warrior,
        changedEntry,
      ).subtype,
    ).toBe("Survivor");
    expect(changed.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: [parseDeckEntryId("warrior-entry")] },
        affectedEntryIds: [parseDeckEntryId("warrior-entry")],
        chosenSubtype: "Survivor",
      },
    });
  });

  it("persists one-battle opening-hand and starting-energy modifiers", () => {
    const openingHand: ExplorationActionContent = {
      id: testExplorationActionId("opening-hand"),
      label: "Draw more",
      effectText: "Draw 2 additional cards at the start of your next battle",
      effectKind: "next-battle-opening-hand",
      count: 2,
    };
    const startingEnergy: ExplorationActionContent = {
      id: testExplorationActionId("starting-energy"),
      label: "Gather energy",
      effectText: "Gain 2 additional energy at the start of your next battle",
      effectKind: "next-battle-starting-energy",
      count: 2,
    };
    const content = contentFixture([openingHand, startingEnergy]);
    const handState = buildState(content);
    const withHand = resolve(content, handState.journey, openingHand.id);
    expect(
      withHand.battleModifiers[withHand.battleModifiers.length - 1],
    ).toEqual({
      kind: "opening_hand_bonus",
      count: 2,
      battlesRemaining: 1,
      source: `exploration:${site.id}:${openingHand.id}`,
    });
    expect(withHand.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        battleModifier: {
          kind: "opening-hand",
          amount: 2,
          battlesRemaining: 1,
        },
      },
    });

    const energyState = buildState(content);
    const withEnergy = resolve(content, energyState.journey, startingEnergy.id);
    expect(
      withEnergy.battleModifiers[withEnergy.battleModifiers.length - 1],
    ).toMatchObject({
      kind: "starting_energy_bonus",
      count: 2,
      battlesRemaining: 1,
    });
  });

  it("persists the compound smaller-hand and cost-discount modifier", () => {
    const compound: ExplorationActionContent = {
      id: testExplorationActionId("smaller-hand-discount"),
      label: "Enter the blue radiance",
      effectText:
        "Draw one fewer card at the start of your next battle. All cards cost 1● less during that battle.",
      effectKind: "next-battle-smaller-hand-and-cost-discount",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([compound, fallback]);
    const state = buildState(content);
    const result = resolve(content, state.journey, compound.id);

    expect(result.battleModifiers[result.battleModifiers.length - 1]).toEqual({
      kind: "smaller_hand_and_cost_discount",
      openingHandDelta: -1,
      energyCostReduction: 1,
      battlesRemaining: 1,
      source: `exploration:${site.id}:${compound.id}`,
    });
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        battleModifier: {
          kind: "smaller-hand-and-cost-discount",
          openingHandDelta: -1,
          energyCostReduction: 1,
          battlesRemaining: 1,
        },
      },
    });
  });

  it("offers a replacement Dream Avatar and atomically purges duplicated UUIDs before granting Reclaim", () => {
    const chooseAvatar: ExplorationActionContent = {
      id: testExplorationActionId("choose-avatar"),
      label: "Choose an avatar",
      effectText: "Pick a new Dream Avatar from 3 choices",
      effectKind: "choose-dream-avatar",
      offerCount: 3,
    };
    const uniqueDeck: ExplorationActionContent = {
      id: testExplorationActionId("unique-deck"),
      label: "Enter alone",
      effectText: "Purge duplicates and grant reclaim",
      effectKind: "purge-duplicates-and-grant-reclaim",
    };
    const baseContent = contentFixture([chooseAvatar, uniqueDeck]);
    const avatarTemplate = baseContent.dreamAvatars[0];
    if (avatarTemplate === undefined)
      throw new Error("Expected a Dream Avatar");
    const content: JourneyContent = {
      ...baseContent,
      dreamAvatars: Array.from({ length: 32 }, (_, index) => ({
        ...avatarTemplate,
        id: testDreamAvatarId(`dream-avatar-${String(index)}`),
        name: `Dream Avatar ${String(index)}`,
      })),
    };
    const initialAvatar = content.dreamAvatars[0];
    if (initialAvatar === undefined) throw new Error("Expected a Dream Avatar");
    const avatarState = buildState(content, {
      ...journeyFixture(content),
      dreamAvatar: {
        id: initialAvatar.id,
        name: initialAvatar.name,
        title: initialAvatar.title,
        renderedText: initialAvatar.renderedText,
        imageNumber: initialAvatar.imageNumber,
        startingEssence: initialAvatar.startingEssence,
      },
    });
    const offeredAvatarIds =
      avatarState.runtime.actionOffers[0]?.offeredDreamAvatarIds ?? [];
    expect(offeredAvatarIds).toHaveLength(3);
    expect(offeredAvatarIds).not.toContain(initialAvatar.id);
    const chosenAvatarId = offeredAvatarIds[0];
    if (chosenAvatarId === undefined)
      throw new Error("Expected an avatar offer");
    const avatarResult = resolve(
      content,
      avatarState.journey,
      chooseAvatar.id,
      {
        dreamAvatarId: chosenAvatarId,
      },
    );
    expect(avatarResult.dreamAvatar?.id).toBe(chosenAvatarId);
    expect(avatarResult.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        previousDreamAvatarId: initialAvatar.id,
        chosenDreamAvatarId: chosenAvatarId,
      },
    });

    const baseJourney = journeyFixture(content);
    const duplicateSource = baseJourney.deck[1];
    const duplicateTarget = baseJourney.deck[2];
    if (duplicateSource === undefined || duplicateTarget === undefined) {
      throw new Error("Expected duplicate fixtures");
    }
    const duplicateJourney = {
      ...baseJourney,
      deck: baseJourney.deck.map((entry) =>
        entry.entryId === duplicateTarget.entryId
          ? { ...entry, cardNumber: duplicateSource.cardNumber }
          : entry,
      ),
    };
    const uniqueState = buildState(content, duplicateJourney);
    const uniqueResult = resolve(content, uniqueState.journey, uniqueDeck.id);
    expect(
      uniqueResult.deck.some(
        (entry) => entry.cardNumber === duplicateSource.cardNumber,
      ),
    ).toBe(false);
    expect(
      uniqueResult.deck.every(
        (entry) => (entry.keywordModification?.setReclaim ?? 0) > 0,
      ),
    ).toBe(true);
    const runtime = uniqueResult.siteRuntime[site.id];
    expect(runtime?.kind).toBe("exploration");
    expect(
      runtime?.kind === "exploration"
        ? runtime.resolution?.purgedEntryIds
        : undefined,
    ).toEqual(
      expect.arrayContaining([
        duplicateSource.entryId,
        duplicateTarget.entryId,
      ]),
    );
  });

  it("persists every generated replacement trace in one action signature", () => {
    const replaceAction: ExplorationActionContent = {
      id: testExplorationActionId("generated-replacement"),
      label: "Change course",
      effectText: "Replace a chosen character",
      effectKind: "replace-selected",
      predicate: "character",
    };
    const otherAction: ExplorationActionContent = {
      id: testExplorationActionId("gain-fixed"),
      label: "Take the relic",
      effectText: "Gain a fixed card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([replaceAction, otherAction]);
    const { runtime } = buildState(content);
    const offer = runtime.actionOffers.find(
      (candidate) => candidate.actionId === replaceAction.id,
    );
    expect(offer?.selectionSignature).toMatch(/^[0-9a-f]{64}$/u);
    expect(offer?.selectionTraces?.length).toBeGreaterThan(0);
    expect(offer?.selectionTraces).toHaveLength(
      Object.keys(offer?.replacementCardIdByEntryId ?? {}).length,
    );
  });

  it("prepares transfigured drafts and disclosed add-site rewards", () => {
    const transfiguredDraft: ExplorationActionContent = {
      id: testExplorationActionId("transfigured-draft"),
      label: "Follow the bright current",
      effectText: "Draft a transfigured Character from 4 choices.",
      effectKind: "transfigured-card-draft",
      predicate: "character",
      offerCount: 4,
    };
    const addSite: ExplorationActionContent = {
      id: testExplorationActionId("add-site"),
      label: "Chart a new path",
      effectText: "Add a disclosed site to the current Dreamscape.",
      effectKind: "add-site",
    };
    const content = contentFixture([transfiguredDraft, addSite]);
    const state = buildState(content);
    const draftOffer = state.runtime.actionOffers[0];
    const siteOffer = state.runtime.actionOffers[1];
    expect(draftOffer?.offeredCardIds).toHaveLength(4);
    expect(Object.keys(draftOffer?.transfigurationByCardId ?? {})).toHaveLength(
      4,
    );
    expect(["Shop", "Purge", "Transfiguration", "Duplication"]).toContain(
      siteOffer?.offeredSiteType,
    );

    const selectedCardId = draftOffer?.offeredCardIds[0];
    if (selectedCardId === undefined)
      throw new Error("Expected a transfigured card offer");
    const resolved = resolve(content, state.journey, transfiguredDraft.id, {
      cardIds: [selectedCardId],
    });
    const resolution = resolved.siteRuntime[site.id];
    const gainedEntryId =
      resolution?.kind === "exploration"
        ? resolution.resolution?.gainedEntryIds?.[0]
        : undefined;
    const gainedEntry = resolved.deck.find(
      (entry) => entry.entryId === gainedEntryId,
    );
    expect(gainedEntry?.transfiguration).toBe(
      draftOffer?.transfigurationByCardId?.[selectedCardId],
    );
  });

  it("persists exact UUID selections for offered copies and any-number card takes", () => {
    const copiesAction: ExplorationActionContent = {
      id: testExplorationActionId("offered-copies"),
      label: "Echo the wingbeats",
      effectText: "Gain 3 copies of $OFFERED_CARD",
      effectKind: "gain-offered-card",
      predicate: "spirit-animal",
      count: 3,
    };
    const takeAction: ExplorationActionContent = {
      id: testExplorationActionId("take-any"),
      label: "Join the flight",
      effectText: "Take any number of Spirit Animal cards from 4 choices",
      effectKind: "take-cards",
      predicate: "spirit-animal",
      offerCount: 4,
    };
    const content = contentFixture([copiesAction, takeAction]);
    const copiesState = buildState(content);
    const offeredCardId =
      copiesState.runtime.actionOffers[0]?.offeredCardIds[0];
    if (offeredCardId === undefined)
      throw new Error("Expected an offered card");
    const copies = resolve(content, copiesState.journey, copiesAction.id, {
      cardIds: [offeredCardId],
    });
    expect(copies.deck).toHaveLength(copiesState.journey.deck.length + 3);
    expect(copies.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { cardIds: [offeredCardId] },
        gainedCardIds: [offeredCardId, offeredCardId, offeredCardId],
        gainedEntryIds: [
          parseDeckEntryId("deck-91-0"),
          parseDeckEntryId("deck-91-1"),
          parseDeckEntryId("deck-91-2"),
        ],
      },
    });

    const takeState = buildState(content);
    const offered = takeState.runtime.actionOffers[1]?.offeredCardIds ?? [];
    expect(offered).toHaveLength(4);
    const selected = [offered[0], offered[2]].filter(
      (cardId): cardId is CardId => cardId !== undefined,
    );
    const taken = resolve(content, takeState.journey, takeAction.id, {
      cardIds: selected,
    });
    expect(taken.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { cardIds: selected },
        gainedCardIds: selected,
      },
    });
    const tookNone = resolve(
      content,
      buildState(content).journey,
      takeAction.id,
      { cardIds: [] },
    );
    expect(tookNone.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: { selection: { cardIds: [] }, gainedCardIds: [] },
    });
    expect(
      resolveExplorationChoice({
        journey: takeState.journey,
        site,
        payload: {
          actionId: takeAction.id,
          selection: { cardIds: ["foreign-card-id"] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("atomically replaces a selected entry with a fixed UUID and transfigures an unrestricted card", () => {
    const replacementCardId = "f0000000-0000-4000-8000-000000000001";
    const replaceAction: ExplorationActionContent = {
      id: testExplorationActionId("fixed-replacement"),
      label: "Feed it, then gaze",
      effectText: "Choose a card to purge and replace it with a fixed card",
      effectKind: "replace-selected-with-card",
      cardId: testCardId(replacementCardId),
    };
    const transfigureAction: ExplorationActionContent = {
      id: testExplorationActionId("fixed-transfiguration"),
      label: "Touch a luminous seam",
      effectText: "Apply Empowered to a chosen card",
      effectKind: "transfigure-fixed-selected",
      transfiguration: "Empowered",
    };
    const content = contentFixture([replaceAction, transfigureAction]);
    const replaceState = buildState(content);
    const target = replaceState.journey.deck[0];
    if (target === undefined) throw new Error("Expected a deck entry");
    const purgedId = content.cardDatabase.get(target.cardNumber)?.id;
    if (purgedId === undefined) throw new Error("Expected a catalog card");
    const replaced = resolve(content, replaceState.journey, replaceAction.id, {
      entryIds: [target.entryId],
    });
    expect(
      replaced.deck.some((entry) => entry.entryId === target.entryId),
    ).toBe(false);
    expect(replaced.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: [target.entryId] },
        purgedCardIds: [purgedId],
        purgedEntryIds: [target.entryId],
        gainedCardIds: [testCardId(replacementCardId)],
        gainedEntryIds: [parseDeckEntryId("deck-91-0")],
      },
    });

    const transfigureState = buildState(content);
    const transfigureTarget = transfigureState.journey.deck[0];
    if (transfigureTarget === undefined)
      throw new Error("Expected a deck entry");
    const transfigured = resolve(
      content,
      transfigureState.journey,
      transfigureAction.id,
      { entryIds: [transfigureTarget.entryId] },
    );
    expect(
      transfigured.deck.find(
        (entry) => entry.entryId === transfigureTarget.entryId,
      )?.transfiguration,
    ).toBe("Empowered");
    expect(transfigured.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: {
        selection: { entryIds: [transfigureTarget.entryId] },
        affectedEntryIds: [transfigureTarget.entryId],
        chosenTransfiguration: "Empowered",
      },
    });
  });

  it("persists a one-use transfigured Draft-or-Shop modifier", () => {
    const futureAction: ExplorationActionContent = {
      id: testExplorationActionId("transfigure-next-site"),
      label: "Follow its lowered gaze",
      effectText: "The next draft or shop site will contain transfigured cards",
      effectKind: "transfigure-next-draft-or-shop",
    };
    const fallbackAction: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([futureAction, fallbackAction]);
    const state = buildState(content);
    const result = resolve(content, state.journey, futureAction.id);
    const modifier = {
      kind: "transfigure-next-draft-or-shop",
      sourceSiteId: site.id,
      sourceActionId: futureAction.id,
    } as const;
    expect(result.siteOfferModifiers).toEqual([modifier]);
    expect(result.siteRuntime[site.id]).toMatchObject({
      kind: "exploration",
      resolution: { siteOfferModifier: modifier },
    });
  });

  it("keeps versioned resolutions JSON-safe when an action has no selection signature", () => {
    const futureAction: ExplorationActionContent = {
      id: testExplorationActionId("transfigure-next-site"),
      label: "Follow its lowered gaze",
      effectText: "The next draft or shop site will contain transfigured cards",
      effectKind: "transfigure-next-draft-or-shop",
    };
    const fallbackAction: ExplorationActionContent = {
      id: testExplorationActionId("fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([futureAction, fallbackAction]);
    const state = buildState(content);
    const result = resolve(content, state.journey, futureAction.id);
    const runtime = result.siteRuntime[site.id];

    expect(runtime?.kind).toBe("exploration");
    expect(
      runtime?.kind === "exploration" ? runtime.resolution : null,
    ).not.toHaveProperty("selectionSignature");
    expect(() => assertJsonSafe(result, "journey")).not.toThrow();
  });

  it("discloses the prepared named starter purge while concealing the random purge", () => {
    const disclosed: ExplorationActionContent = {
      id: testExplorationActionId("purge-starter-disclosed"),
      label: "Release the first lesson",
      effectText: "Purge {starter_card}",
      effectKind: "purge-starter-card",
    };
    const concealed: ExplorationActionContent = {
      id: testExplorationActionId("purge-starter-random"),
      label: "Let one lesson fade",
      effectText: "Purge a random starter card",
      effectKind: "purge-random-starter-card",
    };
    const content = starterContent([disclosed, concealed]);
    const state = buildState(content, starterJourney(content, 3));
    const disclosedOffer = state.runtime.actionOffers[0];
    const concealedOffer = state.runtime.actionOffers[1];

    expect(disclosedOffer?.starterCardPreparation).toMatchObject({
      kind: "purge-starter-card",
      eligibleStarterCards: [
        { entryId: parseDeckEntryId("starter-entry-1") },
        { entryId: parseDeckEntryId("starter-entry-2") },
        { entryId: parseDeckEntryId("starter-entry-3") },
      ],
    });
    expect(
      disclosedOffer?.starterCardPreparation?.unavailableReason,
    ).toBeUndefined();
    expect(disclosedOffer?.offeredDeckEntryIds).toEqual(
      disclosedOffer?.starterCardPreparation?.purgedEntryIds,
    );
    expect(concealedOffer?.starterCardPreparation).toMatchObject({
      kind: "purge-random-starter-card",
    });
    expect(
      concealedOffer?.starterCardPreparation?.unavailableReason,
    ).toBeUndefined();
    expect(concealedOffer?.offeredDeckEntryIds).toEqual([]);

    const purgedEntryId =
      disclosedOffer?.starterCardPreparation?.purgedEntryIds[0];
    if (purgedEntryId === undefined)
      throw new Error("Expected prepared starter");
    const resolved = resolve(content, state.journey, disclosed.id);
    expect(resolved.deck.some((entry) => entry.entryId === purgedEntryId)).toBe(
      false,
    );
    expect(explorationResolutionFor(resolved)).toMatchObject({
      selection: {},
      purgedEntryIds: [purgedEntryId],
      gainedCardIds: [],
      starterCardReplacements: [],
    });
    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: disclosed.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: { entryIds: [purgedEntryId] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("atomically replaces one prepared starter and rejects tampering, replay, and stale state", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("replace-random-starter"),
      label: "Trade the old lesson",
      effectText: "Purge a random starter card and gain a Warrior",
      effectKind: "purge-random-starter-and-gain-card",
      predicate: "warrior",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback-starter-replacement"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = starterContent([action, fallback]);
    const state = buildState(content, starterJourney(content, 2));
    const preparation = state.runtime.actionOffers[0]?.starterCardPreparation;
    if (preparation === undefined) throw new Error("Expected starter plan");
    expect(preparation.unavailableReason).toBeUndefined();
    expect(state.runtime.actionOffers[0]?.offeredDeckEntryIds).toEqual([]);

    const resolved = resolve(content, state.journey, action.id);
    const resolution = explorationResolutionFor(resolved);
    expect(resolved.deck).toHaveLength(state.journey.deck.length);
    expect(resolution).toMatchObject({
      selection: {},
      purgedEntryIds: preparation.purgedEntryIds,
      purgedCardIds: preparation.purgedCardIds,
      gainedCardIds: Object.values(preparation.replacementCardIdByEntryId),
      gainedEntryIds: [parseDeckEntryId("deck-91-0")],
      resolvedPredicate: "warrior",
      starterCardReplacements: [
        {
          purgedEntryId: preparation.purgedEntryIds[0],
          purgedCardId: preparation.purgedCardIds[0],
          gainedEntryId: parseDeckEntryId("deck-91-0"),
          gainedCardId: Object.values(
            preparation.replacementCardIdByEntryId,
          )[0],
        },
      ],
    });
    expect(
      resolveExplorationChoice({
        journey: resolved,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 92,
        content,
      }),
    ).toBeNull();

    const firstOffer = state.runtime.actionOffers[0];
    if (firstOffer?.starterCardPreparation === undefined) {
      throw new Error("Expected starter preparation");
    }
    const tamperedRuntime = {
      ...state.runtime,
      actionOffers: [
        {
          ...firstOffer,
          starterCardPreparation: {
            ...firstOffer.starterCardPreparation,
            planSignature: stableDigest("tampered-plan"),
          },
        },
        state.runtime.actionOffers[1],
      ],
    };
    const tamperedState = {
      ...state.journey,
      siteRuntime: { [site.id]: tamperedRuntime },
    };
    expect(
      resolveExplorationChoice({
        journey: tamperedState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(tamperedState.deck).toEqual(state.journey.deck);

    const preparedEntryId = firstOffer.starterCardPreparation.purgedEntryIds[0];
    const forgedReplacementId = content.cardDatabase.get(121)?.id;
    if (preparedEntryId === undefined || forgedReplacementId === undefined) {
      throw new Error("Expected replacement-tamper fixtures");
    }
    const forgedReplacementMap = {
      ...firstOffer.starterCardPreparation.replacementCardIdByEntryId,
      [preparedEntryId]: forgedReplacementId,
    };
    const mappingTamperedRuntime = {
      ...state.runtime,
      actionOffers: [
        {
          ...firstOffer,
          replacementCardIdByEntryId: forgedReplacementMap,
          starterCardPreparation: {
            ...firstOffer.starterCardPreparation,
            replacementCardIdByEntryId: forgedReplacementMap,
          },
        },
        state.runtime.actionOffers[1],
      ],
    };
    const mappingTamperedState = {
      ...state.journey,
      siteRuntime: { [site.id]: mappingTamperedRuntime },
    };
    expect(
      resolveExplorationChoice({
        journey: mappingTamperedState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(mappingTamperedState.deck).toEqual(state.journey.deck);

    const staleEntryId = preparation.purgedEntryIds[0];
    const ordinary = content.cardDatabase.get(120);
    if (staleEntryId === undefined || ordinary === undefined) {
      throw new Error("Expected stale-state fixtures");
    }
    const staleState = {
      ...state.journey,
      deck: state.journey.deck.map((entry) =>
        entry.entryId === staleEntryId
          ? { ...entry, cardNumber: ordinary.cardNumber }
          : entry,
      ),
    };
    expect(
      resolveExplorationChoice({
        journey: staleState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(staleState.deck).toHaveLength(state.journey.deck.length);
  });

  it("replaces every sorted starter with an exact distinct persisted bundle", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("replace-all-starters"),
      label: "Graduate the old guard",
      effectText: "Replace all starter cards with Warriors",
      effectKind: "replace-all-starter-cards",
      predicate: "warrior",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback-all-starters"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = starterContent([action, fallback]);
    const state = buildState(content, starterJourney(content, 4));
    const preparation = state.runtime.actionOffers[0]?.starterCardPreparation;
    if (preparation === undefined) throw new Error("Expected starter plan");
    expect(preparation.purgedEntryIds).toEqual([
      "starter-entry-1",
      "starter-entry-2",
      "starter-entry-3",
      "starter-entry-4",
    ]);
    expect(
      new Set(Object.values(preparation.replacementCardIdByEntryId)),
    ).toHaveProperty("size", 4);

    const resolved = resolve(content, state.journey, action.id);
    const resolution = explorationResolutionFor(resolved);
    expect(resolved.deck).toHaveLength(4);
    expect(
      resolved.deck.some((entry) =>
        preparation.purgedEntryIds.includes(entry.entryId),
      ),
    ).toBe(false);
    expect(resolution.gainedEntryIds).toEqual([
      "deck-91-0",
      "deck-91-1",
      "deck-91-2",
      "deck-91-3",
    ]);
    expect(resolution.starterCardReplacements).toHaveLength(4);
    expect(resolution.starterCardReplacements).toEqual(
      preparation.purgedEntryIds.map((purgedEntryId, index) => ({
        purgedEntryId,
        purgedCardId: preparation.purgedCardIds[index],
        gainedEntryId: parseDeckEntryId(`deck-91-${String(index)}`),
        gainedCardId: preparation.replacementCardIdByEntryId[purgedEntryId],
      })),
    );
  });

  it("keeps unavailable starter plans signed without discarding the encounter", () => {
    const purgeAction: ExplorationActionContent = {
      id: testExplorationActionId("unavailable-starter-purge"),
      label: "Release a lesson",
      effectText: "Purge a starter card",
      effectKind: "purge-random-starter-card",
    };
    const replaceAction: ExplorationActionContent = {
      id: testExplorationActionId("unavailable-starter-bundle"),
      label: "Graduate the old guard",
      effectText: "Replace all starter cards with Warriors",
      effectKind: "replace-all-starter-cards",
      predicate: "warrior",
    };
    const noStarterContent = contentFixture([purgeAction, replaceAction]);
    const noStarter = buildState(noStarterContent);
    expect(noStarter.runtime.actionOffers).toHaveLength(2);
    expect(
      noStarter.runtime.actionOffers[0]?.starterCardPreparation,
    ).toMatchObject({
      unavailableReason: "requires-starter-card",
      purgedEntryIds: [],
    });
    expect(
      resolveExplorationChoice({
        journey: noStarter.journey,
        site,
        payload: {
          actionId: purgeAction.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content: noStarterContent,
      }),
    ).toBeNull();

    const limitedContent = starterContent([replaceAction, purgeAction]);
    const packageJourney = withDreamsignPool(limitedContent);
    const limitedJourney = {
      ...starterJourney(limitedContent, 2),
      resolvedPackage: {
        ...(packageJourney.resolvedPackage as NonNullable<
          JourneyState["resolvedPackage"]
        >),
        draftPoolCopiesByCard: { "120": 1 },
      },
    };
    const limited = buildState(limitedContent, limitedJourney);
    expect(limited.runtime.actionOffers).toHaveLength(2);
    expect(
      limited.runtime.actionOffers[0]?.starterCardPreparation,
    ).toMatchObject({
      unavailableReason: "insufficient-replacement-cards",
      purgedEntryIds: [
        parseDeckEntryId("starter-entry-1"),
        parseDeckEntryId("starter-entry-2"),
      ],
      replacementCardIdByEntryId: {},
    });
  });

  it("prepares concealed random starter transfigurations and persists their exact ordered forms", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("transfigure-random-starters"),
      label: "Rewrite two lessons",
      effectText: "Transfigure 2 random starter cards",
      effectKind: "transfigure-random-starter-cards",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback-random-starter-transfiguration"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = starterContent([action, fallback]);
    const state = buildState(content, starterJourney(content, 4));
    const offer = state.runtime.actionOffers[0];
    const preparation = offer?.starterCardTransfigurationPreparation;
    if (offer === undefined || preparation === undefined) {
      throw new Error("Expected starter transfiguration plan");
    }

    expect(preparation).toMatchObject({
      kind: "random-count",
      starterCards: [
        { entryId: parseDeckEntryId("starter-entry-1") },
        { entryId: parseDeckEntryId("starter-entry-2") },
        { entryId: parseDeckEntryId("starter-entry-3") },
        { entryId: parseDeckEntryId("starter-entry-4") },
      ],
    });
    expect(preparation.unavailableReason).toBeUndefined();
    expect(preparation.targets).toHaveLength(2);
    expect(offer).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "uniform",
      selectionKey: action.id,
      selectionSignature: preparation.planSignature,
      offeredDeckEntryIds: [],
    });
    expect(offer.transfigurationByEntryId).toEqual(
      Object.fromEntries(
        preparation.targets.map((target) => [
          target.entryId,
          target.transfiguration,
        ]),
      ),
    );

    const resolved = resolve(content, state.journey, action.id);
    const resolution = explorationResolutionFor(resolved);
    expect(resolution.selection).toEqual({});
    expect(resolution.starterCardTransfigurations).toEqual(
      preparation.targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      })),
    );
    expect(resolution.affectedEntryIds).toEqual(
      preparation.targets.map(({ entryId }) => entryId),
    );
    for (const target of preparation.targets) {
      expect(
        resolved.deck.find((entry) => entry.entryId === target.entryId)
          ?.transfiguration,
      ).toBe(target.transfiguration);
    }
    expect(() => assertJsonSafe(resolved, "journey")).not.toThrow();

    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {
            entryIds: preparation.targets.map(({ entryId }) => entryId),
          },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("replays starter transfigurations as one deterministic event-log fold", async () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("fold-starter-transfigurations"),
      label: "Rewrite two lessons",
      effectText: "Transfigure 2 random starter cards",
      effectKind: "transfigure-random-starter-cards",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback-fold-starter-transfigurations"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = starterContent([action, fallback]);
    const prepared = buildState(content, starterJourney(content, 4));
    const targets =
      prepared.runtime.actionOffers[0]?.starterCardTransfigurationPreparation
        ?.targets;
    if (targets === undefined) {
      throw new Error("Expected fold starter transfiguration targets");
    }

    const drafts: EventDraft[] = [];
    const actions = makeActions((draft) => {
      drafts.push(draft);
      return Promise.resolve(drafts.length);
    });
    await actions.resolveExplorationChoice(site.id, action.id);
    const draft = drafts[0];
    if (draft === undefined) throw new Error("Expected a coop intent");
    const genesis: Genesis = {
      seed: testJourneySeed("starter-transfiguration-fold"),
      reducerVersion: "test",
      createdAt: 0,
      contentConfig: { poolVariant: "tides4" },
    };
    const event: GameEvent = {
      type: draft.type,
      payload: draft.payload,
      actor: testEventActor("client-a"),
      clientTimestamp: "1970-01-01T00:00:00.000Z",
      basedOnSeq: 0,
      ...(draft.intentKey === undefined ? {} : { intentKey: draft.intentKey }),
    };
    const duplicate: GameEvent = {
      ...event,
      clientTimestamp: "1970-01-01T00:00:01.000Z",
      basedOnSeq: 1,
    };
    const base = {
      seq: 0,
      state: {
        ...GAME_ENGINE_CONFIG.genesisState(genesis),
        journey: explorationFoldJourney(prepared.journey),
      },
    };

    registerSiteContentProvider(createSiteContentProvider(content));
    try {
      const first = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [{ seq: 1, event }],
        { devMode: true },
      );
      const replay = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [{ seq: 1, event }],
        { devMode: true },
      );
      const duplicateFold = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [
          { seq: 1, event },
          { seq: 2, event: duplicate },
        ],
        { devMode: true },
      );

      expect(first.outcomes[0]?.outcome).toBe("applied");
      expect(replay.state).toEqual(first.state);
      expect(duplicateFold.outcomes.map(({ outcome }) => outcome)).toEqual([
        "applied",
        "bounced",
      ]);
      expect(first.state.journey.siteRuntime[site.id]).toMatchObject({
        kind: "exploration",
        resolution: {
          selection: {},
          affectedEntryIds: targets.map(({ entryId }) => entryId),
          starterCardTransfigurations: targets.map((target) => ({
            entryId: target.entryId,
            cardId: target.cardId,
            beforeTransfiguration: null,
            afterTransfiguration: target.transfiguration,
          })),
        },
      });
    } finally {
      registerSiteContentProvider(null);
    }
  });

  it("transfigures literally every starter atomically in stable entry order", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("transfigure-all-starters"),
      label: "Rewrite every lesson",
      effectText: "Transfigure all starter cards",
      effectKind: "transfigure-all-starter-cards",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback-all-starter-transfiguration"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = starterContent([action, fallback]);
    const state = buildState(content, starterJourney(content, 3));
    const preparation =
      state.runtime.actionOffers[0]?.starterCardTransfigurationPreparation;
    if (preparation === undefined) {
      throw new Error("Expected all-starter transfiguration plan");
    }

    expect(preparation.kind).toBe("all");
    expect(preparation.targets.map(({ entryId }) => entryId)).toEqual([
      "starter-entry-1",
      "starter-entry-2",
      "starter-entry-3",
    ]);
    const resolved = resolve(content, state.journey, action.id);
    const resolution = explorationResolutionFor(resolved);
    expect(resolution.starterCardTransfigurations).toEqual(
      preparation.targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      })),
    );
    expect(resolved.deck).toHaveLength(3);
    expect(resolved.deck.every((entry) => entry.transfiguration !== null)).toBe(
      true,
    );
  });

  it("rejects starter transfiguration replay, tampering, stale state, and partial application", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("guarded-starter-transfiguration"),
      label: "Rewrite two lessons",
      effectText: "Transfigure 2 random starter cards",
      effectKind: "transfigure-random-starter-cards",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fallback-guarded-starter-transfiguration"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = starterContent([action, fallback]);
    const state = buildState(content, starterJourney(content, 3));
    const firstOffer = state.runtime.actionOffers[0];
    const preparation = firstOffer?.starterCardTransfigurationPreparation;
    const firstTarget = preparation?.targets[0];
    const lastTarget =
      preparation?.targets[(preparation?.targets.length ?? 0) - 1];
    if (
      firstOffer === undefined ||
      preparation === undefined ||
      firstTarget === undefined ||
      lastTarget === undefined
    ) {
      throw new Error("Expected guarded starter transfiguration targets");
    }

    const tamperedPreparation = {
      ...preparation,
      targets: [
        { ...firstTarget, transfiguration: "Perfected" as const },
        ...preparation.targets.slice(1),
      ],
    };
    const tamperedRuntime = {
      ...state.runtime,
      actionOffers: [
        {
          ...firstOffer,
          starterCardTransfigurationPreparation: tamperedPreparation,
          transfigurationByEntryId: {
            ...firstOffer.transfigurationByEntryId,
            [firstTarget.entryId]: "Perfected" as const,
          },
        },
        state.runtime.actionOffers[1],
      ],
    };
    const tamperedState = {
      ...state.journey,
      siteRuntime: { [site.id]: tamperedRuntime },
    };
    expect(
      resolveExplorationChoice({
        journey: tamperedState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(tamperedState.deck).toEqual(state.journey.deck);

    const staleState = {
      ...state.journey,
      deck: state.journey.deck.map((entry) =>
        entry.entryId === lastTarget.entryId
          ? { ...entry, transfiguration: "Empowered" as const }
          : entry,
      ),
    };
    const staleBefore = staleState.deck.map((entry) => ({ ...entry }));
    expect(
      resolveExplorationChoice({
        journey: staleState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(staleState.deck).toEqual(staleBefore);
    expect(
      staleState.deck.find((entry) => entry.entryId === firstTarget.entryId)
        ?.transfiguration,
    ).toBeNull();

    const resolved = resolve(content, state.journey, action.id);
    expect(
      resolveExplorationChoice({
        journey: resolved,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 92,
        content,
      }),
    ).toBeNull();
  });

  it("keeps signed unavailable starter transfiguration offers alongside their companion action", () => {
    const randomAction: ExplorationActionContent = {
      id: testExplorationActionId("unavailable-random-starter-transfiguration"),
      label: "Rewrite two lessons",
      effectText: "Transfigure 2 random starter cards",
      effectKind: "transfigure-random-starter-cards",
      count: 2,
    };
    const allAction: ExplorationActionContent = {
      id: testExplorationActionId("unavailable-all-starter-transfiguration"),
      label: "Rewrite every lesson",
      effectText: "Transfigure all starter cards",
      effectKind: "transfigure-all-starter-cards",
    };
    const content = starterContent([randomAction, allAction]);
    const insufficient = buildState(content, starterJourney(content, 1));
    expect(insufficient.runtime.actionOffers).toHaveLength(2);
    expect(
      insufficient.runtime.actionOffers[0]
        ?.starterCardTransfigurationPreparation,
    ).toMatchObject({
      unavailableReason: "insufficient-transfigurable-starter-cards",
      targets: [],
    });

    const partiallyTransfigured = starterJourney(content, 2);
    partiallyTransfigured.deck = partiallyTransfigured.deck.map(
      (entry, index) =>
        index === 0
          ? { ...entry, transfiguration: "Empowered" as const }
          : entry,
    );
    const allUnavailable = buildState(content, partiallyTransfigured);
    const allPreparation =
      allUnavailable.runtime.actionOffers[1]
        ?.starterCardTransfigurationPreparation;
    expect(allPreparation).toMatchObject({
      unavailableReason: "all-starter-cards-must-be-transfigurable",
      targets: [],
    });
    expect(allPreparation?.planSignature).not.toHaveLength(0);
    expect(
      resolveExplorationChoice({
        journey: allUnavailable.journey,
        site,
        payload: {
          actionId: allAction.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("preserves the legacy count-one transfiguration payload and runtime", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("single-chosen-transfiguration"),
      label: "Rewrite one thread",
      effectText: "Transfigure a chosen card",
      effectKind: "transfigure-selected",
      count: 1,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("single-chosen-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const journey = journeyFixture(content);
    journey.deck = journey.deck.map((entry, index) =>
      index === 0 ? { ...entry, keywordModification: { reclaim: 2 } } : entry,
    );
    const state = buildState(content, journey);
    const entryId = state.journey.deck[1]?.entryId;
    if (entryId === undefined) throw new Error("Expected chosen entry");

    expect(
      state.runtime.actionOffers[0]?.multiCardTransfigurationPreparation,
    ).toBeUndefined();
    const resolved = resolve(content, state.journey, action.id, {
      entryIds: [entryId],
      transfiguration: "Empowered",
    });
    expect(
      resolved.deck.find((entry) => entry.entryId === entryId)?.transfiguration,
    ).toBe("Empowered");
    expect(explorationResolutionFor(resolved)).toMatchObject({
      affectedEntryIds: [entryId],
      chosenTransfiguration: "Empowered",
    });
  });

  it("signs every eligible chosen form and atomically resolves exact zipped multi-card intent", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("chosen-multi-transfiguration"),
      label: "Rewrite two threads",
      effectText: "Transfigure 2 chosen Characters",
      effectKind: "transfigure-selected",
      predicate: "character",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("chosen-multi-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const state = buildState(content);
    const offer = state.runtime.actionOffers[0];
    const preparation = offer?.multiCardTransfigurationPreparation;
    if (offer === undefined || preparation === undefined) {
      throw new Error("Expected chosen multi-card plan");
    }
    const bindings = preparation.eligibleCards.slice(0, 2);
    const repeatedForm = bindings[0]?.transfigurations.find((form) =>
      bindings[1]?.transfigurations.includes(form),
    );
    if (bindings.length !== 2 || repeatedForm === undefined) {
      throw new Error("Expected two candidates with one shared form");
    }
    const entryIds = bindings.map(({ entryId }) => entryId);
    const transfigurations = [repeatedForm, repeatedForm];

    expect(preparation).toMatchObject({
      mode: "chosen-flexible",
      targets: [],
    });
    expect(preparation.unavailableReason).toBeUndefined();
    expect(offer).toMatchObject({
      canonicalMechanicId: "transfigure-deck-entry",
      selectionPolicyId: "transfiguration-value",
      selectionSignature: preparation.planSignature,
      offeredDeckEntryIds: [],
    });
    const resolved = resolve(content, state.journey, action.id, {
      entryIds,
      transfigurations,
    });
    expect(explorationResolutionFor(resolved)).toMatchObject({
      selection: { entryIds, transfigurations },
      affectedEntryIds: entryIds,
      cardTransfigurations: bindings.map(({ entryId, cardId }) => ({
        entryId,
        cardId,
        beforeTransfiguration: null,
        afterTransfiguration: repeatedForm,
      })),
    });
    expect(
      entryIds.map(
        (entryId) =>
          resolved.deck.find((entry) => entry.entryId === entryId)
            ?.transfiguration,
      ),
    ).toEqual(transfigurations);
    expect(() => assertJsonSafe(resolved, "journey")).not.toThrow();

    for (const invalidSelection of [
      { entryIds: [entryIds[0]], transfigurations: [repeatedForm] },
      {
        entryIds: [entryIds[0], entryIds[0]],
        transfigurations,
      },
      {
        entryIds,
        transfigurations: [repeatedForm],
      },
      {
        entryIds,
        transfigurations: [repeatedForm, "foreign-form"],
      },
      {
        entryIds: [entryIds[0], parseDeckEntryId("foreign-entry-id")],
        transfigurations,
      },
      {
        entryIds,
        transfigurations,
        transfiguration: repeatedForm,
      },
    ]) {
      expect(
        resolveExplorationChoice({
          journey: state.journey,
          site,
          payload: {
            actionId: action.id,
            selectionRulesVersion: SELECTION_RULES_VERSION,
            selection: invalidSelection,
          },
          seq: 91,
          content,
        }),
      ).toBeNull();
    }
    expect(
      state.journey.deck.every((entry) => entry.transfiguration === null),
    ).toBe(true);
  });

  it("replays one multi-card transfiguration event deterministically and bounces its duplicate", async () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("fold-multi-transfiguration"),
      label: "Rewrite two threads",
      effectText: "Transfigure 2 chosen Characters",
      effectKind: "transfigure-selected",
      predicate: "character",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fold-multi-transfiguration-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const prepared = buildState(content);
    const bindings =
      prepared.runtime.actionOffers[0]?.multiCardTransfigurationPreparation
        ?.eligibleCards;
    const selected = bindings?.slice(0, 2);
    const sharedForm = selected?.[0]?.transfigurations.find((form) =>
      selected[1]?.transfigurations.includes(form),
    );
    if (selected?.length !== 2 || sharedForm === undefined) {
      throw new Error("Expected fold candidates");
    }
    const selection = {
      entryIds: selected.map(({ entryId }) => entryId),
      transfigurations: [sharedForm, sharedForm],
    };
    const drafts: EventDraft[] = [];
    const actions = makeActions((draft) => {
      drafts.push(draft);
      return Promise.resolve(drafts.length);
    });
    await actions.resolveExplorationChoice(site.id, action.id, selection);
    const draft = drafts[0];
    if (draft === undefined) throw new Error("Expected a coop intent");
    const genesis: Genesis = {
      seed: testJourneySeed("multi-card-transfiguration-fold"),
      reducerVersion: "test",
      createdAt: 0,
      contentConfig: { poolVariant: "tides4" },
    };
    const event: GameEvent = {
      type: draft.type,
      payload: draft.payload,
      actor: testEventActor("client-a"),
      clientTimestamp: "1970-01-01T00:00:00.000Z",
      basedOnSeq: 0,
      ...(draft.intentKey === undefined ? {} : { intentKey: draft.intentKey }),
    };
    const duplicate: GameEvent = {
      ...event,
      clientTimestamp: "1970-01-01T00:00:01.000Z",
      basedOnSeq: 1,
    };
    const base = {
      seq: 0,
      state: {
        ...GAME_ENGINE_CONFIG.genesisState(genesis),
        journey: explorationFoldJourney(prepared.journey),
      },
    };

    registerSiteContentProvider(createSiteContentProvider(content));
    try {
      const first = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [{ seq: 1, event }],
        { devMode: true },
      );
      const replay = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [{ seq: 1, event }],
        { devMode: true },
      );
      const duplicateFold = foldEvents(
        GAME_ENGINE_CONFIG,
        genesis,
        base,
        [
          { seq: 1, event },
          { seq: 2, event: duplicate },
        ],
        { devMode: true },
      );

      expect(first.outcomes[0]?.outcome).toBe("applied");
      expect(replay.state).toEqual(first.state);
      expect(duplicateFold.outcomes.map(({ outcome }) => outcome)).toEqual([
        "applied",
        "bounced",
      ]);
      expect(first.state.journey.siteRuntime[site.id]).toMatchObject({
        kind: "exploration",
        resolution: {
          selection,
          affectedEntryIds: selection.entryIds,
          cardTransfigurations: selected.map(({ entryId, cardId }) => ({
            entryId,
            cardId,
            beforeTransfiguration: null,
            afterTransfiguration: sharedForm,
          })),
        },
      });
    } finally {
      registerSiteContentProvider(null);
    }
  });

  it("prepares concealed flexible random targets and rejects plan, intent, and stale-state tampering", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("random-multi-transfiguration"),
      label: "Rewrite two wandering threads",
      effectText: "Transfigure 2 random Characters",
      effectKind: "transfigure-random-cards",
      predicate: "character",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("random-multi-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const state = buildState(content);
    const offer = state.runtime.actionOffers[0];
    const preparation = offer?.multiCardTransfigurationPreparation;
    if (offer === undefined || preparation === undefined) {
      throw new Error("Expected random multi-card plan");
    }
    expect(preparation).toMatchObject({
      mode: "random-flexible",
    });
    expect(preparation.unavailableReason).toBeUndefined();
    expect(preparation.targets).toHaveLength(2);
    expect(
      new Set(preparation.targets.map(({ entryId }) => entryId)).size,
    ).toBe(2);
    expect(preparation.selectorTraces).toHaveLength(3);
    expect(offer.offeredDeckEntryIds).toEqual([]);

    const replay = buildState(content);
    expect(
      replay.runtime.actionOffers[0]?.multiCardTransfigurationPreparation,
    ).toEqual(preparation);
    const resolved = resolve(content, state.journey, action.id);
    expect(explorationResolutionFor(resolved)).toMatchObject({
      selection: {},
      affectedEntryIds: preparation.targets.map(({ entryId }) => entryId),
      cardTransfigurations: preparation.targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      })),
    });

    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {
            entryIds: preparation.targets.map(({ entryId }) => entryId),
          },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();

    const tamperedOffer = {
      ...offer,
      multiCardTransfigurationPreparation: {
        ...preparation,
        planSignature: stableDigest("tampered-plan"),
      },
    };
    const tamperedState = {
      ...state.journey,
      siteRuntime: {
        [site.id]: {
          ...state.runtime,
          actionOffers: [tamperedOffer, state.runtime.actionOffers[1]],
        },
      },
    };
    expect(
      resolveExplorationChoice({
        journey: tamperedState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();

    const staleEntryId = preparation.targets[1]?.entryId;
    if (staleEntryId === undefined) throw new Error("Expected second target");
    const staleState = {
      ...state.journey,
      deck: state.journey.deck.map((entry) =>
        entry.entryId === staleEntryId
          ? { ...entry, transfiguration: "Empowered" as const }
          : entry,
      ),
    };
    expect(
      resolveExplorationChoice({
        journey: staleState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(
      staleState.deck.find(
        (entry) => entry.entryId === preparation.targets[0]?.entryId,
      )?.transfiguration,
    ).toBeNull();
  });

  it("prepares exact fixed-form random targets and keeps insufficient plans signed", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("fixed-random-multi-transfiguration"),
      label: "Empower two wandering threads",
      effectText: "Apply Empowered to 2 random Characters",
      effectKind: "transfigure-fixed-random-cards",
      predicate: "character",
      count: 2,
      transfiguration: "Empowered",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fixed-random-multi-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const state = buildState(content);
    const preparation =
      state.runtime.actionOffers[0]?.multiCardTransfigurationPreparation;
    if (preparation === undefined) {
      throw new Error("Expected fixed random multi-card plan");
    }
    expect(preparation.mode).toBe("random-fixed");
    expect(preparation.selectorTraces).toHaveLength(1);
    expect(
      preparation.targets.every(
        ({ transfiguration }) => transfiguration === "Empowered",
      ),
    ).toBe(true);
    const resolved = resolve(content, state.journey, action.id);
    expect(explorationResolutionFor(resolved).cardTransfigurations).toEqual(
      preparation.targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: "Empowered",
      })),
    );

    const insufficientAction: ExplorationActionContent = {
      ...action,
      id: testExplorationActionId(
        "insufficient-fixed-random-multi-transfiguration",
      ),
      count: 5,
    };
    const insufficientContent = contentFixture([insufficientAction, fallback]);
    const insufficientJourney = {
      ...journeyFixture(insufficientContent),
      deck: journeyFixture(insufficientContent).deck.slice(0, 4),
    };
    const insufficient = buildState(insufficientContent, insufficientJourney);
    expect(
      insufficient.runtime.actionOffers[0]?.multiCardTransfigurationPreparation,
    ).toMatchObject({
      mode: "random-fixed",
      unavailableReason: "insufficient-eligible-cards",
      targets: [],
    });
    expect(
      resolveExplorationChoice({
        journey: insufficient.journey,
        site,
        payload: {
          actionId: insufficientAction.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content: insufficientContent,
      }),
    ).toBeNull();
  });

  it("replaces one or two chosen entries from concealed signed source-bound replacements", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("replace-up-to-two-events"),
      label: "Rewrite up to two events",
      effectText: "Replace up to 2 Events with Events",
      effectKind: "replace-selected",
      predicate: "event",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("replace-up-to-two-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const state = buildState(content);
    const offer = state.runtime.actionOffers[0];
    const preparation = offer?.multiCardReplacementPreparation;
    if (offer === undefined || preparation === undefined) {
      throw new Error("Expected multi-card replacement plan");
    }
    expect(preparation.unavailableReason).toBeUndefined();
    expect(preparation.bindings.length).toBeGreaterThanOrEqual(2);
    expect(offer).toMatchObject({
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "card-fit-quality",
      selectionSignature: preparation.planSignature,
      offeredDeckEntryIds: [],
      replacementCardIdByEntryId: {},
    });
    const chosen = [preparation.bindings[1], preparation.bindings[0]].filter(
      (binding): binding is NonNullable<typeof binding> =>
        binding !== undefined,
    );
    const entryIds = chosen.map(({ sourceEntryId }) => sourceEntryId);
    const resolved = resolve(content, state.journey, action.id, { entryIds });
    const resolution = explorationResolutionFor(resolved);
    expect(resolution.selection).toEqual({ entryIds });
    expect(resolution.purgedEntryIds).toEqual(entryIds);
    expect(
      resolution.purgedEntrySnapshots?.map(({ entryId }) => entryId),
    ).toEqual(entryIds);
    expect(resolution.gainedEntryIds).toEqual(["deck-91-0", "deck-91-1"]);
    expect(resolution.cardReplacements).toEqual(
      chosen.map((binding, index) => ({
        sourceEntryId: binding.sourceEntryId,
        sourceCardId: binding.sourceCardId,
        replacementEntryId: parseDeckEntryId(`deck-91-${String(index)}`),
        replacementCardId: binding.replacementCardId,
      })),
    );
    expect(
      entryIds.every(
        (entryId) => !resolved.deck.some((entry) => entry.entryId === entryId),
      ),
    ).toBe(true);
    expect(() => assertJsonSafe(resolved, "journey")).not.toThrow();

    const one = resolve(content, buildState(content).journey, action.id, {
      entryIds: [preparation.bindings[0]?.sourceEntryId],
    });
    expect(explorationResolutionFor(one).cardReplacements).toHaveLength(1);
    for (const invalidSelection of [
      { entryIds: [] },
      { entryIds: [entryIds[0], entryIds[0]] },
      { entryIds: [...entryIds, preparation.bindings[2]?.sourceEntryId] },
      { entryIds: [parseDeckEntryId("foreign-entry-id")] },
      { entryIds, cardIds: [] },
    ]) {
      expect(
        resolveExplorationChoice({
          journey: state.journey,
          site,
          payload: {
            actionId: action.id,
            selectionRulesVersion: SELECTION_RULES_VERSION,
            selection: invalidSelection,
          },
          seq: 91,
          content,
        }),
      ).toBeNull();
    }
    expect(state.journey.deck).toHaveLength(8);
  });

  it("rejects tampered and stale chosen replacement plans without partial mutation", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("guarded-multi-replacement"),
      label: "Rewrite up to two events",
      effectText: "Replace up to 2 Events with Events",
      effectKind: "replace-selected",
      predicate: "event",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("guarded-multi-replacement-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const state = buildState(content);
    const offer = state.runtime.actionOffers[0];
    const preparation = offer?.multiCardReplacementPreparation;
    if (offer === undefined || preparation === undefined) {
      throw new Error("Expected guarded replacement plan");
    }
    const entryIds = preparation.bindings
      .slice(0, 2)
      .map(({ sourceEntryId }) => sourceEntryId);
    const tamperedState = {
      ...state.journey,
      siteRuntime: {
        [site.id]: {
          ...state.runtime,
          actionOffers: [
            {
              ...offer,
              multiCardReplacementPreparation: {
                ...preparation,
                bindings: preparation.bindings.map((binding, index) =>
                  index === 1
                    ? { ...binding, replacementCardId: SOURCE_CARD_ID }
                    : binding,
                ),
              },
            },
            state.runtime.actionOffers[1],
          ],
        },
      },
    };
    expect(
      resolveExplorationChoice({
        journey: tamperedState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: { entryIds },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();

    const staleEntryId = entryIds[1];
    const staleState = {
      ...state.journey,
      deck: state.journey.deck.map((entry) =>
        entry.entryId === staleEntryId ? { ...entry, cardNumber: 130 } : entry,
      ),
    };
    expect(
      resolveExplorationChoice({
        journey: staleState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: { entryIds },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(
      staleState.deck.find((entry) => entry.entryId === entryIds[0]),
    ).toEqual(
      state.journey.deck.find((entry) => entry.entryId === entryIds[0]),
    );
  });

  it("applies one fixed form to an exact signed multi-card chosen selection", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("fixed-chosen-multi-transfiguration"),
      label: "Empower two characters",
      effectText: "Apply Empowered to 2 chosen Characters",
      effectKind: "transfigure-fixed-selected",
      predicate: "character",
      count: 2,
      transfiguration: "Empowered",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("fixed-chosen-multi-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const state = buildState(content);
    const preparation =
      state.runtime.actionOffers[0]?.multiCardTransfigurationPreparation;
    if (preparation === undefined) {
      throw new Error("Expected chosen fixed transfiguration plan");
    }
    expect(preparation.mode).toBe("chosen-fixed");
    expect(preparation.targets).toEqual([]);
    expect(
      preparation.eligibleCards.every(
        ({ transfigurations }) =>
          transfigurations.length === 1 && transfigurations[0] === "Empowered",
      ),
    ).toBe(true);
    const entryIds = preparation.eligibleCards
      .slice(0, 2)
      .map(({ entryId }) => entryId);
    const resolved = resolve(content, state.journey, action.id, { entryIds });
    expect(explorationResolutionFor(resolved)).toMatchObject({
      selection: { entryIds },
      affectedEntryIds: entryIds,
      cardTransfigurations: preparation.eligibleCards
        .slice(0, 2)
        .map(({ entryId, cardId }) => ({
          entryId,
          cardId,
          beforeTransfiguration: null,
          afterTransfiguration: "Empowered",
        })),
    });
    expect(
      entryIds.map(
        (entryId) =>
          resolved.deck.find((entry) => entry.entryId === entryId)
            ?.transfiguration,
      ),
    ).toEqual(["Empowered", "Empowered"]);
    for (const invalidSelection of [
      { entryIds: [entryIds[0]] },
      { entryIds: [entryIds[0], entryIds[0]] },
      { entryIds, transfiguration: "Empowered" },
    ]) {
      expect(
        resolveExplorationChoice({
          journey: state.journey,
          site,
          payload: {
            actionId: action.id,
            selectionRulesVersion: SELECTION_RULES_VERSION,
            selection: invalidSelection,
          },
          seq: 91,
          content,
        }),
      ).toBeNull();
    }
  });

  it("copies exact concealed random entries while preserving every source modification", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("copy-two-random-events"),
      label: "Echo two events",
      effectText: "Copy 2 random Events",
      effectKind: "copy-random-cards",
      predicate: "event",
      count: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("copy-two-random-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const journey = {
      ...journeyFixture(content),
      deck: journeyFixture(content).deck.map((entry, index) =>
        index % 2 === 0
          ? {
              ...entry,
              transfiguration: "Empowered" as const,
              keywordModification: { reclaim: index + 1 },
              sparkBonus: index,
            }
          : entry,
      ),
    };
    const state = buildState(content, journey);
    const offer = state.runtime.actionOffers[0];
    const preparation = offer?.randomDeckTargetPreparation;
    if (offer === undefined || preparation === undefined) {
      throw new Error("Expected random copy plan");
    }
    expect(preparation.effectKind).toBe("copy-random-cards");
    expect(preparation.targets).toHaveLength(2);
    expect(offer.offeredDeckEntryIds).toEqual([]);
    const sources = preparation.targets.map((target) => {
      const entry = state.journey.deck.find(
        (candidate) => candidate.entryId === target.entryId,
      );
      if (entry === undefined) throw new Error("Expected copy source");
      return entry;
    });
    const resolved = resolve(content, state.journey, action.id);
    const resolution = explorationResolutionFor(resolved);
    expect(resolution.selection).toEqual({});
    expect(resolution.cardCopies).toEqual(
      preparation.targets.map((target, index) => ({
        sourceEntryId: target.entryId,
        sourceCardId: target.cardId,
        mintedEntryId: parseDeckEntryId(`deck-91-${String(index)}`),
        mintedCardId: target.cardId,
      })),
    );
    expect(
      resolution.gainedEntryIds?.map((entryId) =>
        resolved.deck.find((entry) => entry.entryId === entryId),
      ),
    ).toEqual(
      sources.map((source, index) => ({
        ...source,
        entryId: parseDeckEntryId(`deck-91-${String(index)}`),
      })),
    );
    expect(
      buildState(content, journey).runtime.actionOffers[0]
        ?.randomDeckTargetPreparation,
    ).toEqual(preparation);
    expect(
      resolveExplorationChoice({
        journey: resolved,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 92,
        content,
      }),
    ).toBeNull();
    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {
            entryIds: preparation.targets.map(({ entryId }) => entryId),
          },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();

    const tamperedState = {
      ...state.journey,
      siteRuntime: {
        [site.id]: {
          ...state.runtime,
          actionOffers: [
            {
              ...offer,
              randomDeckTargetPreparation: {
                ...preparation,
                targets: preparation.targets.map((target, index) =>
                  index === 1 ? { ...target, cardId: SOURCE_CARD_ID } : target,
                ),
              },
            },
            state.runtime.actionOffers[1],
          ],
        },
      },
    };
    expect(
      resolveExplorationChoice({
        journey: tamperedState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();

    const staleEntryId = preparation.targets[1]?.entryId;
    if (staleEntryId === undefined) throw new Error("Expected stale target");
    const staleState = {
      ...state.journey,
      deck: state.journey.deck.map((entry) =>
        entry.entryId === staleEntryId ? { ...entry, cardNumber: 130 } : entry,
      ),
    };
    expect(
      resolveExplorationChoice({
        journey: staleState,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    const firstTargetId = preparation.targets[0]?.entryId;
    expect(
      staleState.deck.find((entry) => entry.entryId === firstTargetId),
    ).toEqual(
      state.journey.deck.find((entry) => entry.entryId === firstTargetId),
    );
  });

  it("changes exact random effective non-target types and persists complete before/after overrides", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("change-two-random-types"),
      label: "Make two Characters",
      effectText: "Change 2 random non-Characters into Characters",
      effectKind: "change-random-card-type",
      count: 2,
      cardType: "Character",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("change-two-random-types-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const beforeOverride: CardTypeChange = {
      predicateId: parseCardTypeChangePredicateId("fixture:event"),
      cardType: "Event" as const,
      subtype: "",
      label: "Event",
    };
    const journey = {
      ...journeyFixture(content),
      deck: journeyFixture(content).deck.map((entry, index) =>
        index % 2 === 0 ? { ...entry, typeChange: beforeOverride } : entry,
      ),
    };
    const state = buildState(content, journey);
    const offer = state.runtime.actionOffers[0];
    const preparation = offer?.randomDeckTargetPreparation;
    if (offer === undefined || preparation === undefined) {
      throw new Error("Expected random card-type plan");
    }
    expect(preparation.effectKind).toBe("change-random-card-type");
    expect(preparation.cardType).toBe("Character");
    expect(preparation.targets).toHaveLength(2);
    const resolved = resolve(content, state.journey, action.id);
    const resolution = explorationResolutionFor(resolved);
    expect(resolution.selection).toEqual({});
    expect(resolution.resolvedCardType).toBe("Character");
    expect(resolution.cardTypeChanges).toEqual(
      preparation.targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeCardType: "Event",
        afterCardType: "Character",
        beforeTypeChange: beforeOverride,
        afterTypeChange: {
          predicateId: parseCardTypeChangePredicateId(
            "exploration:card-type:character",
          ),
          cardType: "Character",
          subtype: "",
          label: "Character",
        },
      })),
    );
    for (const target of preparation.targets) {
      const entry = resolved.deck.find(
        (candidate) => candidate.entryId === target.entryId,
      );
      expect(entry?.typeChange).toEqual({
        predicateId: parseCardTypeChangePredicateId(
          "exploration:card-type:character",
        ),
        cardType: "Character",
        subtype: "",
        label: "Character",
      });
      if (entry === undefined)
        throw new Error("resolved target entry is missing");
      const base = content.cardDatabase.get(entry.cardNumber);
      expect(
        base === undefined
          ? undefined
          : resolveDeckEntryCard(content.transfigurationData, base, entry)
              .cardType,
      ).toBe("Character");
    }
    expect(() => assertJsonSafe(resolved, "journey")).not.toThrow();
  });

  it("atomically replaces one signed random target with a clean fixed catalog entry", () => {
    const replacementCardId = testCardId("f0000000-0000-4000-8000-000000000001");
    const action: ExplorationActionContent = {
      id: testExplorationActionId("replace-random-character-with-fixed"),
      label: "Trade one creature",
      effectText: "Replace a random Character with {fixed_card}",
      effectKind: "replace-random-with-card",
      canonicalMechanicId: "replace-deck-entry",
      selectionPolicyId: "uniform",
      predicate: "character",
      cardId: replacementCardId,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("replace-random-character-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const journey = {
      ...journeyFixture(content),
      deck: journeyFixture(content).deck.map((entry) => ({
        ...entry,
        transfiguration: "Empowered" as const,
        typeChange: {
          predicateId: parseCardTypeChangePredicateId("fixture:changed"),
          cardType: "Character" as const,
          subtype: "Warrior",
          label: "Warrior",
        } satisfies CardTypeChange,
        keywordModification: { reclaim: 2 },
        sparkBonus: 3,
      })),
    };
    const state = buildState(content, journey);
    const offer = state.runtime.actionOffers[0];
    const preparation = offer?.randomDeckTargetPreparation;
    const target = preparation?.targets[0];
    if (
      offer === undefined ||
      preparation === undefined ||
      target === undefined
    ) {
      throw new Error("Expected fixed replacement plan");
    }
    expect(preparation).toMatchObject({
      effectKind: "replace-random-with-card",
      count: 1,
      predicate: "character",
      replacementCardId,
    });
    expect(offer.offeredDeckEntryIds).toEqual([]);

    const before = state.journey.deck.find(
      (entry) => entry.entryId === target.entryId,
    );
    const resolved = resolve(content, state.journey, action.id);
    const resolution = explorationResolutionFor(resolved);
    expect(resolution).toMatchObject({
      selection: {},
      affectedEntryIds: [target.entryId],
      purgedEntryIds: [target.entryId],
      purgedCardIds: [target.cardId],
      purgedEntrySnapshots: [before],
      gainedCardIds: [replacementCardId],
      gainedEntryIds: [parseDeckEntryId("deck-91-0")],
      resolvedPredicate: "character",
      cardReplacements: [
        {
          sourceEntryId: target.entryId,
          sourceCardId: target.cardId,
          replacementEntryId: parseDeckEntryId("deck-91-0"),
          replacementCardId,
        },
      ],
    });
    const gainedEntry = resolved.deck.find(
      (entry) => entry.entryId === "deck-91-0",
    );
    expect(gainedEntry).toMatchObject({
      cardNumber: 101,
      transfiguration: null,
    });
    expect(gainedEntry).not.toHaveProperty("typeChange");
    expect(gainedEntry).not.toHaveProperty("keywordModification");
    expect(gainedEntry).not.toHaveProperty("sparkBonus");
    expect(() => assertJsonSafe(resolved, "journey")).not.toThrow();

    const tampered = {
      ...state.journey,
      siteRuntime: {
        [site.id]: {
          ...state.runtime,
          actionOffers: [
            {
              ...offer,
              randomDeckTargetPreparation: {
                ...preparation,
                replacementCardId: SOURCE_CARD_ID,
              },
            },
            state.runtime.actionOffers[1],
          ],
        },
      },
    };
    expect(
      resolveExplorationChoice({
        journey: tampered,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("changes the exact disclosed deck target and rejects forged or extra intent", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("change-disclosed-event-to-character"),
      label: "Rewrite the revealed card",
      effectText: "Change {deck_card} to become a Character",
      effectKind: "change-card-type-selected",
      canonicalMechanicId: "change-entry-card-type",
      selectionPolicyId: "deck-entry-centrality",
      cardType: "Character",
      deckTarget: "offered",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("change-disclosed-type-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const state = buildState(content);
    const offer = state.runtime.actionOffers[0];
    const preparation = offer?.disclosedDeckTargetPreparation;
    const target = preparation?.target;
    if (
      offer === undefined ||
      preparation === undefined ||
      target === null ||
      target === undefined
    ) {
      throw new Error("Expected a disclosed card-type target");
    }
    expect(offer.offeredDeckEntryIds).toEqual([target.entryId]);
    expect(preparation).toMatchObject({
      effectKind: "change-card-type-selected",
      cardType: "Character",
      target,
    });

    const resolved = resolve(content, state.journey, action.id, {
      entryIds: [target.entryId],
    });
    expect(explorationResolutionFor(resolved)).toMatchObject({
      selection: { entryIds: [target.entryId] },
      affectedEntryIds: [target.entryId],
      resolvedCardType: "Character",
      cardTypeChanges: [
        {
          entryId: target.entryId,
          cardId: target.cardId,
          beforeCardType: "Event",
          afterCardType: "Character",
          beforeTypeChange: null,
          afterTypeChange: {
            predicateId: parseCardTypeChangePredicateId(
              "exploration:card-type:character",
            ),
            cardType: "Character",
          },
        },
      ],
    });
    expect(() => assertJsonSafe(resolved, "journey")).not.toThrow();

    for (const selection of [
      {},
      { entryIds: [state.journey.deck[1]?.entryId] },
      { entryIds: [target.entryId], extra: "forged" },
    ]) {
      expect(
        resolveExplorationChoice({
          journey: state.journey,
          site,
          payload: {
            actionId: action.id,
            selectionRulesVersion: SELECTION_RULES_VERSION,
            selection,
          },
          seq: 91,
          content,
        }),
      ).toBeNull();
    }
  });

  it.each([
    "Duplication",
    "Purge",
    "Shop",
    "DreamsignBazaar",
    "Transfiguration",
  ] as const)(
    "prepares and resolves one signed fixed %s insertion",
    (siteType) => {
      const action: ExplorationActionContent = {
        id: testExplorationActionId(`fixed-${siteType}`),
        label: "Open a passage",
        effectText: `Add a ${siteType} site`,
        effectKind: "add-fixed-site",
        canonicalMechanicId: "add-site",
        selectionPolicyId: "fixed",
        siteType,
      };
      const fallback: ExplorationActionContent = {
        id: testExplorationActionId(`fixed-${siteType}-fallback`),
        label: "Gain a card",
        effectText: "Gain a card",
        effectKind: "gain-card",
        cardId: SOURCE_CARD_ID,
      };
      const content = contentFixture([action, fallback]);
      const startingJourney = explorationFoldJourney(journeyFixture(content));
      const first = buildState(content, startingJourney);
      const replayRuntime = buildExplorationRuntime(
        startingJourney,
        site,
        content,
        () => 0.99,
        SOURCE_CARD_ID,
      );
      const legacyRuntime = buildLegacyExplorationRuntime(
        startingJourney,
        site,
        content,
        () => 0.01,
        SOURCE_CARD_ID,
      );
      const offer = first.runtime.actionOffers[0];
      const preparation = offer?.siteInsertionPreparation;
      if (offer === undefined || preparation === undefined) {
        throw new Error("Expected a fixed-site preparation");
      }
      expect(replayRuntime?.actionOffers[0]).toEqual(offer);
      expect(legacyRuntime?.actionOffers[0]?.siteInsertionPreparation).toEqual(
        preparation,
      );
      if (siteType === "Duplication" && legacyRuntime !== null) {
        const legacyResolved = resolveExplorationChoice({
          journey: {
            ...startingJourney,
            siteRuntime: { [site.id]: legacyRuntime },
          },
          site,
          payload: { actionId: action.id },
          seq: 90,
          content,
        });
        expect(
          legacyResolved?.atlas.nodes[parseAtlasNodeId("exploration-node")]
            ?.sites[1],
        ).toEqual(preparation.insertedSite);
        expect(
          legacyResolved === null
            ? undefined
            : explorationResolutionFor(legacyResolved).selectionSignature,
        ).toBe(preparation.planSignature);
      }
      expect(offer).toMatchObject({
        canonicalMechanicId: "add-site",
        selectionPolicyId: "fixed",
        selectionRulesVersion: SELECTION_RULES_VERSION,
        selectionKey: action.id,
        selectionSignature: preparation.planSignature,
        siteInsertionPreparation: {
          sourceSiteId: site.id,
          sourceActionId: action.id,
          targetNodeId: parseAtlasNodeId("exploration-node"),
          insertionIndex: 1,
          siblingSiteIdsBefore: [site.id],
          insertedSite: {
            id: parseSiteId(`site-exploration-${site.id}-${action.id}`),
            type: siteType,
            isEnhanced: false,
            isVisited: false,
          },
        },
      });

      const resolved = resolve(content, first.journey, action.id);
      const inserted =
        resolved.atlas.nodes[parseAtlasNodeId("exploration-node")]?.sites[1];
      expect(inserted).toEqual(preparation.insertedSite);
      expect(explorationResolutionFor(resolved)).toMatchObject({
        selection: {},
        selectionRulesVersion: SELECTION_RULES_VERSION,
        selectionContentRevision: offer.selectionContentRevision,
        selectionSignature: preparation.planSignature,
        siteInsertion: {
          targetNodeId: parseAtlasNodeId("exploration-node"),
          insertionIndex: 1,
          siblingSiteIdsBefore: [site.id],
          insertedSite: preparation.insertedSite,
        },
      });
      expect(() => assertJsonSafe(resolved, "journey")).not.toThrow();

      const route = createSiteContentProvider(content).openSite({
        journey: resolved,
        site: preparation.insertedSite,
        rng: () => 0.25,
      });
      if (siteType === "Purge") {
        expect(route).toBeNull();
      } else {
        expect(route?.runtime.kind).toBe(
          siteType === "Shop" || siteType === "DreamsignBazaar"
            ? "shop"
            : "cardChoice",
        );
      }
      if (route?.runtime.kind === "cardChoice") {
        expect(route.runtime.choiceKind).toBe(
          siteType === "Duplication" ? "duplication" : "transfiguration",
        );
      }
    },
  );

  it("rejects fixed-site plan tampering, stale atlas state, and nonempty intent", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("guarded-fixed-site"),
      label: "Open a passage",
      effectText: "Add a Shop site",
      effectKind: "add-fixed-site",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "fixed",
      siteType: "Shop",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("guarded-fixed-site-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const fresh = () =>
      buildState(content, explorationFoldJourney(journeyFixture(content)));
    const initial = fresh();
    const offer = initial.runtime.actionOffers[0];
    const preparation = offer?.siteInsertionPreparation;
    if (offer === undefined || preparation === undefined) {
      throw new Error("Expected a fixed-site preparation");
    }
    const tamper = (
      mutate: (
        plan: NonNullable<typeof preparation>,
      ) => NonNullable<typeof preparation>,
    ): JourneyState => ({
      ...initial.journey,
      siteRuntime: {
        ...initial.journey.siteRuntime,
        [site.id]: {
          ...initial.runtime,
          actionOffers: [
            {
              ...offer,
              siteInsertionPreparation: mutate(preparation),
            },
            ...initial.runtime.actionOffers.slice(1),
          ],
        },
      },
    });
    expect(offer.offeredSiteType).toBeUndefined();
    expect(offer.selectionTrace).toBeUndefined();
    const tamperedStates = [
      tamper((plan) => ({ ...plan, planSignature: stableDigest("forged") })),
      tamper((plan) => ({ ...plan, targetNodeId: parseAtlasNodeId("forged") })),
      tamper((plan) => ({
        ...plan,
        siblingSiteIdsBefore: [parseSiteId("forged-sibling")],
      })),
      tamper((plan) => ({ ...plan, insertionIndex: 2 })),
      tamper((plan) => ({
        ...plan,
        insertedSite: { ...plan.insertedSite, id: parseSiteId("forged") },
      })),
      tamper((plan) => ({
        ...plan,
        insertedSite: { ...plan.insertedSite, type: "Duplication" },
      })),
    ];
    for (const journey of tamperedStates) {
      expect(
        resolveExplorationChoice({
          journey,
          site,
          payload: {
            actionId: action.id,
            selectionRulesVersion: SELECTION_RULES_VERSION,
          },
          seq: 91,
          content,
        }),
      ).toBeNull();
    }

    const stale = fresh();
    const node = stale.journey.atlas.nodes[parseAtlasNodeId("exploration-node")];
    if (node === undefined) throw new Error("Expected current node");
    node.sites.unshift({
      id: parseSiteId("new-sibling"),
      type: "Essence",
      isEnhanced: false,
      isVisited: false,
    });
    expect(
      resolveExplorationChoice({
        journey: stale.journey,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(
      resolveExplorationChoice({
        journey: fresh().journey,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: { siteType: "Shop" },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("prepares three distinct signed site choices and inserts exactly the selected type", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("choose-site-type"),
      label: "Choose a destination",
      effectText: "Choose one of three sites to add",
      followupTitle: "Choose a site",
      followupSubtitle: "Select one destination",
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("choose-site-type-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const startingJourney = explorationFoldJourney(journeyFixture(content));
    const first = buildState(content, startingJourney);
    const replay = buildExplorationRuntime(
      startingJourney,
      site,
      content,
      () => 0.99,
      SOURCE_CARD_ID,
    );
    const legacy = buildLegacyExplorationRuntime(
      startingJourney,
      site,
      content,
      () => 0.01,
      SOURCE_CARD_ID,
    );
    const offer = first.runtime.actionOffers[0];
    const preparation = offer?.siteTypeChoicePreparation;
    if (offer === undefined || preparation === undefined) {
      throw new Error("Expected a site-type choice preparation");
    }
    expect(replay?.actionOffers[0]).toEqual(offer);
    expect(legacy?.actionOffers[0]).toEqual(offer);
    expect(offer).toMatchObject({
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionKey: action.id,
      selectionSignature: preparation.planSignature,
      siteTypeChoicePreparation: {
        sourceSiteId: site.id,
        sourceActionId: action.id,
        targetNodeId: parseAtlasNodeId("exploration-node"),
        insertionIndex: 1,
        siblingSiteIdsBefore: [site.id],
      },
    });
    expect(offer.selectionTrace).toBeDefined();
    expect(offer.offeredSiteType).toBeUndefined();
    expect(offer.siteInsertionPreparation).toBeUndefined();
    expect(preparation.selectorSignature).not.toBe(preparation.planSignature);
    expect(preparation.choices).toHaveLength(3);
    expect(
      new Set(preparation.choices.map(({ siteType }) => siteType)).size,
    ).toBe(3);
    expect(
      preparation.choices.every(
        ({ siteType }) =>
          siteType === "Shop" ||
          siteType === "Purge" ||
          siteType === "Transfiguration" ||
          siteType === "Duplication",
      ),
    ).toBe(true);
    expect(
      new Set(preparation.choices.map(({ insertedSite }) => insertedSite.id)),
    ).toEqual(new Set([`site-exploration-${site.id}-${action.id}`]));

    const chosen = preparation.choices[1];
    if (chosen === undefined) throw new Error("Expected a prepared choice");
    const resolved = resolve(content, first.journey, action.id, {
      siteType: chosen.siteType,
    });
    expect(
      resolved.atlas.nodes[parseAtlasNodeId("exploration-node")]?.sites[1],
    ).toEqual(chosen.insertedSite);
    expect(explorationResolutionFor(resolved)).toMatchObject({
      selection: { siteType: chosen.siteType },
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selectionContentRevision: offer.selectionContentRevision,
      selectionSignature: preparation.planSignature,
      siteInsertion: {
        targetNodeId: parseAtlasNodeId("exploration-node"),
        insertionIndex: 1,
        siblingSiteIdsBefore: [site.id],
        insertedSite: chosen.insertedSite,
      },
    });
    expect(() => assertJsonSafe(resolved, "journey")).not.toThrow();
  });

  it("rejects forged site-choice plans, selector traces, stale topology, and invalid intents", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("guarded-site-choice"),
      label: "Choose a destination",
      effectText: "Choose one of three sites to add",
      followupTitle: "Choose a site",
      followupSubtitle: "Select one destination",
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("guarded-site-choice-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const fresh = () =>
      buildState(content, explorationFoldJourney(journeyFixture(content)));
    const initial = fresh();
    const offer = initial.runtime.actionOffers[0];
    const preparation = offer?.siteTypeChoicePreparation;
    const selectedType = preparation?.choices[0]?.siteType;
    if (
      offer === undefined ||
      preparation === undefined ||
      selectedType === undefined
    ) {
      throw new Error("Expected a guarded site-type choice preparation");
    }
    const replaceOffer = (
      changed: typeof offer,
      journey = initial.journey,
    ): JourneyState => ({
      ...journey,
      siteRuntime: {
        ...journey.siteRuntime,
        [site.id]: {
          ...initial.runtime,
          actionOffers: [changed, ...initial.runtime.actionOffers.slice(1)],
        },
      },
    });
    const mutatePlan = (
      mutate: (
        plan: NonNullable<typeof preparation>,
      ) => NonNullable<typeof preparation>,
    ): JourneyState =>
      replaceOffer({
        ...offer,
        siteTypeChoicePreparation: mutate(preparation),
      });
    const firstChoice = preparation.choices[0];
    if (firstChoice === undefined) throw new Error("Expected first choice");
    const forgedStates = [
      mutatePlan((plan) => ({ ...plan, planSignature: stableDigest("forged") })),
      mutatePlan((plan) => ({ ...plan, selectorSignature: stableDigest("forged") })),
      mutatePlan((plan) => ({
        ...plan,
        targetNodeId: parseAtlasNodeId("forged"),
      })),
      mutatePlan((plan) => ({ ...plan, insertionIndex: 2 })),
      mutatePlan((plan) => ({
        ...plan,
        siblingSiteIdsBefore: [parseSiteId("forged")],
      })),
      mutatePlan((plan) => ({ ...plan, choices: [...plan.choices].reverse() })),
      mutatePlan((plan) => ({
        ...plan,
        choices: [
          {
            ...firstChoice,
            insertedSite: {
              ...firstChoice.insertedSite,
              id: parseSiteId("forged"),
            },
          },
          ...plan.choices.slice(1),
        ],
      })),
      replaceOffer({ ...offer, selectionSignature: stableDigest("forged") }),
      replaceOffer({
        ...offer,
        selectionTrace: {
          ...offer.selectionTrace!,
          selectedKeys: [...offer.selectionTrace!.selectedKeys].reverse(),
        },
      }),
      replaceOffer({ ...offer, offeredSiteType: selectedType }),
      replaceOffer({
        ...offer,
        siteInsertionPreparation: {
          sourceSiteId: site.id,
          sourceActionId: action.id,
          targetNodeId: parseAtlasNodeId("exploration-node"),
          insertionIndex: 1,
          siblingSiteIdsBefore: [site.id],
          insertedSite: firstChoice.insertedSite,
          planSignature: stableDigest("forged"),
        },
      }),
    ];
    for (const journey of forgedStates) {
      expect(
        resolveExplorationChoice({
          journey,
          site,
          payload: {
            actionId: action.id,
            selectionRulesVersion: SELECTION_RULES_VERSION,
            selection: { siteType: selectedType },
          },
          seq: 92,
          content,
        }),
      ).toBeNull();
    }

    const stale = fresh();
    stale.journey.atlas.nodes[parseAtlasNodeId("exploration-node")]?.sites.push({
      id: parseSiteId("new-sibling"),
      type: "Essence",
      isEnhanced: false,
      isVisited: false,
    });
    const invalidSelections = [
      undefined,
      {},
      { siteType: "DreamsignBazaar" },
      { siteType: selectedType, extra: "forged" },
      { siteType: [selectedType] },
    ];
    for (const selection of invalidSelections) {
      expect(
        resolveExplorationChoice({
          journey: fresh().journey,
          site,
          payload: {
            actionId: action.id,
            selectionRulesVersion: SELECTION_RULES_VERSION,
            ...(selection === undefined ? {} : { selection }),
          },
          seq: 92,
          content,
        }),
      ).toBeNull();
    }
    expect(
      resolveExplorationChoice({
        journey: stale.journey,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: { siteType: selectedType },
        },
        seq: 92,
        content,
      }),
    ).toBeNull();

    const staleContent: JourneyContent = {
      ...content,
      sitesData: {
        ...content.sitesData,
        foldHash: testFoldHash("f"),
      },
    };
    expect(
      resolveExplorationChoice({
        journey: fresh().journey,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: { siteType: selectedType },
        },
        seq: 92,
        content: staleContent,
      }),
    ).toBeNull();
  });

  it("isolates site choices by action key and replays one chosen insertion once", () => {
    const action = (idSeed: string): ExplorationActionContent => ({
      id: testExplorationActionId(idSeed),
      label: "Choose a destination",
      effectText: "Choose one of three sites to add",
      followupTitle: "Choose a site",
      followupSubtitle: "Select one destination",
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
    });
    const firstAction = action("site-choice-one");
    const secondAction = action("site-choice-two");
    const content = contentFixture([firstAction, secondAction]);
    const startingJourney = explorationFoldJourney(journeyFixture(content));
    const opened = buildState(content, startingJourney);
    const firstOffer = opened.runtime.actionOffers[0];
    const secondOffer = opened.runtime.actionOffers[1];
    expect(firstOffer?.selectionTrace?.selectionKey).toBe(firstAction.id);
    expect(secondOffer?.selectionTrace?.selectionKey).toBe(secondAction.id);
    expect(firstOffer?.siteTypeChoicePreparation?.planSignature).not.toBe(
      secondOffer?.siteTypeChoicePreparation?.planSignature,
    );
    const chosen = firstOffer?.siteTypeChoicePreparation?.choices[0];
    if (chosen === undefined) throw new Error("Expected a prepared choice");
    const once = resolve(content, opened.journey, firstAction.id, {
      siteType: chosen.siteType,
    });
    expect(
      resolveExplorationChoice({
        journey: once,
        site,
        payload: {
          actionId: firstAction.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: { siteType: chosen.siteType },
        },
        seq: 93,
        content,
      }),
    ).toBeNull();
    expect(JSON.parse(JSON.stringify(once))).toEqual(once);
    expect(once.atlas.nodes[parseAtlasNodeId("exploration-node")]?.sites).toEqual([
      site,
      chosen.insertedSite,
    ]);
  });

  it("folds a chosen site insertion deterministically and bounces a duplicate intent", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("folded-site-choice"),
      label: "Choose a destination",
      effectText: "Choose one of three sites to add",
      followupTitle: "Choose a site",
      followupSubtitle: "Select one destination",
      effectKind: "choose-site-type",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "site-uniform",
      offerCount: 3,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("folded-site-choice-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const initialJourney = explorationFoldJourney(journeyFixture(content));
    const prepared = buildExplorationRuntime(
      initialJourney,
      site,
      content,
      () => 0.37,
      SOURCE_CARD_ID,
    );
    const chosen =
      prepared?.actionOffers[0]?.siteTypeChoicePreparation?.choices[0];
    if (chosen === undefined) throw new Error("Expected a folded site choice");
    const genesis: Genesis = {
      seed: testJourneySeed("site-choice-fold"),
      reducerVersion: "test",
      createdAt: 0,
      contentConfig: { poolVariant: "tides4" },
    };
    const resolvePayload = {
      siteId: site.id,
      actionId: action.id,
      selectionRulesVersion: SELECTION_RULES_VERSION,
      selection: { siteType: chosen.siteType },
    };
    const events = [
      {
        seq: 1,
        event: {
          type: "OPEN_SITE",
          payload: {
            siteId: site.id,
            selectionRulesVersion: SELECTION_RULES_VERSION,
          },
          actor: testEventActor("client-a"),
          clientTimestamp: "1970-01-01T00:00:00.000Z",
          basedOnSeq: 0,
        },
      },
      {
        seq: 2,
        event: {
          type: "RESOLVE_EXPLORATION_CHOICE",
          payload: resolvePayload,
          actor: testEventActor("client-a"),
          clientTimestamp: "1970-01-01T00:00:01.000Z",
          basedOnSeq: 1,
        },
      },
      {
        seq: 3,
        event: {
          type: "RESOLVE_EXPLORATION_CHOICE",
          payload: resolvePayload,
          actor: testEventActor("client-b"),
          clientTimestamp: "1970-01-01T00:00:02.000Z",
          basedOnSeq: 2,
        },
      },
    ] satisfies Array<{ seq: number; event: GameEvent }>;

    registerSiteContentProvider(createSiteContentProvider(content));
    try {
      const fold = () =>
        foldEvents(
          GAME_ENGINE_CONFIG,
          genesis,
          {
            seq: 0,
            state: {
              ...GAME_ENGINE_CONFIG.genesisState(genesis),
              journey: initialJourney,
            },
          },
          events,
          { devMode: true },
        );
      const first = fold();
      const replay = fold();
      expect(first.outcomes.map(({ outcome }) => outcome)).toEqual([
        "applied",
        "applied",
        "bounced",
      ]);
      expect(replay.state).toEqual(first.state);
      expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state);
      expect(
        first.state.journey.atlas.nodes[parseAtlasNodeId("exploration-node")]
          ?.sites,
      ).toEqual([site, chosen.insertedSite]);
      expect(explorationResolutionFor(first.state.journey).selection).toEqual({
        siteType: chosen.siteType,
      });
    } finally {
      registerSiteContentProvider(null);
    }
  });

  it("folds one fixed-site resolution once and survives JSON save/load", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("replayed-fixed-site"),
      label: "Open a passage",
      effectText: "Add a Duplication site",
      effectKind: "add-fixed-site",
      canonicalMechanicId: "add-site",
      selectionPolicyId: "fixed",
      siteType: "Duplication",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("replayed-fixed-site-fallback"),
      label: "Gain a card",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const genesis: Genesis = {
      seed: testJourneySeed("fixed-site-fold"),
      reducerVersion: "test",
      createdAt: 0,
      contentConfig: { poolVariant: "tides4" },
    };
    const payload = {
      siteId: site.id,
      actionId: action.id,
      selectionRulesVersion: SELECTION_RULES_VERSION,
    };
    const events = [
      {
        seq: 1,
        event: {
          type: "OPEN_SITE",
          payload: {
            siteId: site.id,
            selectionRulesVersion: SELECTION_RULES_VERSION,
          },
          actor: testEventActor("client-a"),
          clientTimestamp: "1970-01-01T00:00:00.000Z",
          basedOnSeq: 0,
        },
      },
      {
        seq: 2,
        event: {
          type: "RESOLVE_EXPLORATION_CHOICE",
          payload,
          actor: testEventActor("client-a"),
          clientTimestamp: "1970-01-01T00:00:01.000Z",
          basedOnSeq: 1,
        },
      },
      {
        seq: 3,
        event: {
          type: "RESOLVE_EXPLORATION_CHOICE",
          payload,
          actor: testEventActor("client-b"),
          clientTimestamp: "1970-01-01T00:00:02.000Z",
          basedOnSeq: 2,
        },
      },
      {
        seq: 4,
        event: {
          type: "COMPLETE_SITE",
          payload: { siteId: site.id },
          actor: testEventActor("client-a"),
          clientTimestamp: "1970-01-01T00:00:03.000Z",
          basedOnSeq: 3,
        },
      },
    ] satisfies Array<{ seq: number; event: GameEvent }>;
    const initialJourney = explorationFoldJourney(journeyFixture(content));

    registerSiteContentProvider(createSiteContentProvider(content));
    try {
      const fold = () =>
        foldEvents(
          GAME_ENGINE_CONFIG,
          genesis,
          {
            seq: 0,
            state: {
              ...GAME_ENGINE_CONFIG.genesisState(genesis),
              journey: initialJourney,
            },
          },
          events,
          { devMode: true },
        );
      const first = fold();
      const replay = fold();
      expect(first.outcomes.map(({ outcome }) => outcome)).toEqual([
        "applied",
        "applied",
        "bounced",
        "applied",
      ]);
      expect(replay.state).toEqual(first.state);
      expect(JSON.parse(JSON.stringify(first.state))).toEqual(first.state);
      const node =
        first.state.journey.atlas.nodes[parseAtlasNodeId("exploration-node")];
      expect(node?.sites.map(({ id }) => id)).toEqual([
        site.id,
        `site-exploration-${site.id}-${action.id}`,
      ]);
      expect(node?.sites[1]).toEqual({
        id: parseSiteId(`site-exploration-${site.id}-${action.id}`),
        type: "Duplication",
        isEnhanced: false,
        isVisited: false,
      });
      expect(node?.sites[0]?.isVisited).toBe(true);
    } finally {
      registerSiteContentProvider(null);
    }
  });

  it("resolves all-card and disclosed same-type compound mutations exactly", () => {
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("wave8-fallback"),
      label: "Take the source",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const allAction: ExplorationActionContent = {
      id: testExplorationActionId("wave8-transfigure-all"),
      label: "Rewrite every current",
      effectText: "Transfigure all cards in your deck",
      effectKind: "transfigure-all-cards",
    };
    const allContent = contentFixture([allAction, fallback]);
    const allState = buildState(allContent);
    const allOffer = allState.runtime.actionOffers[0];
    const allPlan = allOffer?.compoundActionPreparation;
    if (
      allOffer === undefined ||
      allPlan?.kind !== "all-card-transfiguration"
    ) {
      throw new Error("Expected an all-card compound plan");
    }
    const allResolved = resolve(allContent, allState.journey, allAction.id);
    expect(explorationResolutionFor(allResolved).cardTransfigurations).toEqual(
      allPlan.targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      })),
    );
    expect(
      allResolved.deck.every(({ transfiguration }) => transfiguration !== null),
    ).toBe(true);
    const replayed = resolve(
      allContent,
      buildState(allContent).journey,
      allAction.id,
    );
    expect(replayed).toEqual(allResolved);
    expect(JSON.parse(JSON.stringify(allResolved))).toEqual(allResolved);
    expect(
      resolveExplorationChoice({
        journey: allResolved,
        site,
        payload: {
          actionId: allAction.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 92,
        content: allContent,
      }),
    ).toBeNull();

    const tampered = {
      ...allState.journey,
      siteRuntime: {
        [site.id]: {
          ...allState.runtime,
          actionOffers: [
            {
              ...allOffer,
              compoundActionPreparation: {
                ...allPlan,
                targets: allPlan.targets.slice(1),
              },
            },
            allState.runtime.actionOffers[1],
          ],
        },
      },
    };
    expect(
      resolveExplorationChoice({
        journey: tampered,
        site,
        payload: {
          actionId: allAction.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: {},
        },
        seq: 91,
        content: allContent,
      }),
    ).toBeNull();
    expect(
      tampered.deck.every(({ transfiguration }) => transfiguration === null),
    ).toBe(true);

    const purgeAction: ExplorationActionContent = {
      id: testExplorationActionId("wave8-purge-same-type"),
      label: "Cut the dimmest thread",
      effectText: "Purge {deck_card} and Empower every other card of its type",
      effectKind: "purge-disclosed-and-transfigure-same-type",
      transfiguration: "Empowered",
    };
    const purgeBaseContent = contentFixture([purgeAction, fallback]);
    const purgeContent: JourneyContent = {
      ...purgeBaseContent,
      cardDatabase: new Map(
        [...purgeBaseContent.cardDatabase].map(([cardNumber, fixtureCard]) => [
          cardNumber,
          cardNumber === 101
            ? {
                ...fixtureCard,
                isStarter: true,
                roles: ["starter-deck" as const],
                rarity: "Starter" as const,
              }
            : fixtureCard,
        ]),
      ),
    };
    const purgeJourney = journeyFixture(purgeContent);
    purgeJourney.deck = [101, 101, 110, 111, 120, 121, 122, 130].map(
      (cardNumber, index) => ({
        entryId: parseDeckEntryId(`purge-entry-${String(index)}`),
        cardNumber,
        transfiguration: null,
        isBane: false,
      }),
    );
    const purgeState = buildState(purgeContent, purgeJourney);
    const purgePlan =
      purgeState.runtime.actionOffers[0]?.compoundActionPreparation;
    expect(purgePlan?.unavailableReason).toBeUndefined();
    if (
      purgePlan?.kind !== "purge-disclosed-transfigure-same-type" ||
      purgePlan.target === null
    ) {
      throw new Error("Expected a disclosed same-type compound plan");
    }
    const purged = resolve(purgeContent, purgeState.journey, purgeAction.id, {
      entryIds: [purgePlan.target.entryId],
    });
    const purgeResolution = explorationResolutionFor(purged);
    expect(purgeResolution.purgedEntryIds).toEqual([purgePlan.target.entryId]);
    expect(purgeResolution.purgedEntrySnapshots?.[0]?.entryId).toBe(
      purgePlan.target.entryId,
    );
    expect(purgeResolution.cardTransfigurations).toEqual(
      purgePlan.companionTargets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      })),
    );
  });

  it("persists exact fast keyword transitions and minted Nightmares", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("wave8-fast-nightmares"),
      label: "Outrun the dark",
      effectText: "Every Event becomes fast. Gain 2 Nightmares.",
      effectKind: "make-predicate-fast-and-gain-nightmares",
      predicate: "event",
      nightmareCount: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("wave8-fast-nightmares-fallback"),
      label: "Take the source",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const journey = journeyFixture(content);
    journey.deck = journey.deck.map((entry, index) =>
      index === 0 ? { ...entry, keywordModification: { reclaim: 2 } } : entry,
    );
    const state = buildState(content, journey);
    const plan = state.runtime.actionOffers[0]?.compoundActionPreparation;
    if (plan?.kind !== "predicate-fast-nightmares") {
      throw new Error("Expected a fast-and-Nightmare compound plan");
    }
    const resolved = resolve(content, state.journey, action.id);
    const resolution = explorationResolutionFor(resolved);
    expect(resolution.cardKeywordChanges).toEqual(
      plan.targets.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        before:
          state.journey.deck.find(({ entryId }) => entryId === target.entryId)
            ?.keywordModification ?? null,
        after: {
          ...(state.journey.deck.find(
            ({ entryId }) => entryId === target.entryId,
          )?.keywordModification ?? {}),
          fast: true,
        },
      })),
    );
    expect(resolution.nightmareGains).toEqual([
      { entryId: parseDeckEntryId("deck-91-0"), cardId: NIGHTMARE_ID },
      { entryId: parseDeckEntryId("deck-91-1"), cardId: NIGHTMARE_ID },
    ]);
    expect(resolution.gainedCardIds).toEqual([NIGHTMARE_ID, NIGHTMARE_ID]);
    expect(() => assertJsonSafe(resolved, "journey")).not.toThrow();
  });

  it("mints selected fixed-form offers before its exact Nightmares", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("wave8-take-transfigured"),
      label: "Gather bright fragments",
      effectText: "Take Characters and Empower them. Gain 2 Nightmares.",
      followupTitle: "Choose fragments",
      followupSubtitle: "Take any number.",
      effectKind: "take-transfigured-cards-and-gain-nightmares",
      predicate: "character",
      offerCount: 4,
      transfiguration: "Empowered",
      nightmareCount: 2,
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("wave8-take-transfigured-fallback"),
      label: "Take the source",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const state = buildState(content);
    const plan = state.runtime.actionOffers[0]?.compoundActionPreparation;
    if (plan?.kind !== "take-transfigured-nightmares") {
      throw new Error("Expected a take-transfigured compound plan");
    }
    const cardIds = [
      plan.offeredCards[2]?.cardId,
      plan.offeredCards[0]?.cardId,
    ].filter((cardId): cardId is CardId => cardId !== undefined);
    const resolved = resolve(content, state.journey, action.id, { cardIds });
    const resolution = explorationResolutionFor(resolved);
    expect(resolution.gainedCardIds).toEqual([
      ...cardIds,
      NIGHTMARE_ID,
      NIGHTMARE_ID,
    ]);
    expect(
      resolution.cardTransfigurations?.map(({ cardId }) => cardId),
    ).toEqual(cardIds);
    expect(resolution.nightmareGains?.map(({ entryId }) => entryId)).toEqual([
      "deck-91-2",
      "deck-91-3",
    ]);
    expect(
      resolution.gainedEntryIds?.map(
        (entryId) =>
          resolved.deck.find((entry) => entry.entryId === entryId)
            ?.transfiguration,
      ),
    ).toEqual(["Empowered", "Empowered", null, null]);

    const none = resolve(content, buildState(content).journey, action.id, {
      cardIds: [],
    });
    expect(explorationResolutionFor(none)).toMatchObject({
      selection: { cardIds: [] },
      gainedCardIds: [NIGHTMARE_ID, NIGHTMARE_ID],
      cardTransfigurations: [],
    });
    expect(
      resolveExplorationChoice({
        journey: state.journey,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: { cardIds: [cardIds[0], cardIds[0]] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
  });

  it("purges one prepared entry then transfigures and copies the other three", () => {
    const action: ExplorationActionContent = {
      id: testExplorationActionId("wave8-purge-transfigure-copy"),
      label: "Choose the severed echo",
      effectText: "Purge one card. Empower and copy the other three.",
      followupTitle: "Choose a card",
      followupSubtitle: "The other three will be Empowered and copied.",
      effectKind: "purge-one-transfigure-and-copy-others",
      offerCount: 4,
      transfiguration: "Empowered",
    };
    const fallback: ExplorationActionContent = {
      id: testExplorationActionId("wave8-purge-transfigure-copy-fallback"),
      label: "Take the source",
      effectText: "Gain a card",
      effectKind: "gain-card",
      cardId: SOURCE_CARD_ID,
    };
    const content = contentFixture([action, fallback]);
    const journey = journeyFixture(content);
    journey.deck = journey.deck.map((entry, index) => ({
      ...entry,
      keywordModification: { reclaim: index + 1 },
      sparkBonus: index,
    }));
    const state = buildState(content, journey);
    const plan = state.runtime.actionOffers[0]?.compoundActionPreparation;
    if (plan?.kind !== "purge-transfigure-copy") {
      throw new Error("Expected a purge/transfigure/copy compound plan");
    }
    const purged = plan.targets[1];
    if (purged === undefined) throw new Error("Expected a purge choice");
    const companions = plan.targets.filter(
      ({ entryId }) => entryId !== purged.entryId,
    );
    const resolved = resolve(content, state.journey, action.id, {
      entryIds: [purged.entryId],
    });
    const resolution = explorationResolutionFor(resolved);
    expect(resolution.purgedEntryIds).toEqual([purged.entryId]);
    expect(resolution.cardTransfigurations).toEqual(
      companions.map((target) => ({
        entryId: target.entryId,
        cardId: target.cardId,
        beforeTransfiguration: null,
        afterTransfiguration: target.transfiguration,
      })),
    );
    expect(resolution.cardCopies).toEqual(
      companions.map((target, index) => ({
        sourceEntryId: target.entryId,
        sourceCardId: target.cardId,
        mintedEntryId: parseDeckEntryId(`deck-91-${String(index)}`),
        mintedCardId: target.cardId,
      })),
    );
    expect(
      resolution.gainedEntryIds?.map((entryId, index) => {
        const minted = resolved.deck.find((entry) => entry.entryId === entryId);
        const source = state.journey.deck.find(
          (entry) => entry.entryId === companions[index]?.entryId,
        );
        return {
          transfiguration: minted?.transfiguration,
          keywordModification: minted?.keywordModification,
          sparkBonus: minted?.sparkBonus,
          sourceKeywordModification: source?.keywordModification,
          sourceSparkBonus: source?.sparkBonus,
        };
      }),
    ).toEqual(
      companions.map((target) => {
        const source = state.journey.deck.find(
          (entry) => entry.entryId === target.entryId,
        );
        return {
          transfiguration: "Empowered",
          keywordModification: source?.keywordModification,
          sparkBonus: source?.sparkBonus,
          sourceKeywordModification: source?.keywordModification,
          sourceSparkBonus: source?.sparkBonus,
        };
      }),
    );

    const staleTarget = plan.targets[3];
    if (staleTarget === undefined) throw new Error("Expected a stale target");
    const stale = {
      ...state.journey,
      deck: state.journey.deck.map((entry) =>
        entry.entryId === staleTarget.entryId
          ? { ...entry, transfiguration: "Empowered" as const }
          : entry,
      ),
    };
    expect(
      resolveExplorationChoice({
        journey: stale,
        site,
        payload: {
          actionId: action.id,
          selectionRulesVersion: SELECTION_RULES_VERSION,
          selection: { entryIds: [purged.entryId] },
        },
        seq: 91,
        content,
      }),
    ).toBeNull();
    expect(
      stale.deck.find(({ entryId }) => entryId === companions[0]?.entryId)
        ?.transfiguration,
    ).toBeNull();
  });
});
