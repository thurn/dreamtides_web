import { afterEach, describe, expect, it, vi } from "vitest";

import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import type { PoolDraftState } from "../../types/draft";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { drawAndSpendUniqueCards } from "../../draft/draft-engine";
import { makeRng } from "../../draft/pool/rng";
import { LayerName } from "../../types/layer-name";
import type { DreamscapeNode, JourneyState, SiteState } from "../../types/journey";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { currentCardTutorialScreenKey } from "../card-tutorial-guidance";
import {
  registerDraftContentProvider,
  type DraftContentProvider,
} from "./draft";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const GENESIS: Genesis = {
  seed: "draft-seed",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: { poolVariant: "test", draftMode: "pool", fresh20PackSize: null },
};

function ctx(overrides: Partial<EventContext> = {}): EventContext {
  return {
    seq: 42,
    rng: () => 0,
    intervening: [],
    timestamp: "1970-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function event(
  type: string,
  payload: Record<string, unknown>,
  actor = "alice",
): GameEvent {
  return {
    type,
    payload,
    actor,
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
}

function reduce(
  state: FoldState,
  type: string,
  payload: Record<string, unknown>,
  context: EventContext = ctx(),
): ReduceResult {
  return reduceGameEvent(state, event(type, payload), context);
}

function makeCard(cardNumber: number): CardData {
  return {
    name: asCardName(`TestCard${String(cardNumber)}`),
    id: asCardId(`card-${String(cardNumber)}`),
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
function poolDraftState(overrides: Partial<PoolDraftState> = {}): PoolDraftState {
  return {
    mode: "pool",
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
    activeSiteId: "site-a",
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

const NODE_ID = "node-1";

function makeSite(id: string, type: SiteState["type"]): SiteState {
  return { id, type, isEnhanced: false, isVisited: false, data: {} };
}

function makeNode(sites: SiteState[]): DreamscapeNode {
  return {
    id: NODE_ID,
    layer: LayerName.Two,
    indexInLayer: 0,
    dreamscapeId: "d1",
    biomeName: "Biome",
    biomeColor: "#fff",
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

/** A resolver mapping each card UUID `card-<n>` back to its `cardNumber`. */
function provider(): DraftContentProvider {
  return {
    resolveCardNumber: (cardId) => {
      const match = /^card-(\d+)$/.exec(cardId);
      return match ? Number(match[1]) : null;
    },
    cardDatabase: () => CARD_DB,
    offerDepsFor: () => undefined,
    draftConfigFor: () => undefined,
  };
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
      stateWithDraft(poolDraftState()),
      "PICK_DRAFT_CARD",
      { packIndex: 0, cardId: "card-1" },
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
      runId: "run-a",
      hasSeenStartingDeckPopup: true,
      screen: { type: "site", siteId: "site-a" },
      visitedSites: ["site-b"],
    });
    const screenKey = currentCardTutorialScreenKey(before);
    expect(screenKey).not.toBeNull();
    const start: FoldState = {
      ...before,
      cardTutorialPresentation: {
        id: "card-tutorial:fixture",
        screenKey: screenKey!,
        cardId: "card-1",
        triggerId: "support",
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
      cardId: "card-1",
    });

    expect(result.outcome).toBe("applied");
    expect(result.state.journey.draftState?.pickNumber).toBe(2);
    expect(result.state.cardTutorialPresentation).toBeNull();
  });

  it("bounces a pick whose card is not at the given pack position", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraft(poolDraftState());
    // packIndex 0 holds card 1, not card 3 — the pack membership guard bounces.
    const result = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: "card-3",
    });

    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });

  it("bounces a pick for a card entirely absent from the offered pack", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraft(poolDraftState());
    const result = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: "card-8",
    });

    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });

  it("bounces a second pick against the same pack position (double-pick race)", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraft(poolDraftState());

    const first = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: "card-1",
    });
    expect(first.outcome).toBe("applied");

    // A duplicate click replays the same intent against the post-pick state.
    // The offer has advanced, so pack position 0 no longer holds card 1: bounce
    // instead of drafting a second card.
    const second = reduce(first.state, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: "card-1",
    });
    expect(second.outcome).toBe("bounced");
    expect(second.state).toEqual(first.state);
  });

  it("bounces when no draft state is present", () => {
    registerDraftContentProvider(provider());
    const start = genesisFoldState(GENESIS);
    const result = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: "card-1",
    });
    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });

  it("bounces when no content provider is registered", () => {
    const start = stateWithDraft(poolDraftState());
    const result = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: "card-1",
    });
    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });

  it("is deterministic: same seed + seq fold to identical state", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraft(poolDraftState());
    const context = ctx({ seq: 9, rng: makeRng(9) });

    const a = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: "card-1",
    }, context);
    const b = reduce(start, "PICK_DRAFT_CARD", {
      packIndex: 0,
      cardId: "card-1",
    }, ctx({ seq: 9, rng: makeRng(9) }));

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

    const result = reduce(start, "REROLL_DRAFT_OFFER", { siteId: "site-a" });

    expect(result.outcome).toBe("applied");
    const draft = result.state.journey.draftState as PoolDraftState;
    expect(draft.pickNumber).toBe(1);
    expect(draft.sitePicksCompleted).toBe(0);
    expect(result.state.journey.deck).toEqual(start.journey.deck);
    expect(draft.currentOffer).toEqual([5, 6, 7, 8]);
    expect(draft.siteShownCardNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("bounces when the requested site is not the active draft site", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState());

    const result = reduce(start, "REROLL_DRAFT_OFFER", { siteId: "site-b" });

    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });
});

// ---------------------------------------------------------------------------
// ENTER_DRAFT_SITE
// ---------------------------------------------------------------------------

describe("ENTER_DRAFT_SITE", () => {
  it("activates the site and reveals a non-empty offer from ctx.rng", () => {
    registerDraftContentProvider(provider());
    const draftState = poolDraftState({
      activeSiteId: null,
      currentOffer: [],
      siteShownCardNumbers: [],
    });
    const start = stateWithDraftSites(draftState);

    const result = reduce(start, "ENTER_DRAFT_SITE", { siteId: "site-a" }, ctx({ rng: makeRng(3) }));

    expect(result.outcome).toBe("applied");
    const next = result.state.journey.draftState as PoolDraftState;
    expect(next.activeSiteId).toBe("site-a");
    expect(next.currentOffer.length).toBeGreaterThan(0);
  });

  it("bounces with zero rng draws when the site is already active", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState());
    const rngSpy = vi.fn(() => 0);

    const result = reduce(start, "ENTER_DRAFT_SITE", { siteId: "site-a" }, ctx({ rng: rngSpy }));

    expect(result.outcome).toBe("bounced");
    expect(result.state.journey).toBe(start.journey);
    expect(rngSpy).not.toHaveBeenCalled();
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
      { siteId: "site-a" },
      ctx({ seq: 1, rng: makeRng(1) }),
    );
    expect(soloResult.outcome).toBe("applied");

    const firstResult = reduce(
      start,
      "ENTER_DRAFT_SITE",
      { siteId: "site-a" },
      ctx({ seq: 1, rng: makeRng(1) }),
    );
    const secondResult = reduce(
      firstResult.state,
      "ENTER_DRAFT_SITE",
      { siteId: "site-a" },
      ctx({ seq: 2, rng: makeRng(2) }),
    );

    expect(firstResult.outcome).toBe("applied");
    expect(secondResult.outcome).toBe("bounced");
    expect(secondResult.state.journey).toBe(firstResult.state.journey);
    expect(secondResult.state).toEqual(soloResult.state);
  });

  it("bounces without a provider", () => {
    const start = stateWithDraftSites(poolDraftState({ activeSiteId: null }));
    const result = reduce(start, "ENTER_DRAFT_SITE", { siteId: "site-b" });
    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });

  it("bounces with a null draftState", () => {
    registerDraftContentProvider(provider());
    const start = genesisFoldState(GENESIS);
    const result = reduce(start, "ENTER_DRAFT_SITE", { siteId: "site-a" });
    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });

  it("bounces for a non-draft site", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState({ activeSiteId: null }));
    const result = reduce(start, "ENTER_DRAFT_SITE", { siteId: "site-battle" });
    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });

  it("bounces for an unknown site id", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState({ activeSiteId: null }));
    const result = reduce(start, "ENTER_DRAFT_SITE", { siteId: "site-nowhere" });
    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });

  it("bounces a malformed payload", () => {
    registerDraftContentProvider(provider());
    const start = stateWithDraftSites(poolDraftState({ activeSiteId: null }));
    const result = reduce(start, "ENTER_DRAFT_SITE", {});
    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
  });
});

// ---------------------------------------------------------------------------
// SET_DRAFT_STATE
// ---------------------------------------------------------------------------

describe("SET_DRAFT_STATE", () => {
  it("replaces the draft state (debug edit)", () => {
    const start = stateWithDraft(poolDraftState());
    const replacement = poolDraftState({
      activeSiteId: "site-z",
      pickNumber: 5,
      currentOffer: [6, 7, 8],
    });
    const result = reduce(start, "SET_DRAFT_STATE", {
      draftState: replacement,
    });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.draftState).toEqual(replacement);
  });

  it("clears the draft state when passed null", () => {
    const start = stateWithDraft(poolDraftState());
    const result = reduce(start, "SET_DRAFT_STATE", { draftState: null });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.draftState).toBeNull();
  });

  it("bounces a malformed (non-object) draft state", () => {
    const start = stateWithDraft(poolDraftState());
    const result = reduce(start, "SET_DRAFT_STATE", { draftState: 5 });
    expect(result.outcome).toBe("bounced");
    expect(result.state).toEqual(start);
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

  it("produces the same sample for the same rng stream", () => {
    const a = structuredClone(samplePool());
    const b = structuredClone(samplePool());
    const drawnA = drawAndSpendUniqueCards(a, 4, undefined, undefined, makeRng(7));
    const drawnB = drawAndSpendUniqueCards(b, 4, undefined, undefined, makeRng(7));
    expect(drawnA).toEqual(drawnB);
    expect(drawnA).toHaveLength(4);
  });

  it("threads the injected rng rather than reading ambient randomness", () => {
    // A fixed rng of 0 makes weightedSample take the first cumulative entry each
    // iteration, so the draw is fully determined by the injected source.
    const state = structuredClone(samplePool());
    const drawn = drawAndSpendUniqueCards(state, 4, undefined, undefined, () => 0);
    expect(new Set(drawn).size).toBe(4);
  });
});
