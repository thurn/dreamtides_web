import { testJourneySeed } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import type { EventContext, GameEvent } from "../../eventlog/types";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode, JourneyState, RuntimeShopSlot, ShopModifiers, ShopSiteRuntime, SiteState, SiteType } from "../../types/journey";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { type ShopRerollResult } from "./sites";
import { testSiteContentProvider } from "./test-content-providers";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { testDreamscapeId, testDreamsignId } from "../../types/test-identities";
import type { Genesis } from "../../eventlog/types";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";



// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS = {
  seed: testJourneySeed("shop-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
} satisfies Genesis;

export const SITE_ID = parseSiteId("site-1");

export const NODE_ID = parseAtlasNodeId("node-1");


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


export function ctx(overrides: Partial<EventContext> = {}): EventContext {
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


export function makeSite(
  type: SiteType,
  overrides: Partial<SiteState> = {},
): SiteState {
  return {
    id: SITE_ID,
    type,
    isEnhanced: false,
    isVisited: false,
    ...overrides,
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


export function cardSlot(
  overrides: Partial<Extract<RuntimeShopSlot, { itemType: "card" }>> = {},
): RuntimeShopSlot {
  return {
    itemType: "card",
    cardNumber: 7,
    basePrice: 100,
    discountPercent: 0,
    purchased: false,
    ...overrides,
  };
}


export function dreamsignSlot(
  idSeed: string,
  overrides: Partial<Extract<RuntimeShopSlot, { itemType: "dreamsign" }>> = {},
): RuntimeShopSlot {
  return {
    itemType: "dreamsign",
    dreamsign: {
      id: testDreamsignId(idSeed),
      name: `Dreamsign ${idSeed}`,
      effectDescription: `Effect ${idSeed}`,
    },
    basePrice: 100,
    discountPercent: 0,
    purchased: false,
    ...overrides,
  };
}


export function shopRuntime(slots: RuntimeShopSlot[]): ShopSiteRuntime {
  return {
    kind: "shop",
    slots,
    rerollCount: 0,
    remainingDreamsignPoolIds: [],
    purchaseHistory: [],
  };
}


export function shopModifiers(overrides: Partial<ShopModifiers> = {}): ShopModifiers {
  return {
    freeRerolls: 0,
    essenceDiscountPercent: 0,
    freeNextShopModifiers: [],
    freePurchaseModifiers: [],
    ...overrides,
  };
}


/** Journey state standing in a dreamscape node holding `sites`. */
export function stateWith(
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


/** A shop state with `slots`, plus any journey overrides (essence, modifiers). */
export function shopState(
  slots: RuntimeShopSlot[],
  overrides: Partial<JourneyState> = {},
  siteType: "Shop" | "DreamsignBazaar" = "Shop",
): FoldState {
  return stateWith([makeSite(siteType)], {
    siteRuntime: { [SITE_ID]: shopRuntime(slots) },
    ...overrides,
  });
}


/** A provider that regenerates a shop with a single deterministic card slot. */
export const rerollProvider = testSiteContentProvider({
  rerollShop({ rng }): ShopRerollResult {
    const draw = Math.floor(rng(0) * 1_000_000);
    return {
      slots: [cardSlot({ cardNumber: draw })],
      remainingDreamsignPoolIds: [testDreamsignId(`pool-${String(draw)}`)],
      remainingDreamsignPool: [testDreamsignId(`pool-${String(draw)}`)],
      draftState: null,
    };
  },
});
