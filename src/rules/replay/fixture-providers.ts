// Deterministic content providers for the synthetic replay fixtures.
//
// The reducer's five content seams (journey lifecycle, deck, draft, site, battle
// init) BOUNCE every provider-backed event until a provider is registered. The
// REAL generators register through `src/session/providers/registerGameProviders`,
// but the permanent replay regression net deliberately uses these minimal
// DETERMINISTIC fakes instead: baking real-content hashes would couple the
// fixtures to the card/avatar/atlas catalogs, which AGENTS.md forbids
// (tests must not break on a data edit). The real providers' determinism is
// covered separately by `src/session/providers/register-game-providers.test.ts`.
// These fakes let the fixture event logs fold to a stable, reproducible state.
//
// THE SAME module is imported by BOTH the generator script
// (`scripts/regenerate-replay-fixtures.mjs`) and the replay test
// (`replay.test.ts`), so a fixture always replays to the identical hash it was
// generated with. If they registered different providers the baked hash would
// be meaningless. Call {@link registerReplayFixtureProviders} before replaying
// a fixture and {@link clearReplayFixtureProviders} after, so no registration
// leaks into other suites.
//
// Determinism rails (src/rules/): no `Math.random`, no live clock. Randomness
// comes from a seeded PRNG here and from `ctx.rng` inside the reducer; the
// Dreamwell scripts are selected from the live effects table by structure so
// fixtures stay resilient to card catalog edits while still covering the
// active automation runner.

import type { ResolvedAvatarPackage } from "../../types/content";
import {
  parseCardName,
  parseCardSubtype,
} from "../../types/card-identity";
import type {
  DraftPoolCopiesByCard,
  PoolDraftState,
} from "../../types/draft";
import type {
  BattleCardInstance,
  BattleCardStatus,
  BattleMutableState,
  BattleSide,
  BattleInit,
} from "../../battle/types";
import {
  emptyBackRankSlots,
  emptyFrontRankSlots,
} from "../../battle/test-support";
import type {
  DreamscapeNode,
  RuntimeShopSlot,
  SiteState,
} from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { emptyDawnFired, type BattleFoldState } from "../battle/fold";
import { DREAMWELL_EFFECTS } from "../battle/dreamwell-effects-table";
import {
  registerBattleCompletionProvider,
  registerBattleInitProvider,
  type BattleCompletionProvider,
  type BattleInitProvider,
} from "../battle/battle-events";
import {
  registerDeckContentProvider,
  type DeckContentProvider,
} from "../journey/deck";
import {
  registerDraftContentProvider,
  type DraftContentProvider,
} from "../journey/draft";
import {
  registerJourneyLifecycleContentProvider,
  type JourneyLifecycleContentProvider,
} from "../journey/lifecycle";
import {
  registerSiteContentProvider,
  type SiteContentProvider,
} from "../journey/sites";
import {
  testDraftContentProvider,
  testJourneyLifecycleContentProvider,
  testSiteContentProvider,
} from "../journey/test-content-providers";
import type { AvatarId } from "../../types/identifiers";
import type { JourneySeed } from "../../types/journey-seed";
import type { BattleCardId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import type { SiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseBattleId } from "../../types/identifiers";
import { parseBattleEntryKey } from "../../types/identifiers";
import { parseBattleCardId } from "../../types/identifiers";
import { parseOpponentId } from "../../types/identifiers";
import { parseDreamwellCardName } from "../../types/catalog-names";
import { opponentsFixture } from "../../testing/opponents-fixture";
import { createEngine, type BattleInit as EngineBattleInit, type Engine } from "../../engine";
import { battleSeed } from "../../engine/state/ids";
import { DSL, DSL_CARDS } from "../../engine/testing/dsl-cards";
import {
  SYNTHETIC,
  SYNTHETIC_DREAMWELL,
  testCatalog,
} from "../../engine/testing/synthetic-cards";
import { resolveBattleAiConfiguration } from "../../types/opponents-data";
import {
  testCardId,
  testContentHash,
  testAvatarId,
  testDreamscapeId,
  testDreamsignId,
} from "../../types/test-identities";

// ---------------------------------------------------------------------------
// Stable ids the fixture event logs reference
// ---------------------------------------------------------------------------

/** A synthetic provider-set identifier stamped into every fixture. */
export const FIXTURE_PROVIDER_SET = "synthetic-deterministic-v1";

export const AVATAR_ID = testAvatarId("dc-fixture");
export const NODE_ID = parseAtlasNodeId("node-start");
export const NEXT_NODE_ID = parseAtlasNodeId("node-next");
export const ESSENCE_SITE_ID = parseSiteId("site-essence");
export const SHOP_SITE_ID = parseSiteId("site-shop");
export const BATTLE_SITE_ID = parseSiteId("site-battle");
export const DRAFT_SITE_ID = parseSiteId("site-draft");

/** The fixed run draft pool: 4 unique card numbers (matching DEFAULT_DRAFT_CONFIG's packSize), 4 copies each. */
const DRAFT_POOL_COPIES_BY_CARD: DraftPoolCopiesByCard = {
  "100": 4,
  "101": 4,
  "102": 4,
  "103": 4,
};

/** Battle-card instance ids in the prototype battle board's hand. */
const BATTLE_CARD_DETERMINISTIC = parseBattleCardId("bc-det");
const BATTLE_CARD_FORESEE = parseBattleCardId("bc-foresee");

// ---------------------------------------------------------------------------
// Seeded PRNG (no Math.random)
// ---------------------------------------------------------------------------

/** FNV-1a hash of a string to a 32-bit seed. */
function hashNumber(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** A seeded 32-bit xorshift PRNG in [0, 1). */
function makePrng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}

// ---------------------------------------------------------------------------
// Journey lifecycle provider
// ---------------------------------------------------------------------------

function fixturePackage(
  avatarId: AvatarId,
  seed: JourneySeed,
): ResolvedAvatarPackage {
  const rng = makePrng(hashNumber(`${avatarId}:${seed}`));
  const dreamsignPoolIds = Array.from(
    { length: 6 },
    () => `ds-${String(Math.floor(rng() * 1_000_000))}`,
  );
  return {
    avatar: {
      id: avatarId,
      name: `caller-${avatarId}`,
      title: "title",
      renderedText: "text",
      imageNumber: "1",
      startingEssence: 300,
    },
    draftPoolCopiesByCard: DRAFT_POOL_COPIES_BY_CARD,
    dreamsignPoolIds: dreamsignPoolIds.map(testDreamsignId),
    mandatoryOnlyPoolSize: 3,
    draftPoolSize: 3,
    doubledCardCount: 1,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
  };
}

/** The atlas node the fixtures travel to: an Essence site, a Shop site, a
 *  Draft site, and a Battle site (visited last), so OPEN_SITE /
 *  ENTER_DRAFT_SITE / BUY_SHOP_SLOT / BEGIN_BATTLE have live targets. */
function fixtureNode(
  includedSiteTypes: ReadonlySet<SiteState["type"]> | null = null,
): DreamscapeNode {
  const allSites: SiteState[] = [
    {
      id: parseSiteId(ESSENCE_SITE_ID),
      type: "Essence",
      isEnhanced: false,
      isVisited: false,
    },
    {
      id: parseSiteId(SHOP_SITE_ID),
      type: "Shop",
      isEnhanced: false,
      isVisited: false,
    },
    {
      id: parseSiteId(DRAFT_SITE_ID),
      type: "Draft",
      isEnhanced: false,
      isVisited: false,
    },
    {
      id: parseSiteId(BATTLE_SITE_ID),
      type: "Battle",
      isEnhanced: false,
      isVisited: false,
    },
  ];
  const sites =
    includedSiteTypes === null
      ? allSites
      : allSites.filter((site) => includedSiteTypes.has(site.type));
  return {
    id: NODE_ID,
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: testDreamscapeId("dreamscape-start"),
    sites,
    position: { x: 0, y: 0 },
    state: "available",
    enhancedSiteType: null,
    forwardIds: [NEXT_NODE_ID],
    backwardIds: [],
    knownDreamsignId: null,
  };
}

function fixtureNextNode(): DreamscapeNode {
  return {
    id: NEXT_NODE_ID,
    layer: LayerName.Two,
    indexInLayer: 0,
    dreamscapeId: null,
    sites: [],
    position: { x: 0, y: 1 },
    state: "unrevealed",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [NODE_ID],
    knownDreamsignId: null,
  };
}

/**
 * A non-null pool draft, so the started run's `draftState` is populated.
 * `activeSiteId: null` / `currentOffer: []`: the draft has not been entered
 * yet — `ENTER_DRAFT_SITE` (targeting {@link DRAFT_SITE_ID}, the atlas Draft
 * site `fixtureNode` seeds) reveals the first offer for real, rather than
 * this fixture pre-seeding an already-active site.
 */
function fixtureDraftState(): PoolDraftState {
  return {
    mode: "tides4",
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
    draftPoolCopiesByCard: DRAFT_POOL_COPIES_BY_CARD,
    remainingCopiesByCard: { ...DRAFT_POOL_COPIES_BY_CARD },
  };
}

function lifecycleProvider(): JourneyLifecycleContentProvider {
  return testJourneyLifecycleContentProvider({
    resolveAvatarPackage: (avatarId, seed) =>
      fixturePackage(avatarId, seed),
    startJourney: ({ journey, avatarId, seed }) => {
      const pkg = fixturePackage(avatarId, seed);
      const includedSiteTypes =
        seed === "fixture-battle"
          ? new Set<SiteState["type"]>(["Battle"])
          : seed === "fixture-adversarial"
            ? new Set<SiteState["type"]>(["Essence", "Battle"])
            : null;
      return {
        ...journey,
        seed: journey.seed,
        essence: pkg.avatar.startingEssence,
        avatar: {
          id: pkg.avatar.id,
          name: pkg.avatar.name,
          title: pkg.avatar.title,
          renderedText: pkg.avatar.renderedText,
          imageNumber: pkg.avatar.imageNumber,
          startingEssence: pkg.avatar.startingEssence,
        },
        resolvedPackage: pkg,
        remainingDreamsignPool: [...pkg.dreamsignPoolIds],
        draftState: fixtureDraftState(),
        currentDreamscape: NODE_ID,
        atlas: {
          ...journey.atlas,
          layers: [[NODE_ID], [NEXT_NODE_ID]],
          nodes: {
            [NODE_ID]: fixtureNode(includedSiteTypes),
            [NEXT_NODE_ID]: fixtureNextNode(),
          },
          startingNodeId: NODE_ID,
          bossNodeId: NEXT_NODE_ID,
          currentNodeId: NODE_ID,
        },
        siteRuntime: {},
        screen: { type: "dreamscape" },
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Deck / draft providers
// ---------------------------------------------------------------------------

function deckProvider(): DeckContentProvider {
  return {
    resolveCardNumber: (cardId) => {
      const match = /^card-(\d+)$/.exec(cardId);
      return match ? Number(match[1]) : null;
    },
    resolveDreamsign: (dreamsignId) => {
      const match = /^ds-(\d+)$/.exec(dreamsignId);
      if (match === null) return null;
      return {
        id: dreamsignId,
        name: `dreamsign-${match[1]}`,
        effectDescription: "effect",
      };
    },
  };
}

function draftProvider(): DraftContentProvider {
  return testDraftContentProvider({
    resolveCardNumber: (cardId) => {
      const match = /^card-(\d+)$/.exec(cardId);
      return match ? Number(match[1]) : null;
    },
  });
}

// ---------------------------------------------------------------------------
// Site provider — Shop OPEN_SITE seeds one buyable card slot
// ---------------------------------------------------------------------------

function siteProvider(): SiteContentProvider {
  return testSiteContentProvider({
    openSite: ({ site }) => {
      if (site.type !== "Shop") return null;
      const slot: RuntimeShopSlot = {
        itemType: "card",
        cardNumber: 42,
        basePrice: 50,
        discountPercent: 0,
        purchased: false,
      };
      return {
        runtime: {
          kind: "shop",
          slots: [slot],
          rerollCount: 0,
          remainingDreamsignPoolIds: [],
          purchaseHistory: [],
        },
      };
    },
  });
}

// ---------------------------------------------------------------------------
// Battle-init provider — a board with two scripted cards in the player's hand
// ---------------------------------------------------------------------------

function defaultStatus(): BattleCardStatus {
  return {
    isExhausted: false,
    counters: 0,
    reclaimed: false,
    offering: false,
    ephemeral: false,
    veil: false,
    grantedVengeful: false,
    grantedAwakened: false,
  };
}

function makeInstance(
  battleCardId: BattleCardId,
  cardId: CardId,
  controller: BattleSide = "player",
): BattleCardInstance {
  return {
    battleCardId,
    definition: {
      sourceDeckEntryId: null,
      cardId,
      cardNumber: 0,
      name: parseCardName("Fixture Card"),
      battleCardKind: "character",
      subtype: parseCardSubtype("Warrior"),
      energyCost: 0,
      printedEnergyCost: 0,
      printedSpark: 1,
      isFast: false,
      reclaimCost: null,
      renderedText: "",
      imageNumber: 0,
      transfiguration: null,
      isBane: false,
    },
    owner: controller,
    controller,
    sparkDelta: 0,
    staticSparkBonus: 0,
    isRevealedToPlayer: true,
    status: defaultStatus(),
    markers: { isPrevented: false, isCopied: false },
    notes: [],
    provenance: {
      kind: "journey-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    },
  };
}

function makeSide(): BattleMutableState["sides"][BattleSide] {
  return {
    currentEnergy: 0,
    maxEnergy: 0,
    score: 0,
    visibility: {},
    deck: [],
    hand: [],
    void: [],
    banished: [],
    backRank: emptyBackRankSlots(),
    frontRank: emptyFrontRankSlots(),
    fatigueCount: 0,
    dreamwellCardIndex: null,
    dreamwellDrawnTurn: null,
  };
}

function makeInit(siteId: SiteId): BattleInit {
  const foresee = Object.values(DREAMWELL_EFFECTS).find((script) => {
    const first = script.steps[0];
    return first?.kind === "prompt" && first.prompt.kind === "foresee";
  });
  if (foresee === undefined) {
    throw new Error("replay fixture requires a Foresee Dreamwell script");
  }
  const opponentData = opponentsFixture();
  return {
    battleId: parseBattleId(`battle-${siteId}`),
    battleEntryKey: parseBattleEntryKey(`fixture:${siteId}`),
    seed: 1,
    siteId,
    nodeId: NODE_ID,
    completionLevelAtStart: 0,
    isFinalBoss: false,
    essenceReward: 75,
    openingHandSize: 0,
    scoreToWin: 30,
    turnLimit: 12,
    maxEnergyCap: 12,
    handLimit: 10,
    opponentsContentHash: testContentHash("replay-opponents"),
    opponentAbilityActive: false,
    aiConfiguration: resolveBattleAiConfiguration(opponentData, "journey"),
    startingSide: "player",
    playerDrawSkipsTurnOne: true,
    journeyDeckEntries: [],
    playerDeckOrder: [],
    dreamwellDeck: [
      {
        id: foresee.id,
        name: parseDreamwellCardName("Fixture Dreamwell"),
        renderedText: "",
        energyAdded: 0,
        order: 0,
        cardNumber: 0,
        imageNumber: 0,
      },
    ],
    enemyDescriptor: {
      id: parseOpponentId("fixture-enemy"),
      name: "Fixture Enemy",
      subtitle: "",
      imageNumber: "1",
      portraitSeed: 1,
      abilityText: "",
      dreamsigns: [],
      signatureCards: [],
    },
    enemyDeckDefinition: [],
    avatarSummary: null,
    dreamsignSummaries: [],
    atlasSnapshot: {
      layers: [[NODE_ID], [NEXT_NODE_ID]],
      nodes: {
        [NODE_ID]: fixtureNode(),
        [NEXT_NODE_ID]: fixtureNextNode(),
      },
      startingNodeId: NODE_ID,
      bossNodeId: NEXT_NODE_ID,
      bossIncarnationId: null,
      currentNodeId: NODE_ID,
      knownDreamsignCarrierIds: [],
    },
  };
}

/**
 * The synthetic engine the fixtures play battles on: the engine's synthetic
 * and DSL test cards, never catalog content.
 */
export const FIXTURE_ENGINE: Engine = createEngine(
  testCatalog(DSL_CARDS),
);

/** A 0● event whose play-time mode prompt chooses between drawing a card and 1 point. */
export const FIXTURE_POINTS_CARD_ID = DSL.chooseDrawOrPoints.id;

/** Mode index of {@link FIXTURE_POINTS_CARD_ID}'s 1-point mode. */
export const FIXTURE_POINTS_MODE = 1;

/**
 * The fixture engine battle: every player card is the points event and the
 * battle is won at 1 point, so playing one card and choosing its points mode
 * ends it.
 */
function fixtureEngineInit(siteId: SiteId): EngineBattleInit {
  return {
    seed: battleSeed(`fixture:${siteId}`),
    scoreToWin: 1,
    startingSide: "player",
    decks: {
      player: Array.from({ length: 10 }, () => ({ cardId: FIXTURE_POINTS_CARD_ID })),
      enemy: Array.from({ length: 10 }, () => ({ cardId: SYNTHETIC.vanilla1.id })),
    },
    dreamwell: SYNTHETIC_DREAMWELL.map((card) => card.id),
  };
}

export function fixtureBattleInitProvider(): BattleInitProvider {
  return {
    engine: FIXTURE_ENGINE,
    beginBattle: ({ journey, siteId }) => {
      const site = Object.values(journey.atlas.nodes)
        .flatMap((node) => node.sites)
        .find((candidate) => candidate.id === siteId);
      if (
        site?.type !== "Battle" ||
        journey.screen.type !== "site" ||
        journey.screen.siteId !== siteId
      ) {
        return null;
      }
      const player = makeSide();
      player.hand = [BATTLE_CARD_DETERMINISTIC, BATTLE_CARD_FORESEE];
      const enemy = makeSide();
      const board: BattleMutableState = {
        battleId: parseBattleId(`battle-${siteId}`),
        activeSide: "player",
        turnNumber: 2,
        phase: "dreamwell",
        result: null,
        forcedResult: null,
        dreamwellDeckIndex: 0,
        nextBattleCardOrdinal: 1000,
        sides: { player, enemy },
        cardInstances: {
          [BATTLE_CARD_DETERMINISTIC]: makeInstance(
            BATTLE_CARD_DETERMINISTIC,
            testCardId("00000000-0000-0000-0000-000000000001"),
            "player",
          ),
          [BATTLE_CARD_FORESEE]: makeInstance(
            BATTLE_CARD_FORESEE,
            testCardId("00000000-0000-0000-0000-000000000002"),
            "player",
          ),
        },
      };
      const battle: BattleFoldState = {
        init: makeInit(siteId),
        board,
        effectQueue: [],
        pendingPrompt: null,
        dawnFired: emptyDawnFired(),
      };
      return { battle, engineInit: fixtureEngineInit(siteId) };
    },
  };
}

function fixtureBattleCompletionProvider(): BattleCompletionProvider {
  return {
    advanceAtlas: ({ journey, battle, completionLevel }) => {
      if (
        battle.init.nodeId !== NODE_ID ||
        completionLevel !== 1 ||
        journey.atlas.nodes[NODE_ID] === undefined ||
        journey.atlas.nodes[NEXT_NODE_ID] === undefined
      ) {
        return null;
      }
      return {
        ...journey.atlas,
        currentNodeId: NODE_ID,
        nodes: {
          ...journey.atlas.nodes,
          [NODE_ID]: {
            ...journey.atlas.nodes[NODE_ID],
            state: "completed",
          },
          [NEXT_NODE_ID]: {
            ...journey.atlas.nodes[NEXT_NODE_ID],
            dreamscapeId: testDreamscapeId("dreamscape-next"),
            state: "available",
          },
        },
      };
    },
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register the deterministic fixture providers on every content seam. */
export function registerReplayFixtureProviders(): void {
  registerJourneyLifecycleContentProvider(lifecycleProvider());
  registerDeckContentProvider(deckProvider());
  registerDraftContentProvider(draftProvider());
  registerSiteContentProvider(siteProvider());
  registerBattleInitProvider(fixtureBattleInitProvider());
  registerBattleCompletionProvider(fixtureBattleCompletionProvider());
}

/** Clear every fixture-provider registration so no other suite is affected. */
export function clearReplayFixtureProviders(): void {
  registerJourneyLifecycleContentProvider(null);
  registerDeckContentProvider(null);
  registerDraftContentProvider(null);
  registerSiteContentProvider(null);
  registerBattleInitProvider(null);
  registerBattleCompletionProvider(null);
}
