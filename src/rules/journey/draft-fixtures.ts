import { testJourneySeed } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import type { PoolDraftState } from "../../types/draft";
import type { CardData } from "../../types/cards";
import { parseCardName, type CardId } from "../../types/card-identity";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode, JourneyState, SiteState } from "../../types/journey";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { type DraftContentProvider } from "./draft";
import { testDraftContentProvider } from "./test-content-providers";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { testCardId, testDreamscapeId } from "../../types/test-identities";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";



// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: testJourneySeed("draft-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
};


export function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    contentConfig: TEST_CONTENT_CONFIG,
    seq: 42,
    rng: () => 0,
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


function makeCard(cardNumber: number): CardData {
  return {
    name: parseCardName(`TestCard${String(cardNumber)}`),
    id: testCardId(`card-${String(cardNumber)}`),
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 3,
    spark: 1,
    isFast: false,
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: false,
  };
}


/**
 * Eight single-copy cards (1..8). The current offer shows cards 1..4 (already
 * spent from the multiset and recorded as shown), so a pick advances the draft
 * to a fresh offer drawn from the remaining {5,6,7,8}.
 */
export function poolDraftState(
  overrides: Partial<PoolDraftState> = {},
): PoolDraftState {
  return {
    mode: "tides4",
    draftPoolCopiesByCard: {
      "1": 1,
      "2": 1,
      "3": 1,
      "4": 1,
      "5": 1,
      "6": 1,
      "7": 1,
      "8": 1,
    },
    remainingCopiesByCard: { "5": 1, "6": 1, "7": 1, "8": 1 },
    currentOffer: [1, 2, 3, 4],
    activeSiteId: parseSiteId("site-a"),
    pickNumber: 1,
    sitePicksCompleted: 0,
    siteShownCardNumbers: [1, 2, 3, 4],
    ...overrides,
  };
}


export function stateWithDraft(draftState: PoolDraftState): FoldState {
  const base = genesisFoldState(GENESIS);
  return { ...base, journey: { ...base.journey, draftState } };
}


export const NODE_ID = parseAtlasNodeId("node-1");


export function makeSite(idSeed: string, type: SiteState["type"]): SiteState {
  return {
    id: parseSiteId(idSeed),
    type,
    isEnhanced: false,
    isVisited: false,
  };
}


export function makeNode(sites: SiteState[]): DreamscapeNode {
  return {
    id: NODE_ID,
    layer: LayerName.One,
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
 * `stateWithDraft` plus an atlas node holding `"site-a"` (a `Draft` site
 * matching `poolDraftState()`'s `activeSiteId`), `"site-b"` (a second `Draft`
 * site not yet active), and `"site-battle"` (a non-Draft site) — the fixture
 * `ENTER_DRAFT_SITE` needs to validate `findSite`/site-type bouncing.
 */
export function stateWithDraftSites(
  draftState: PoolDraftState,
  overrides: Partial<JourneyState> = {},
): FoldState {
  const base = stateWithDraft(draftState);
  return {
    ...base,
    journey: {
      ...base.journey,
      atlas: {
        ...base.journey.atlas,
        nodes: {
          [NODE_ID]: makeNode([
            makeSite("site-a", "Draft"),
            makeSite("site-b", "Draft"),
            makeSite("site-battle", "Battle"),
          ]),
        },
        startingNodeId: NODE_ID,
        currentNodeId: NODE_ID,
      },
      currentDreamscape: NODE_ID,
      ...overrides,
    },
  };
}


const CARD_DB = new Map<number, CardData>(
  Array.from({ length: 8 }, (_, index) => {
    const card = makeCard(index + 1);
    return [card.cardNumber, card] as const;
  }),
);


const CARD_NUMBER_BY_ID = new Map(
  [...CARD_DB.values()].map((card) => [card.id, card.cardNumber] as const),
);


export function cardIdForNumber(cardNumber: number): CardId {
  const card = CARD_DB.get(cardNumber);
  if (card === undefined) {
    throw new Error(`Missing synthetic card number ${String(cardNumber)}`);
  }
  return card.id;
}


/** Resolves the branded UUID already carried by each synthetic catalog card. */
export function provider(): DraftContentProvider {
  return testDraftContentProvider({
    resolveCardNumber: (cardId) => CARD_NUMBER_BY_ID.get(cardId) ?? null,
    cardDatabase: () => CARD_DB,
    draftConfigFor: () => ({
      packSize: 4,
      sitePickCount: 5,
      rarityCaps: [],
    }),
    transfigurationForCard: () => "Empowered",
  });
}
