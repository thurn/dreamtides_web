import { testJourneySeed } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import { LayerName } from "../../types/layer-name";
import type { DeckEntry, Dreamsign, DreamscapeNode, JourneyState, SiteRuntimeState, SiteState, SiteType } from "../../types/journey";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { testSiteContentProvider } from "./test-content-providers";
import { parseDeckEntryId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parseShuffleCommitment } from "../../types/identifiers";
import { testDreamscapeId, testDreamsignId } from "../../types/test-identities";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { testGambleSelectionTrace } from "../../testing/gamble-fixture";



// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: testJourneySeed("sites-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};


/** A deterministic PRNG bound to a seed so a generation draw is reproducible. */
function makeRng(seed: number): (drawIndex: number) => number {
  return (drawIndex: number) => {
    let x = (seed + drawIndex * 2654435761) >>> 0;
    x ^= x << 13;
    x >>>= 0;
    x ^= x >> 17;
    x ^= x << 5;
    x >>>= 0;
    return x / 0x1_0000_0000;
  };
}


function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    contentConfig: TEST_CONTENT_CONFIG,
    seq: 42,
    rng: makeRng(1),
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}


function event(
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


export function reduce(
  state: FoldState,
  type: GameEvent["type"],
  payload: Record<string, unknown>,
  context: EventContext = ctx(),
): ReduceResult {
  return reduceGameEvent(state, event(type, payload), context);
}


export function makeEntry(
  overrides: Partial<DeckEntry> & { entryId: DeckEntryId },
): DeckEntry {
  return {
    cardNumber: 1,
    transfiguration: null,
    isBane: false,
    ...overrides,
  };
}


export function dreamsign(idSeed: string): Dreamsign {
  return { id: testDreamsignId(idSeed), name: "n", effectDescription: "e" };
}


export const SITE_ID = parseSiteId("site-1");

export const NODE_ID = parseAtlasNodeId("node-1");


export function makeSite(type: SiteType, isEnhanced = false): SiteState {
  return {
    id: SITE_ID,
    type,
    isEnhanced,
    isVisited: false,
  };
}


function makeNode(sites: SiteState[]): DreamscapeNode {
  return {
    id: NODE_ID,
    layer: LayerName.Two,
    indexInLayer: 0,
    dreamscapeId: testDreamscapeId("d1"),
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
 * A journey state with one dreamscape node holding `sites`, the player standing
 * in that node so `canVisitSite` passes for a non-Battle site.
 */
export function stateWithSites(
  sites: SiteState[],
  overrides: Partial<JourneyState> = {},
): FoldState {
  const base = genesisFoldState(GENESIS);
  return {
    ...base,
    journey: {
      ...base.journey,
      currentDreamscape: NODE_ID,
      atlas: {
        ...base.journey.atlas,
        nodes: { [NODE_ID]: makeNode(sites) },
        startingNodeId: NODE_ID,
        currentNodeId: NODE_ID,
      },
      screen: { type: "site", siteId: SITE_ID },
      ...overrides,
    },
  };
}


export function siteState(
  type: SiteType,
  overrides: Partial<JourneyState> = {},
): FoldState {
  return stateWithSites([makeSite(type)], overrides);
}


/**
 * A deterministic fake {@link SiteContentProvider} whose runtime embeds an
 * rng-derived value so re-folding the same event yields a byte-identical
 * runtime and a fresh seq yields a different one. Content-free types
 * (RandomSite, Essence) are generated purely in-reducer and never reach this
 * provider.
 */
export const fakeProvider = testSiteContentProvider({
  openSite({ site, rng }) {
    const draw = Math.floor(rng(0) * 1_000_000);
    switch (site.type) {
      case "Reward":
        return {
          runtime: {
            kind: "reward",
            reward: { rewardType: "essence", essenceAmount: draw },
            remainingDreamsignPoolIds: [testDreamsignId(`pool-${String(draw)}`)],
            accepted: false,
          },
          remainingDreamsignPool: [testDreamsignId(`pool-${String(draw)}`)],
        };
      case "DreamsignRevelation":
        return {
          runtime: {
            kind: "dreamsignOffer",
            offeredDreamsigns: [dreamsign(`ds-${String(draw)}`)],
            remainingDreamsignPool: [testDreamsignId(`pool-${String(draw)}`)],
            accepted: false,
          },
          remainingDreamsignPool: [testDreamsignId(`pool-${String(draw)}`)],
        };
      case "Shop":
      case "DreamsignBazaar":
        return {
          runtime: {
            kind: "shop",
            slots: [
              {
                itemType: "card",
                cardNumber: draw,
                basePrice: 100,
                discountPercent: 0,
                purchased: false,
              },
            ],
            rerollCount: 0,
            remainingDreamsignPoolIds: [],
            purchaseHistory: [],
          },
        };
      case "Transfiguration":
        return {
          runtime: {
            kind: "cardChoice",
            choiceKind: "transfiguration",
            entryIds: [parseDeckEntryId("deck-1")],
            acceptedEntryIds: [],
            transfigurationOffers: [
              {
                entryId: parseDeckEntryId("deck-1"),
                type: "Empowered",
                effectDetails: { draw },
                previewCard: {} as never,
                essenceCost: 50,
              },
            ],
          },
        };
      case "Duplication":
        return {
          runtime: {
            kind: "cardChoice",
            choiceKind: "duplication",
            entryIds: [parseDeckEntryId("deck-1")],
            acceptedEntryIds: [],
          },
        };
      case "Gamble":
        return {
          runtime: {
            kind: "gamble",
            gameId: "gravok-three-gate-wager",
            selectionTrace: testGambleSelectionTrace("gravok-three-gate-wager"),
            roundNumber: 1,
            isFarpoint: site.isEnhanced,
            wagerCost: site.isEnhanced ? 0 : 50,
            shuffleCommitment: parseShuffleCommitment(`fixture-${String(draw)}`),
            committedCard: { rank: "7", suit: "clubs" },
            dreamsignCandidateIds: [],
            rewardDreamsign: null,
            result: null,
          },
        };
      default:
        return null;
    }
  },
});


export function runtimeOf(result: ReduceResult): SiteRuntimeState | undefined {
  return result.state.journey.siteRuntime[SITE_ID];
}
