import type { JourneySeed } from "../../types/journey-seed";
import { testJourneySeed } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import type { AvatarContent, ResolvedAvatarPackage } from "../../types/content";
import type { JourneyState } from "../../types/journey";
import { LayerName } from "../../types/layer-name";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { type JourneyLifecycleContentProvider } from "./lifecycle";
import { testJourneyLifecycleContentProvider } from "./test-content-providers";
import { parseAtlasNodeId } from "../../types/identifiers";
import type { AvatarId } from "../../types/identifiers";
import type { AtlasNodeId } from "../../types/identifiers";
import type { SiteId } from "../../types/identifiers";
import { testDreamscapeId, testDreamsignId } from "../../types/test-identities";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";



// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const GENESIS: Genesis = {
  seed: testJourneySeed("lifecycle-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};


export function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    contentConfig: TEST_CONTENT_CONFIG,
    seq: 10,
    rng: () => 0,
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}


export function event(
  type: GameEvent["type"],
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor: testEventActor(actor),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}


export function apply(
  state: FoldState,
  type: GameEvent["type"],
  payload: Record<string, unknown>,
  context: EventContext = ctx(),
): FoldState {
  return reduceGameEvent(state, event(type, payload), context).state;
}


export function genesis(): FoldState {
  return genesisFoldState(GENESIS);
}


/**
 * A tiny deterministic 32-bit xorshift PRNG so the property sweeps are
 * reproducible without depending on `Math.random`.
 */
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


/**
 * A deterministic content provider whose package depends ONLY on
 * `(avatarId, seed)` — never on wall-clock or live randomness — so any
 * nondeterminism the reducer introduced would surface as a hash mismatch.
 */
export function deterministicProvider(
  isTutorialJourney = false,
): JourneyLifecycleContentProvider {
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
    // Derive a stable dreamsign pool from (id, seed) so the package varies with
    // its inputs but is byte-identical across re-applications.
    const rng = makePrng(hashNumber(`${avatarId}:${seed}`));
    const dreamsignPoolIds = Array.from(
      { length: 8 },
      () => `ds-${String(Math.floor(rng() * 1_000_000))}`,
    );
    return {
      avatar,
      draftPoolCopiesByCard: { "1": 2, "2": 1 },
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
        ...(isTutorialJourney ? { isTutorialJourney: true } : {}),
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
        atlas: {
          layers: [[parseAtlasNodeId("node-start")]],
          nodes: {
            [parseAtlasNodeId("node-start")]: {
              id: parseAtlasNodeId("node-start"),
              layer: LayerName.One,
              indexInLayer: 0,
              dreamscapeId: testDreamscapeId("dreamscape-start"),
              sites: [],
              position: { x: 0, y: 0 },
              state: "available",
              enhancedSiteType: null,
              forwardIds: [],
              backwardIds: [],
              knownDreamsignId: null,
            },
          },
          startingNodeId: parseAtlasNodeId("node-start"),
          bossNodeId: parseAtlasNodeId("node-start"),
          bossIncarnationId: null,
          currentNodeId: parseAtlasNodeId("node-start"),
          knownDreamsignCarrierIds: [],
        },
        currentDreamscape: parseAtlasNodeId("node-start"),
        screen: { type: "dreamscape" },
      };
    },
  });
}


function hashNumber(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}


// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

export function withAtlasSite(
  journey: JourneyState,
  nodeId: AtlasNodeId,
  siteId: SiteId,
): JourneyState {
  return {
    ...journey,
    atlas: {
      ...journey.atlas,
      nodes: {
        ...journey.atlas.nodes,
        [nodeId]: {
          id: nodeId,
          layer: LayerName.One,
          indexInLayer: 0,
          dreamscapeId: null,
          sites: [
            {
              id: siteId,
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
        },
      },
    },
  };
}
