import type { JourneySeed } from "../../types/journey-seed";
import { testJourneySeed } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import { hashState } from "../../eventlog/hash";
import type { EngineConfig, Genesis } from "../../eventlog/types";
import type { AvatarContent, ResolvedAvatarPackage } from "../../types/content";
import type { DraftState, PoolDraftState } from "../../types/draft";
import type { Dreamsign, DreamscapeNode } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { SITE_PICKS } from "../../draft/draft-engine";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { type DeckContentProvider } from "./deck";
import { type DraftContentProvider } from "./draft";
import { type JourneyLifecycleContentProvider } from "./lifecycle";
import { type SiteContentProvider } from "./sites";
import { testDraftContentProvider, testJourneyLifecycleContentProvider, testSiteContentProvider } from "./test-content-providers";
import { parseAtlasNodeId } from "../../types/identifiers";
import type { AvatarId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";



// ---------------------------------------------------------------------------
// Fixtures & engine config
// ---------------------------------------------------------------------------

export const GENESIS: Genesis = {
  seed: testJourneySeed("journey-properties-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};


export const ACTOR = testEventActor("alice");

export const TIMESTAMP = "1970-01-01T00:00:00.000Z";


/**
 * A minimal `EngineConfig<FoldState>` for `foldEvents`. Only `reducer` is read
 * by `foldEvents`; the rest are supplied for completeness and mirror
 * `GAME_ENGINE_CONFIG`.
 */
export const ENGINE_CONFIG: EngineConfig<FoldState> = {
  reducer: reduceGameEvent,
  genesisState: genesisFoldState,
  encode: (state) => JSON.stringify(state),
  decode: (raw) => JSON.parse(raw) as FoldState,
  hash: hashState,
};


/** A seeded 32-bit xorshift PRNG — reproducible, no `Math.random`. */
export function makePrng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x1_0000_0000;
  };
}


/** FNV-1a hash of a string to a 32-bit seed for the PRNG. */
function hashNumber(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}


// ---------------------------------------------------------------------------
// Deterministic fake content providers
// ---------------------------------------------------------------------------

/**
 * A deterministic package derived only from `(avatarId, seed)`. The
 * `startJourney` result populates ALL THREE run fields, including a non-null
 * `draftState`, so the nullability invariant (a) has a live precondition.
 */
export function lifecycleProvider(): JourneyLifecycleContentProvider {
  function packageFor(
    avatarId: AvatarId,
    seed: JourneySeed,
  ): ResolvedAvatarPackage {
    const avatar: AvatarContent = {
      id: avatarId,
      name: `caller-${avatarId}`,
      title: "title",
      renderedText: "text",
      imageNumber: "1",
      startingEssence: 150,
    };
    const rng = makePrng(hashNumber(`${avatarId}:${seed}`));
    const dreamsignPoolIds = Array.from(
      { length: 8 },
      () => `ds-${String(Math.floor(rng() * 1_000_000))}`,
    );
    return {
      avatar,
      draftPoolCopiesByCard: { "100": 4, "101": 4, "102": 4 },
      dreamsignPoolIds: dreamsignPoolIds.map(testDreamsignId),
      mandatoryOnlyPoolSize: 3,
      draftPoolSize: 3,
      doubledCardCount: 1,
      legalSubsetCount: 1,
      preferredSubsetCount: 1,
    };
  }

  return testJourneyLifecycleContentProvider({
    resolveAvatarPackage: (avatarId, seed) =>
      packageFor(avatarId, seed),
    startJourney: ({ journey, avatarId, seed }) => {
      const pkg = packageFor(avatarId, seed);
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
        draftState: populatedDraftState(),
        currentDreamscape: parseAtlasNodeId("node-start"),
        atlas: {
          ...journey.atlas,
          nodes: { [parseAtlasNodeId("node-start")]: shopNode() },
        },
        siteRuntime: {
          [SHOP_SITE_ID]: {
            kind: "shop",
            slots: [],
            rerollCount: 0,
            remainingDreamsignPoolIds: [],
            purchaseHistory: [],
          },
        },
        screen: { type: "dreamscape" },
      };
    },
  });
}


export const SHOP_SITE_ID = "shop-site";

export const DRAFT_SITE_ID = "draft-site-1";


/**
 * A pool draft whose `sitePicksCompleted` is one below `SITE_PICKS`, so a
 * single `PICK_DRAFT_CARD` completes the site through the engine's completion
 * branch (`currentOffer = []`) and never reaches the stochastic offer reveal —
 * making the applied pick deterministic and engine-safe on this fixture while
 * still REWRITING `draftState` to a non-null value.
 */
function populatedDraftState(): PoolDraftState {
  return {
    mode: "tides4",
    currentOffer: [100, 101, 102],
    activeSiteId: parseSiteId(DRAFT_SITE_ID),
    pickNumber: 1,
    sitePicksCompleted: Math.max(0, SITE_PICKS - 1),
    draftPoolCopiesByCard: { "100": 4, "101": 4, "102": 4 },
    remainingCopiesByCard: { "100": 3, "101": 4, "102": 4 },
  };
}


/** An atlas node carrying the Shop site `REROLL_SHOP` restocks. */
function shopNode(): DreamscapeNode {
  return {
    id: parseAtlasNodeId("node-start"),
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: null,
    sites: [
      {
        id: parseSiteId(SHOP_SITE_ID),
        type: "Shop",
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
  };
}


/** A pool draft the Site fake's `rerollShop` returns (non-null draftState). */
function rerolledDraftState(): DraftState {
  return {
    mode: "tides4",
    currentOffer: [],
    activeSiteId: parseSiteId(DRAFT_SITE_ID),
    pickNumber: 2,
    sitePicksCompleted: Math.max(0, SITE_PICKS - 1),
    draftPoolCopiesByCard: { "100": 4 },
    remainingCopiesByCard: { "100": 2 },
  };
}


/** Draft fake: `PICK_DRAFT_CARD` resolves `card-<n>` and advances the draft. */
export function draftProvider(): DraftContentProvider {
  return testDraftContentProvider({
    resolveCardNumber: (cardId) => {
      const match = /^card-(\d+)$/.exec(cardId);
      return match ? Number(match[1]) : null;
    },
  });
}


/**
 * Site fake: `rerollShop` restocks with a NON-NULL `draftState`, so
 * `REROLL_SHOP` applies and rewrites the run's draft state. `openSite` bounces
 * (returns null) so content-coupled `OPEN_SITE` never mutates the seeded
 * runtime, and the augury and exploration resolvers bounce.
 */
export function siteProvider(): SiteContentProvider {
  return testSiteContentProvider({
    rerollShop: () => ({
      slots: [],
      remainingDreamsignPoolIds: [],
      remainingDreamsignPool: [],
      draftState: rerolledDraftState(),
    }),
  });
}


/**
 * A deck provider that resolves any `card-<n>` id to `n` and any dreamsign id
 * to a minimal record, so `ADD_CARD` / `ADD_DREAMSIGN` apply and exercise the
 * deck-mutation paths. Deterministic in the id alone (never seq/clock).
 */
export function deckProvider(): DeckContentProvider {
  return {
    resolveCardNumber: (cardId) => {
      const match = /^card-(\d+)$/.exec(cardId);
      return match ? Number(match[1]) : null;
    },
    resolveDreamsign: (dreamsignId): Dreamsign | null => {
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
