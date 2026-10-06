import { testJourneySeed } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import { afterEach, describe, expect, it } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import type { PoolDraftState } from "../../types/draft";
import type { CardData } from "../../types/cards";
import { parseCardName, type CardId } from "../../types/card-identity";
import { drawAndSpendUniqueCards } from "../../draft/draft-engine";
import { makeRng } from "../../draft/pool/rng";
import { LayerName } from "../../types/layer-name";
import type {
  DreamscapeNode,
  JourneyState,
  SiteState,
} from "../../types/journey";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { currentCardTutorialScreenKey } from "../card-tutorial-guidance";
import {
  registerDraftContentProvider,
  type DraftContentProvider,
} from "./draft";
import { testDraftContentProvider } from "./test-content-providers";
import { parseJourneyId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { parsePresentationId } from "../../types/identifiers";
import { testCardId, testDreamscapeId, testExplorationActionId, testTutorialTriggerId } from "../../types/test-identities";
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

function ctx(overrides: Partial<EventContext> = {}): EventContext {
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

function reduce(
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
function poolDraftState(
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

function stateWithDraft(draftState: PoolDraftState): FoldState {
  const base = genesisFoldState(GENESIS);
  return { ...base, journey: { ...base.journey, draftState } };
}

const NODE_ID = parseAtlasNodeId("node-1");

function makeSite(idSeed: string, type: SiteState["type"]): SiteState {
  return {
    id: parseSiteId(idSeed),
    type,
    isEnhanced: false,
    isVisited: false,
    data: {},
  };
}

function makeNode(sites: SiteState[]): DreamscapeNode {
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
function stateWithDraftSites(
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

function cardIdForNumber(cardNumber: number): CardId {
  const card = CARD_DB.get(cardNumber);
  if (card === undefined) {
    throw new Error(`Missing synthetic card number ${String(cardNumber)}`);
  }
  return card.id;
}

/** Resolves the branded UUID already carried by each synthetic catalog card. */
function provider(): DraftContentProvider {
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

afterEach(() => {
  registerDraftContentProvider(null);
});

// ---------------------------------------------------------------------------
// PICK_DRAFT_CARD
// ---------------------------------------------------------------------------

describe("PICK_DRAFT_CARD", () => {
  it("applies a pick that matches the pack position, advancing the draft", () => {
    registerDraftContentProvider(provider());
    const result = reduce(
      stateWithDraftSites(poolDraftState()),
      "PICK_DRAFT_CARD",
      { packIndex: 0, cardId: cardIdForNumber(1) },
    );

    expect(result.outcome).toBe("applied");
    const draft = result.state.journey.draftState as PoolDraftState;
    // The picked card joined the deck.
    expect(result.state.journey.deck.map((e) => e.cardNumber)).toContain(1);
    // The draft advanced: pick counter incremented and a fresh offer revealed
    // from the remaining {5,6,7,8}, with none of the already-shown 1..4.
    expect(draft.pickNumber).toBe(2);
    expect(draft.sitePicksCompleted).toBe(1);
    for (const cardNumber of draft.currentOffer) {
      expect([1, 2, 3, 4]).not.toContain(cardNumber);
    }
  });

  it("retires guidance with the offer while applying the selected card", () => {
    registerDraftContentProvider(provider());
    const before = stateWithDraftSites(poolDraftState(), {
      runId: parseJourneyId("run-a"),
      hasSeenStartingDeckPopup: true,
      screen: { type: "site", siteId: parseSiteId("site-a") },
      activeSiteId: parseSiteId("site-a"),
      visitedSites: [parseSiteId("site-b")],
    });
    const screenKey = currentCardTutorialScreenKey(before);
    expect(screenKey).not.toBeNull();
    const start: FoldState = {
      ...before,
      cardTutorialPresentation: {
        id: parsePresentationId("card-tutorial:fixture"),
        screenKey: screenKey!,
        cardId: cardIdForNumber(1),
        triggerId: testTutorialTriggerId("support"),
        speaker: "mira",
        text: "Support explained.",
        duration: 4,
        horizontalOffset: 0,
        verticalOffset: 0,
        bubbleWidth: 500,
      },
    };

    const result = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: cardIdForNumber(1),
    });

    expect(result.outcome).toBe("applied");
    expect(result.state.journey.draftState?.pickNumber).toBe(2);
    expect(result.state.cardTutorialPresentation).toBeNull();
  });

  it("bounces a pick for a card entirely absent from the offered pack", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState());
    const result = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: cardIdForNumber(8),
    });

    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });

  it("is deterministic: same seed + seq fold to identical state", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState());
    const context = ctx({ seq: 9, rng: makeRng(9) });

    const a = reduce(
      start,
      "PICK_DRAFT_CARD",
      {
        packIndex: 0,
        cardId: cardIdForNumber(1),
      },
      context,
    );
    const b = reduce(
      start,
      "PICK_DRAFT_CARD",
      {
        packIndex: 0,
        cardId: cardIdForNumber(1),
      },
      ctx({ seq: 9, rng: makeRng(9) }),
    );

    expect(a.outcome).toBe("applied");
    expect(b.outcome).toBe("applied");
    expect(a.state).toEqual(b.state);
  });
});

// ---------------------------------------------------------------------------
// REROLL_DRAFT_OFFER
// ---------------------------------------------------------------------------

describe("REROLL_DRAFT_OFFER", () => {
  it("replaces the active pack without advancing the pick or changing the deck", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState());

    const result = reduce(start, "REROLL_DRAFT_OFFER", {
      siteId: parseSiteId("site-a"),
    });

    expect(result.outcome).toBe("applied");
    const draft = result.state.journey.draftState as PoolDraftState;
    expect(draft.pickNumber).toBe(1);
    expect(draft.sitePicksCompleted).toBe(0);
    expect(result.state.journey.deck).toEqual(start.journey.deck);
    expect(draft.currentOffer).toEqual([5, 6, 7, 8]);
    expect(draft.siteShownCardNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

// ---------------------------------------------------------------------------
// ENTER_DRAFT_SITE
// ---------------------------------------------------------------------------

describe("ENTER_DRAFT_SITE", () => {
  it("consumes the one-use modifier and persists exact forms across the Draft visit", () => {
    registerDraftContentProvider(provider());
    const source = {
      kind: "transfigure-next-draft-or-shop" as const,
      sourceSiteId: parseSiteId("exploration-site"),
      sourceActionId: testExplorationActionId("exploration-action"),
    };
    const start = stateWithDraftSites(
      poolDraftState({
        activeSiteId: null,
        currentOffer: [],
        siteShownCardNumbers: [],
      }),
      { siteOfferModifiers: [source] },
    );

    const entered = reduce(
      start,
      "ENTER_DRAFT_SITE",
      { siteId: parseSiteId("site-a") },
      ctx({ seq: 14, rng: makeRng(14) }),
    );

    expect(entered.outcome).toBe("applied");
    const active = entered.state.journey.draftState as PoolDraftState;
    expect(entered.state.journey.siteOfferModifiers).toEqual([]);
    expect(active.transfiguredOfferSource).toEqual({
      siteId: source.sourceSiteId,
      actionId: source.sourceActionId,
    });
    expect(active.currentOfferTransfigurations).toEqual(
      Object.fromEntries(
        active.currentOffer.map((cardNumber) => [
          String(cardNumber),
          "Empowered",
        ]),
      ),
    );

    const pickedNumber = active.currentOffer[0];
    if (pickedNumber === undefined) throw new Error("Expected a Draft offer");
    const picked = reduce(
      entered.state,
      "PICK_DRAFT_CARD",
      { packIndex: 0, cardId: cardIdForNumber(pickedNumber) },
      ctx({ seq: 15, rng: makeRng(15) }),
    );
    expect(picked.outcome).toBe("applied");
    expect(
      picked.state.journey.deck[picked.state.journey.deck.length - 1]
        ?.transfiguration,
    ).toBe("Empowered");
    const advanced = picked.state.journey.draftState as PoolDraftState;
    expect(advanced.transfiguredOfferSource).toEqual(
      active.transfiguredOfferSource,
    );
    expect(Object.values(advanced.currentOfferTransfigurations ?? {})).toEqual(
      advanced.currentOffer.map(() => "Empowered"),
    );
  });

  it("activates the site and reveals a non-empty offer from ctx.rng", () => {
    registerDraftContentProvider(provider());
    const draftState = poolDraftState({
      activeSiteId: null,
      currentOffer: [],
      siteShownCardNumbers: [],
    });
    const start = stateWithDraftSites(draftState);

    const result = reduce(
      start,
      "ENTER_DRAFT_SITE",
      { siteId: parseSiteId("site-a") },
      ctx({ rng: makeRng(3) }),
    );

    expect(result.outcome).toBe("applied");
    const next = result.state.journey.draftState as PoolDraftState;
    expect(next.activeSiteId).toBe("site-a");
    expect(next.currentOffer.length).toBeGreaterThan(0);
  });

  it("converges if a repeated entry reaches the reducer after the winning entry", () => {
    registerDraftContentProvider(provider());
    const draftState = poolDraftState({
      activeSiteId: null,
      currentOffer: [],
      siteShownCardNumbers: [],
    });
    const start = stateWithDraftSites(draftState);

    const soloResult = reduce(
      start,
      "ENTER_DRAFT_SITE",
      { siteId: parseSiteId("site-a") },
      ctx({ seq: 1, rng: makeRng(1) }),
    );
    expect(soloResult.outcome).toBe("applied");

    const firstResult = reduce(
      start,
      "ENTER_DRAFT_SITE",
      { siteId: parseSiteId("site-a") },
      ctx({ seq: 1, rng: makeRng(1) }),
    );
    const secondResult = reduce(
      firstResult.state,
      "ENTER_DRAFT_SITE",
      { siteId: parseSiteId("site-a") },
      ctx({ seq: 2, rng: makeRng(2) }),
    );

    expect(firstResult.outcome).toBe("applied");
    expect(secondResult.outcome).toBe("bounced");
    expect(secondResult.state.journey).toBe(firstResult.state.journey);
    expect(secondResult.state).toEqual(soloResult.state);
  });
});

// ---------------------------------------------------------------------------
// SET_DRAFT_STATE
// ---------------------------------------------------------------------------

describe("SET_DRAFT_STATE", () => {
  it("replaces the draft state (debug edit)", () => {
    const start = stateWithDraft(poolDraftState());
    const replacement = poolDraftState({
      activeSiteId: parseSiteId("site-z"),
      pickNumber: 5,
      currentOffer: [6, 7, 8],
    });
    const result = reduce(start, "SET_DRAFT_STATE", {
      draftState: replacement,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.draftState).toEqual(replacement);
  });
});

// ---------------------------------------------------------------------------
// weightedSample injected-rng contract (exercised via drawAndSpendUniqueCards)
// ---------------------------------------------------------------------------

describe("draft-engine injected rng", () => {
  function samplePool(): PoolDraftState {
    return poolDraftState({
      remainingCopiesByCard: {
        "1": 2,
        "2": 2,
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
      },
    });
  }

  it("threads the injected rng rather than reading ambient randomness", () => {
    // A fixed rng of 0 makes weightedSample take the first cumulative entry each
    // iteration, so the draw is fully determined by the injected source.
    const state = structuredClone(samplePool());
    const drawn = drawAndSpendUniqueCards(
      state,
      4,
      undefined,
      undefined,
      () => 0,
    );
    expect(new Set(drawn).size).toBe(4);
  });
});
