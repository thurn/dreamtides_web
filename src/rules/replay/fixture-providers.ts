// Deterministic content providers for the synthetic replay fixtures.
//
// The reducer's five content seams (quest lifecycle, deck, draft, site, battle
// init) BOUNCE every provider-backed event until a provider is registered. The
// REAL generators register through `src/coop/providers/registerGameProviders`,
// but the permanent replay regression net deliberately uses these minimal
// DETERMINISTIC fakes instead: baking real-content hashes would couple the
// fixtures to the TOML card/dreamcaller/atlas data, which AGENTS.md forbids
// (tests must not break on a data edit). The real providers' determinism is
// covered separately by `src/coop/providers/register-game-providers.test.ts`.
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
// fixtures stay resilient to TOML card-data edits while still covering the
// active automation runner.

import type { ResolvedDreamcallerPackage } from "../../types/content";
import type { PoolDraftState } from "../../types/draft";
import type {
  BattleCardInstance,
  BattleCardStatus,
  BattleMutableState,
  BattleSide,
  BattleInit,
} from "../../battle/types";
import { frontRankSlotId } from "../../battle/types";
import {
  emptyBackRankSlots,
  emptyFrontRankSlots,
} from "../../battle/test-support";
import type {
  DreamscapeNode,
  RuntimeShopSlot,
  SiteState,
} from "../../types/quest";
import { LayerName } from "../../types/layer-name";
import { emptyDawnFired, type BattleFoldState } from "../battle/fold";
import { DREAMWELL_EFFECTS } from "../battle/dreamwell-effects-table";
import {
  registerBattleInitProvider,
  type BattleInitProvider,
} from "../battle/battle-events";
import {
  registerDeckContentProvider,
  type DeckContentProvider,
} from "../quest/deck";
import {
  registerDraftContentProvider,
  type DraftContentProvider,
} from "../quest/draft";
import {
  registerQuestLifecycleContentProvider,
  type QuestLifecycleContentProvider,
} from "../quest/lifecycle";
import {
  registerSiteContentProvider,
  type SiteContentProvider,
} from "../quest/sites";

// ---------------------------------------------------------------------------
// Stable ids the fixture event logs reference
// ---------------------------------------------------------------------------

/** A synthetic provider-set identifier stamped into every fixture. */
export const FIXTURE_PROVIDER_SET = "synthetic-deterministic-v1";

export const DREAMCALLER_ID = "dc-fixture";
export const NODE_ID = "node-start";
export const ESSENCE_SITE_ID = "site-essence";
export const SHOP_SITE_ID = "site-shop";
export const BATTLE_SITE_ID = "site-battle";
export const DRAFT_SITE_ID = "site-draft";

/** The fixed run draft pool: 4 unique card numbers (matching DEFAULT_DRAFT_CONFIG's packSize), 4 copies each. */
const DRAFT_POOL_COPIES_BY_CARD: Record<string, number> = {
  "100": 4,
  "101": 4,
  "102": 4,
  "103": 4,
};

/** Battle-card instance ids the battle-fixture BATTLE_COMMANDs move. */
export const BATTLE_CARD_DETERMINISTIC = "bc-det";
export const BATTLE_CARD_FORESEE = "bc-foresee";

/** The front-rank slots the two battle cards deploy into. */
export const DETERMINISTIC_SLOT = frontRankSlotId(0);
export const FORESEE_SLOT = frontRankSlotId(1);

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
// Quest lifecycle provider
// ---------------------------------------------------------------------------

function fixturePackage(
  dreamcallerId: string,
  seed: string,
): ResolvedDreamcallerPackage {
  const rng = makePrng(hashNumber(`${dreamcallerId}:${seed}`));
  const dreamsignPoolIds = Array.from(
    { length: 6 },
    () => `ds-${String(Math.floor(rng() * 1_000_000))}`,
  );
  return {
    dreamcaller: {
      id: dreamcallerId,
      name: `caller-${dreamcallerId}`,
      title: "title",
      renderedText: "text",
      imageNumber: "1",
      startingEssence: 300,
    },
    draftPoolCopiesByCard: DRAFT_POOL_COPIES_BY_CARD,
    dreamsignPoolIds,
    mandatoryOnlyPoolSize: 3,
    draftPoolSize: 3,
    doubledCardCount: 1,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
    starterDecklistCardNumbers: [10, 11, 12],
  };
}

/** The atlas node the fixtures travel to: an Essence site, a Shop site, a
 *  Draft site, and a Battle site (visited last), so OPEN_SITE /
 *  ENTER_DRAFT_SITE / BUY_SHOP_SLOT / BEGIN_BATTLE have live targets. */
function fixtureNode(): DreamscapeNode {
  const sites: SiteState[] = [
    { id: ESSENCE_SITE_ID, type: "Essence", isEnhanced: false, isVisited: false },
    { id: SHOP_SITE_ID, type: "Shop", isEnhanced: false, isVisited: false },
    { id: DRAFT_SITE_ID, type: "Draft", isEnhanced: false, isVisited: false },
    { id: BATTLE_SITE_ID, type: "Battle", isEnhanced: false, isVisited: false },
  ];
  return {
    id: NODE_ID,
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: null,
    biomeName: "",
    biomeColor: "",
    sites,
    position: { x: 0, y: 0 },
    state: "available",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
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
    mode: "pool",
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
    draftPoolCopiesByCard: DRAFT_POOL_COPIES_BY_CARD,
    remainingCopiesByCard: { ...DRAFT_POOL_COPIES_BY_CARD },
  };
}

function lifecycleProvider(): QuestLifecycleContentProvider {
  return {
    resolveDreamcallerPackage: (dreamcallerId, seed) =>
      fixturePackage(dreamcallerId, seed),
    startQuest: ({ quest, dreamcallerId, seed }) => {
      const pkg = fixturePackage(dreamcallerId, seed);
      return {
        ...quest,
        seed: quest.seed,
        essence: pkg.dreamcaller.startingEssence,
        dreamcaller: {
          id: pkg.dreamcaller.id,
          name: pkg.dreamcaller.name,
          title: pkg.dreamcaller.title,
          renderedText: pkg.dreamcaller.renderedText,
          imageNumber: pkg.dreamcaller.imageNumber,
          startingEssence: pkg.dreamcaller.startingEssence,
        },
        resolvedPackage: pkg,
        remainingDreamsignPool: [...pkg.dreamsignPoolIds],
        draftState: fixtureDraftState(),
        currentDreamscape: NODE_ID,
        atlas: {
          ...quest.atlas,
          nodes: { [NODE_ID]: fixtureNode() },
          startingNodeId: NODE_ID,
          currentNodeId: NODE_ID,
        },
        siteRuntime: {},
        screen: { type: "dreamscape" },
      };
    },
  };
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
        isBane: false,
      };
    },
  };
}

function draftProvider(): DraftContentProvider {
  return {
    resolveCardNumber: (cardId) => {
      const match = /^card-(\d+)$/.exec(cardId);
      return match ? Number(match[1]) : null;
    },
    cardDatabase: () => new Map(),
    offerDepsFor: () => undefined,
    draftConfigFor: () => undefined,
  };
}

// ---------------------------------------------------------------------------
// Site provider — Shop OPEN_SITE seeds one buyable card slot
// ---------------------------------------------------------------------------

function siteProvider(): SiteContentProvider {
  return {
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
        },
      };
    },
  };
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
    grantedUnstoppable: false,
    grantedVengeful: false,
    grantedPreeminence: false,
    grantedAwakened: false,
  };
}

function makeInstance(
  battleCardId: string,
  cardId: string,
  controller: BattleSide = "player",
): BattleCardInstance {
  return {
    battleCardId,
    definition: {
      sourceDeckEntryId: null,
      cardId,
      cardNumber: 0,
      name: "Fixture Card",
      battleCardKind: "character",
      subtype: "Unit",
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
      kind: "quest-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    },
  } as BattleCardInstance;
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
  } as BattleMutableState["sides"][BattleSide];
}

function makeInit(siteId: string): BattleInit {
  const foresee = Object.values(DREAMWELL_EFFECTS).find((script) => {
    const first = script.steps[0];
    return first?.kind === "prompt" && first.prompt.kind === "foresee";
  });
  if (foresee === undefined) {
    throw new Error("replay fixture requires a Foresee Dreamwell script");
  }
  return {
    battleId: `battle-${siteId}`,
    siteId,
    dreamscapeId: null,
    scoreToWin: 30,
    turnLimit: 12,
    dreamwellDeck: [{
      id: foresee.id,
      name: "Fixture Dreamwell",
      renderedText: "",
      energyAdded: 0,
      order: 0,
      cardNumber: 0,
      imageNumber: 0,
    }],
  } as unknown as BattleInit;
}

export function fixtureBattleInitProvider(): BattleInitProvider {
  return {
    beginBattle: ({ siteId }) => {
      const player = makeSide();
      player.hand = [BATTLE_CARD_DETERMINISTIC, BATTLE_CARD_FORESEE];
      const enemy = makeSide();
      const board: BattleMutableState = {
        battleId: `battle-${siteId}`,
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
            "00000000-0000-0000-0000-000000000001",
            "player",
          ),
          [BATTLE_CARD_FORESEE]: makeInstance(
            BATTLE_CARD_FORESEE,
            "00000000-0000-0000-0000-000000000002",
            "player",
          ),
        },
      } as BattleMutableState;
      const battle: BattleFoldState = {
        init: makeInit(siteId),
        board,
        effectQueue: [],
        pendingPrompt: null,
        dawnFired: emptyDawnFired(),
      };
      return battle;
    },
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

/** Register the deterministic fixture providers on all five seams. */
export function registerReplayFixtureProviders(): void {
  registerQuestLifecycleContentProvider(lifecycleProvider());
  registerDeckContentProvider(deckProvider());
  registerDraftContentProvider(draftProvider());
  registerSiteContentProvider(siteProvider());
  registerBattleInitProvider(fixtureBattleInitProvider());
}

/** Clear every fixture-provider registration so no other suite is affected. */
export function clearReplayFixtureProviders(): void {
  registerQuestLifecycleContentProvider(null);
  registerDeckContentProvider(null);
  registerDraftContentProvider(null);
  registerSiteContentProvider(null);
  registerBattleInitProvider(null);
}
