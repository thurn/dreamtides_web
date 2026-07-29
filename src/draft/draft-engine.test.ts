import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../logging";
import type { CardData } from "../types/cards";
import { asCardId, asCardName } from "../types/card-identity";
import type { PoolDraftState } from "../types/draft";
import type { ResolvedDreamAvatarPackage } from "../types/content";
import type { FitModel } from "./replay/fit-model";
import {
  completeDraftSite,
  createInitialFresh20DraftState,
  createInitialReplayDraftState,
  drawAndSpendUniqueCards,
  enterDraftSite,
  getCurrentOffer,
  initializeDraftState,
  processPlayerPick,
  type ReplayDeps,
  SITE_PICKS,
} from "./draft-engine";
import {
  FRESH20_COOLDOWN_PICKS,
  type Fresh20Deps,
} from "./fresh20/fresh20-offer";

function makeCard(
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return {
    name: asCardName(`TestCard${String(cardNumber)}`),
    id: asCardId(`test-${String(cardNumber)}`),
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
    ...overrides,
  };
}

function buildDB(cards: CardData[]): Map<number, CardData> {
  return new Map(cards.map((card) => [card.cardNumber, card]));
}

function buildResolvedPackage(
  copiesByCard: Record<number, number>,
): ResolvedDreamAvatarPackage {
  return {
    dreamAvatar: {
      id: "test-dream-avatar",
      name: "Test DreamAvatar",
      title: "Draft Architect",
      renderedText: "Test rules text.",
      imageNumber: "0003",
      startingEssence: 250,
    },
    draftPoolCopiesByCard: Object.fromEntries(
      Object.entries(copiesByCard).map(([cardNumber, copies]) => [
        cardNumber,
        copies,
      ]),
    ),
    dreamsignPoolIds: [],
    mandatoryOnlyPoolSize: 120,
    draftPoolSize: Object.values(copiesByCard).reduce(
      (total, copies) => total + copies,
      0,
    ),
    doubledCardCount: Object.values(copiesByCard).filter((copies) => copies === 2)
      .length,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
  };
}

function makeDraftState(
  overrides: Partial<PoolDraftState> = {},
): PoolDraftState {
  const base: PoolDraftState = {
    mode: "pool",
    draftPoolCopiesByCard: {},
    remainingCopiesByCard: {},
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
    siteShownCardNumbers: [],
    ...overrides,
  };
  // Default the immutable run pool to a copy of the remaining copies when a
  // test only specifies the latter.
  if (overrides.draftPoolCopiesByCard === undefined) {
    base.draftPoolCopiesByCard = { ...base.remainingCopiesByCard };
  }
  return base;
}

beforeEach(() => {
  resetLog();
  vi.restoreAllMocks();
});

describe("initializeDraftState", () => {
  it("creates state from the resolved package pool", () => {
    const cardDatabase = buildDB([
      makeCard(1),
      makeCard(2),
      makeCard(3),
    ]);

    const state = initializeDraftState(
      cardDatabase,
      buildResolvedPackage({ 1: 2, 2: 1, 999: 3 }),
    );

    expect(state.remainingCopiesByCard).toEqual({
      "1": 2,
      "2": 1,
    });
    expect(state.currentOffer).toEqual([]);
    expect(state.activeSiteId).toBeNull();
    expect(state.pickNumber).toBe(1);
    expect(state.sitePicksCompleted).toBe(0);
  });

  it("logs pool initialization", () => {
    const cardDatabase = buildDB([
      makeCard(1),
      makeCard(2),
      makeCard(3),
      makeCard(4),
    ]);

    initializeDraftState(
      cardDatabase,
      buildResolvedPackage({ 1: 1, 2: 1, 3: 1, 4: 1 }),
    );

    const initEvent = getLogEntries().find(
      (entry) => entry.event === "draft_pool_initialized",
    );
    expect(initEvent).toBeDefined();
    expect(initEvent?.poolSize).toBe(4);
    expect(initEvent?.uniqueCardCount).toBe(4);
  });
});

describe("fixed multiset offer generation", () => {
  it("reveals 4 unique cards and spends one copy of each shown card immediately", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 6 }, (_, index) => makeCard(index + 1)),
    );
    const state = initializeDraftState(
      cardDatabase,
      buildResolvedPackage({ 1: 2, 2: 1, 3: 1, 4: 1, 5: 1, 6: 1 }),
    );

    vi.spyOn(Math, "random").mockReturnValue(0);

    enterDraftSite(state, "site-a", cardDatabase);

    expect(getCurrentOffer(state)).toHaveLength(4);
    expect(new Set(getCurrentOffer(state)).size).toBe(4);
    expect(state.activeSiteId).toBe("site-a");
    expect(state.remainingCopiesByCard).toEqual({
      "1": 1,
      "5": 1,
      "6": 1,
    });
  });

  it("presents authored opening offers for the first two journey picks", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 12 }, (_, index) => makeCard(index + 1)),
    );
    const resolvedPackage = {
      ...buildResolvedPackage(
        Object.fromEntries(
          Array.from({ length: 12 }, (_, index) => [index + 1, 1]),
        ),
      ),
      openingDraftOffers: {
        "1": [8, 6, 4, 2],
        "2": [7, 5, 3, 1],
      },
    };
    const state = initializeDraftState(cardDatabase, resolvedPackage);

    enterDraftSite(state, "site-a", cardDatabase, undefined, undefined, () => 0);
    expect(state.currentOffer).toEqual([8, 6, 4, 2]);

    processPlayerPick(8, state, cardDatabase, undefined, undefined, () => 0);
    expect(state.currentOffer).toEqual([7, 5, 3, 1]);
    expect(
      getLogEntries()
        .filter((entry) => entry.event === "draft_offer_revealed")
        .map((entry) => entry.source),
    ).toEqual(["authored_opening", "authored_opening"]);

    processPlayerPick(7, state, cardDatabase, undefined, undefined, () => 0);
    expect(state.currentOffer).toEqual([9, 10, 11, 12]);
    const revealedOffers = getLogEntries().filter(
      (entry) => entry.event === "draft_offer_revealed",
    );
    expect(revealedOffers[revealedOffers.length - 1]?.source).toBe(
      "weighted_pool",
    );
  });

  it("samples names proportionally to remaining copies", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 5 }, (_, index) => makeCard(index + 1)),
    );
    const state = makeDraftState({
      remainingCopiesByCard: {
        "1": 2,
        "2": 1,
        "3": 1,
        "4": 1,
        "5": 1,
      },
    });

    vi.spyOn(Math, "random")
      .mockReturnValueOnce(0.32)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    enterDraftSite(state, "site-a", cardDatabase);

    expect(state.currentOffer[0]).toBe(1);
  });

  it("never offers the same card twice within a single site visit", () => {
    // Ten unique cards, one copy each: more than two full offers' worth, so the
    // second offer can be made entirely from cards not shown in the first.
    const cardDatabase = buildDB(
      Array.from({ length: 10 }, (_, index) => makeCard(index + 1)),
    );
    const state = makeDraftState({
      remainingCopiesByCard: Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [String(index + 1), 1]),
      ),
    });

    enterDraftSite(state, "site-a", cardDatabase);
    const firstOffer = [...state.currentOffer];
    expect(firstOffer.length).toBe(4);
    expect(new Set(firstOffer).size).toBe(4);

    const isComplete = processPlayerPick(firstOffer[0], state, cardDatabase);
    const secondOffer = [...state.currentOffer];

    expect(isComplete).toBe(false);
    expect(secondOffer.length).toBe(4);
    // No card shown in the first offer reappears in the second offer of the
    // same visit — not just the picked card, every shown card is excluded.
    for (const cardNumber of secondOffer) {
      expect(firstOffer).not.toContain(cardNumber);
    }
    // The visit's shown set records every card displayed so far.
    expect(new Set(state.siteShownCardNumbers)).toEqual(
      new Set([...firstOffer, ...secondOffer]),
    );
  });

  it("clears the shown set so a later site visit can reoffer the same cards", () => {
    // A four-card pool can fill exactly one offer, so once those cards are shown
    // the visit has no unshown cards left to offer.
    const cardDatabase = buildDB(
      Array.from({ length: 4 }, (_, index) => makeCard(index + 1)),
    );
    const state = makeDraftState({
      remainingCopiesByCard: { "1": 1, "2": 1, "3": 1, "4": 1 },
    });

    enterDraftSite(state, "site-a", cardDatabase);
    expect(new Set(state.currentOffer)).toEqual(new Set([1, 2, 3, 4]));

    // Every card has now been shown this visit, so the visit ends after the pick
    // rather than offering a within-visit duplicate.
    const isComplete = processPlayerPick(
      state.currentOffer[0],
      state,
      cardDatabase,
    );
    expect(isComplete).toBe(true);

    // A brand-new site resets the shown set, so the same cards are offerable.
    enterDraftSite(state, "site-b", cardDatabase);
    expect(new Set(state.currentOffer)).toEqual(new Set([1, 2, 3, 4]));
    expect(new Set(state.siteShownCardNumbers)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("does not spend the shown offer a second time when the player picks", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 8 }, (_, index) => makeCard(index + 1)),
    );
    const state = makeDraftState({
      remainingCopiesByCard: {
        "1": 2,
        "2": 1,
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 1,
        "8": 1,
      },
    });

    vi.spyOn(Math, "random").mockReturnValue(0);

    enterDraftSite(state, "site-a", cardDatabase);
    expect(state.remainingCopiesByCard).toEqual({
      "1": 1,
      "5": 1,
      "6": 1,
      "7": 1,
      "8": 1,
    });

    const isComplete = processPlayerPick(1, state, cardDatabase);

    expect(isComplete).toBe(false);
    expect(state.pickNumber).toBe(2);
    expect(state.sitePicksCompleted).toBe(1);
    // Pick 2's offer is [5, 6, 7, 8]: cards 1-4 were shown in the first offer and
    // are excluded for the rest of the visit, so card 1's surviving copy stays in
    // the pool rather than being re-shown and spent.
    expect(state.currentOffer).toEqual([5, 6, 7, 8]);
    expect(state.remainingCopiesByCard).toEqual({
      "1": 1,
    });
  });

  it("recreates the multiset when fewer than 4 unique cards remain", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 7 }, (_, index) => makeCard(index + 1)),
    );
    const state = makeDraftState({
      draftPoolCopiesByCard: {
        "1": 1,
        "2": 1,
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 1,
      },
      remainingCopiesByCard: {
        "1": 1,
        "2": 1,
      },
    });

    enterDraftSite(state, "site-a", cardDatabase);

    // The remaining copies held only 2 unique cards, so the multiset is
    // recreated from the run's fixed pool and a fresh offer is revealed.
    expect(state.currentOffer).toHaveLength(4);
    expect(
      getLogEntries().some((entry) => entry.event === "draft_pool_recreated"),
    ).toBe(true);
  });

  it("still completes after SITE_PICKS picks when offers remain", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 24 }, (_, index) => makeCard(index + 1)),
    );
    const state = initializeDraftState(
      cardDatabase,
      buildResolvedPackage(
        Object.fromEntries(
          Array.from({ length: 24 }, (_, index) => [index + 1, 1]),
        ),
      ),
    );

    vi.spyOn(Math, "random").mockReturnValue(0);

    enterDraftSite(state, "site-a", cardDatabase);
    for (let pickIndex = 0; pickIndex < SITE_PICKS; pickIndex += 1) {
      const currentOffer = getCurrentOffer(state);
      const isComplete = processPlayerPick(
        currentOffer[0],
        state,
        cardDatabase,
      );
      expect(isComplete).toBe(pickIndex === SITE_PICKS - 1);
    }
  });

  it("reuses the persisted offer when the same site remounts", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 8 }, (_, index) => makeCard(index + 1)),
    );
    const state = makeDraftState({
      remainingCopiesByCard: {
        "1": 2,
        "2": 1,
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 1,
        "8": 1,
      },
    });

    vi.spyOn(Math, "random").mockReturnValue(0);

    enterDraftSite(state, "site-a", cardDatabase);
    const firstOffer = [...state.currentOffer];
    const firstRemainingPool = { ...state.remainingCopiesByCard };

    enterDraftSite(state, "site-a", cardDatabase);

    expect(state.currentOffer).toEqual(firstOffer);
    expect(state.remainingCopiesByCard).toEqual(firstRemainingPool);
    expect(
      getLogEntries().filter((entry) => entry.event === "draft_offer_revealed"),
    ).toHaveLength(1);
  });

  it("starts a fresh site visit after a prior site has completed", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 8 }, (_, index) => makeCard(index + 1)),
    );
    const state = makeDraftState({
      remainingCopiesByCard: {
        "1": 1,
        "2": 1,
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
        "7": 1,
        "8": 1,
      },
      activeSiteId: "site-a",
      currentOffer: [],
      sitePicksCompleted: 3,
    });

    vi.spyOn(Math, "random").mockReturnValue(0);

    enterDraftSite(state, "site-b", cardDatabase);

    expect(state.activeSiteId).toBe("site-b");
    expect(state.sitePicksCompleted).toBe(0);
    expect(state.currentOffer).toEqual([1, 2, 3, 4]);
    expect(state.remainingCopiesByCard).toEqual({
      "5": 1,
      "6": 1,
      "7": 1,
      "8": 1,
    });
  });
});

describe("legendary exclusion", () => {
  it("strips every Legendary from both pool maps when a Legendary is drafted", () => {
    const cardDatabase = buildDB([
      makeCard(1, { rarity: "Legendary" }),
      makeCard(2, { rarity: "Legendary" }),
      makeCard(3, { rarity: "Legendary" }),
      makeCard(4),
      makeCard(5),
    ]);
    const state = makeDraftState({
      draftPoolCopiesByCard: { "1": 1, "2": 1, "3": 1, "4": 2, "5": 2 },
      remainingCopiesByCard: { "2": 1, "3": 1, "4": 1, "5": 1 },
      activeSiteId: "site-a",
      currentOffer: [1, 4, 5, 2],
      siteShownCardNumbers: [1, 4, 5, 2],
      // Final pick of the visit, so no follow-up offer is revealed and the
      // pool-pruning is observed in isolation.
      sitePicksCompleted: SITE_PICKS - 1,
    });

    const isComplete = processPlayerPick(1, state, cardDatabase);

    expect(isComplete).toBe(true);
    // Legendaries 2 and 3 (and the just-drafted 1) are gone from the remaining
    // multiset and from the fixed pool that recreation draws from.
    expect(state.remainingCopiesByCard).toEqual({ "4": 1, "5": 1 });
    expect(state.draftPoolCopiesByCard).toEqual({ "4": 2, "5": 2 });
  });

  it("leaves Legendaries in the pool when a non-Legendary is drafted", () => {
    const cardDatabase = buildDB([
      makeCard(1, { rarity: "Legendary" }),
      makeCard(2),
      makeCard(3),
      makeCard(4),
      makeCard(5),
    ]);
    const state = makeDraftState({
      draftPoolCopiesByCard: { "1": 1, "2": 1, "3": 1, "4": 1, "5": 1 },
      remainingCopiesByCard: { "1": 1, "3": 1, "4": 1, "5": 1 },
      activeSiteId: "site-a",
      currentOffer: [2, 3, 4, 5],
      siteShownCardNumbers: [2, 3, 4, 5],
      sitePicksCompleted: SITE_PICKS - 1,
    });

    processPlayerPick(2, state, cardDatabase);

    // Picking the ordinary card 2 leaves the Legendary (1) available.
    expect(state.remainingCopiesByCard["1"]).toBe(1);
    expect(state.draftPoolCopiesByCard["1"]).toBe(1);
  });

  it("keeps Legendaries out of a later draft site once one is drafted", () => {
    const cardDatabase = buildDB([
      makeCard(1, { rarity: "Legendary" }),
      makeCard(2, { rarity: "Legendary" }),
      ...Array.from({ length: 8 }, (_, index) => makeCard(index + 3)),
    ]);
    const state = makeDraftState({
      remainingCopiesByCard: Object.fromEntries(
        Array.from({ length: 10 }, (_, index) => [String(index + 1), 1]),
      ),
    });

    // rng 0 makes weightedSample take the lowest-numbered entries, so the first
    // offer leads with the Legendaries (cards 1 and 2).
    vi.spyOn(Math, "random").mockReturnValue(0);

    enterDraftSite(state, "site-a", cardDatabase);
    const offer = [...state.currentOffer];
    const legendaryInOffer =
      offer.find((n) => cardDatabase.get(n)?.rarity === "Legendary") ?? 0;
    expect(cardDatabase.get(legendaryInOffer)?.rarity).toBe("Legendary");

    processPlayerPick(legendaryInOffer, state, cardDatabase);

    // The fixed recreation pool no longer holds any Legendary...
    for (const key of Object.keys(state.draftPoolCopiesByCard)) {
      expect(cardDatabase.get(Number(key))?.rarity).not.toBe("Legendary");
    }
    // ...so a brand-new visit (which resets the shown set and may recreate the
    // multiset) can never surface a second Legendary.
    enterDraftSite(state, "site-b", cardDatabase);
    for (const cardNumber of state.currentOffer) {
      expect(cardDatabase.get(cardNumber)?.rarity).not.toBe("Legendary");
    }
  });
});

describe("replay mode", () => {
  // A minimal FitModel stand-in. The real ranker is never invoked in these
  // tests — a fake `computeOffer` is injected — so the model only needs to be a
  // value of the right type.
  const fakeFitModel = {} as unknown as FitModel;

  // Build packs of distinct card numbers. Pack p (0-indexed) holds
  // [p*10 + 1 .. p*10 + size].
  function makePackSequence(packCount: number, size: number): number[][] {
    return Array.from({ length: packCount }, (_, p) =>
      Array.from({ length: size }, (_, i) => p * 10 + i + 1),
    );
  }

  // A deterministic fake ranker: it returns `offerSize` cards of the pack, but
  // ROTATED by the current deck size, so the offer is a pure function of the
  // pack and the deck passed in `replayDeps.deckCardNumbers`. Distinct decks
  // therefore produce distinct offers — which is what we assert. Returned as a
  // `vi.fn` so call counts are observable via `.mock.calls.length`.
  function makeEchoOffer(): NonNullable<ReplayDeps["computeOffer"]> {
    return vi.fn(
      (
        pack: readonly number[],
        deck: readonly number[],
        _signatures: readonly number[],
        _model: FitModel,
        offerSize: number,
      ): number[] => {
        const shift = deck.length % pack.length;
        const rotated = [...pack.slice(shift), ...pack.slice(0, shift)];
        return rotated.slice(0, offerSize);
      },
    );
  }

  function makeReplayDeps(
    overrides: Partial<ReplayDeps> = {},
  ): ReplayDeps {
    return {
      deckCardNumbers: [],
      fitModel: fakeFitModel,
      offerSize: 4,
      computeOffer: makeEchoOffer(),
      ...overrides,
    };
  }

  it("offers the deck-fit slice of packSequence[pickNumber - 1]", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 60 }, (_, index) => makeCard(index + 1)),
    );
    const state = createInitialReplayDraftState({
      recordId: "seat-3",
      packSequence: makePackSequence(30, 8),
      signatureCardNumbers: [501],
    });
    const computeOffer = makeEchoOffer();

    enterDraftSite(state, "site-a", cardDatabase, undefined, {
      deckCardNumbers: [],
      fitModel: fakeFitModel,
      offerSize: 4,
      computeOffer,
    });

    // First pick reads pack 0 ([1..8]); empty deck → no rotation → first four.
    expect(state.currentOffer).toEqual([1, 2, 3, 4]);
    expect(computeOffer).toHaveBeenCalledTimes(1);
  });

  it("advances to the next pack after a pick", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 60 }, (_, index) => makeCard(index + 1)),
    );
    const state = createInitialReplayDraftState({
      recordId: "seat-3",
      packSequence: makePackSequence(30, 8),
      signatureCardNumbers: [],
    });

    enterDraftSite(state, "site-a", cardDatabase, undefined, makeReplayDeps());
    expect(state.pickNumber).toBe(1);
    expect(state.currentOffer).toEqual([1, 2, 3, 4]);

    const complete = processPlayerPick(
      state.currentOffer[0],
      state,
      cardDatabase,
      undefined,
      makeReplayDeps(),
    );

    expect(complete).toBe(false);
    expect(state.pickNumber).toBe(2);
    // Pack 1 is [11..18]; empty deck passed in deps → first four.
    expect(state.currentOffer).toEqual([11, 12, 13, 14]);
  });

  it("offers the whole pack without scoring when it is no larger than offerSize", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 60 }, (_, index) => makeCard(index + 1)),
    );
    const packSequence = makePackSequence(30, 8);
    packSequence[0] = [1, 2, 3]; // smaller than offerSize 4
    const state = createInitialReplayDraftState({
      recordId: "seat-3",
      packSequence,
      signatureCardNumbers: [],
    });
    const computeOffer = makeEchoOffer();

    enterDraftSite(state, "site-a", cardDatabase, undefined, {
      deckCardNumbers: [99],
      fitModel: fakeFitModel,
      offerSize: 4,
      computeOffer,
    });

    expect(state.currentOffer).toEqual([1, 2, 3]);
    // Small pack returns whole; the ranker is not consulted.
    expect(computeOffer).not.toHaveBeenCalled();
  });

  it("yields an empty offer once the pack sequence is exhausted", () => {
    const cardDatabase = buildDB([makeCard(1)]);
    const state = createInitialReplayDraftState({
      recordId: "seat-3",
      packSequence: makePackSequence(2, 8),
      signatureCardNumbers: [],
    });
    // Past the end of the 2-pack sequence.
    state.pickNumber = 5;

    enterDraftSite(state, "site-a", cardDatabase, undefined, makeReplayDeps());

    expect(state.currentOffer).toEqual([]);
    const entered = getLogEntries().find(
      (entry) => entry.event === "draft_site_entered",
    );
    expect(entered?.offerAvailable).toBe(false);
  });

  it("treats an empty pack as an exhausted offer without throwing", () => {
    const cardDatabase = buildDB([makeCard(1)]);
    const packSequence = makePackSequence(3, 8);
    packSequence[0] = [];
    const state = createInitialReplayDraftState({
      recordId: "seat-3",
      packSequence,
      signatureCardNumbers: [],
    });

    expect(() =>
      enterDraftSite(state, "site-a", cardDatabase, undefined, makeReplayDeps()),
    ).not.toThrow();
    expect(state.currentOffer).toEqual([]);
  });

  it("throws when replayDeps is omitted in replay mode", () => {
    const cardDatabase = buildDB([makeCard(1)]);
    const state = createInitialReplayDraftState({
      recordId: "seat-3",
      packSequence: makePackSequence(30, 8),
      signatureCardNumbers: [],
    });

    expect(() => enterDraftSite(state, "site-a", cardDatabase)).toThrow(
      /replayDeps/,
    );
  });

  it("advances pickNumber and sitePicksCompleted across a full site visit", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 60 }, (_, index) => makeCard(index + 1)),
    );
    const state = createInitialReplayDraftState({
      recordId: "seat-3",
      packSequence: makePackSequence(30, 8),
      signatureCardNumbers: [],
    });

    enterDraftSite(state, "site-a", cardDatabase, undefined, makeReplayDeps());

    for (let pickIndex = 0; pickIndex < SITE_PICKS; pickIndex += 1) {
      expect(state.sitePicksCompleted).toBe(pickIndex);
      const isComplete = processPlayerPick(
        state.currentOffer[0],
        state,
        cardDatabase,
        undefined,
        makeReplayDeps(),
      );
      expect(isComplete).toBe(pickIndex === SITE_PICKS - 1);
    }

    expect(state.sitePicksCompleted).toBe(SITE_PICKS);
    expect(state.pickNumber).toBe(SITE_PICKS + 1);
    expect(state.currentOffer).toEqual([]);
  });

  it("reflects the deck passed in replayDeps.deckCardNumbers", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 60 }, (_, index) => makeCard(index + 1)),
    );
    const packSequence = makePackSequence(30, 8);
    const emptyDeckState = createInitialReplayDraftState({
      recordId: "seat-3",
      packSequence,
      signatureCardNumbers: [],
    });
    const fullDeckState = createInitialReplayDraftState({
      recordId: "seat-3",
      packSequence,
      signatureCardNumbers: [],
    });

    enterDraftSite(emptyDeckState, "site-a", cardDatabase, undefined, {
      deckCardNumbers: [],
      fitModel: fakeFitModel,
      offerSize: 4,
      computeOffer: makeEchoOffer(),
    });
    enterDraftSite(fullDeckState, "site-a", cardDatabase, undefined, {
      // A 3-card deck rotates pack [1..8] by 3 → starts at 4.
      deckCardNumbers: [97, 98, 99],
      fitModel: fakeFitModel,
      offerSize: 4,
      computeOffer: makeEchoOffer(),
    });

    expect(emptyDeckState.currentOffer).toEqual([1, 2, 3, 4]);
    expect(fullDeckState.currentOffer).toEqual([4, 5, 6, 7]);
    expect(emptyDeckState.currentOffer).not.toEqual(fullDeckState.currentOffer);
  });

  it("createInitialReplayDraftState produces the expected shape", () => {
    const state = createInitialReplayDraftState({
      recordId: "seat-7",
      packSequence: [[1, 2], [3, 4]],
      signatureCardNumbers: [9, 10],
    });

    expect(state).toEqual({
      mode: "replay",
      recordId: "seat-7",
      packSequence: [[1, 2], [3, 4]],
      signatureCardNumbers: [9, 10],
      currentOffer: [],
      activeSiteId: null,
      pickNumber: 1,
      sitePicksCompleted: 0,
      siteShownCardNumbers: [],
    });
  });

  it("drawAndSpendUniqueCards rejects a replay draft state", () => {
    const state = createInitialReplayDraftState({
      recordId: "seat-3",
      packSequence: makePackSequence(30, 8),
      signatureCardNumbers: [],
    });

    expect(() => drawAndSpendUniqueCards(state, 4)).toThrow(
      /requires a pool draft state/,
    );
  });
});

describe("completeDraftSite", () => {
  it("logs the drafted cards provided by the draft site UI", () => {
    const state = makeDraftState({
      activeSiteId: "site-a",
      remainingCopiesByCard: { "9": 1, "10": 1 },
      sitePicksCompleted: 2,
    });

    completeDraftSite(state, [4, 7]);

    const completionEvent = getLogEntries().find(
      (entry) => entry.event === "draft_site_completed",
    );
    expect(completionEvent).toBeDefined();
    expect(completionEvent?.siteId).toBe("site-a");
    expect(completionEvent?.cardsDrafted).toEqual([4, 7]);
    expect(completionEvent?.picksCompleted).toBe(2);
  });
});

describe("fresh20 mode", () => {
  const fakeFitModel = {} as unknown as FitModel;

  // A deterministic ranker: returns the first `offerSize` cards of the pack so
  // the offer is a pure function of the (deterministically sampled) pack.
  function makeHeadOffer(): NonNullable<Fresh20Deps["computeOffer"]> {
    return vi.fn(
      (pack: readonly number[], _deck, _sig, _model, offerSize: number) =>
        pack.slice(0, offerSize),
    );
  }

  // rng = 0 on every draw makes the partial Fisher–Yates a no-op, so a pack is
  // the first `packSize` eligible cards in input order — fully deterministic.
  const zeroRng = (): number => 0;

  function makeFresh20Deps(
    allCardNumbers: number[],
    overrides: Partial<Fresh20Deps> = {},
  ): Fresh20Deps {
    return {
      deckCardNumbers: [],
      fitModel: fakeFitModel,
      offerSize: 4,
      allCardNumbers,
      rng: zeroRng,
      computeOffer: makeHeadOffer(),
      ...overrides,
    };
  }

  it("rolls a fresh pack and offers the ranker's slice on entry", () => {
    const all = Array.from({ length: 60 }, (_, i) => i + 1);
    const cardDatabase = buildDB(all.map((n) => makeCard(n)));
    const state = createInitialFresh20DraftState({ packSize: 20 });
    const computeOffer = makeHeadOffer();

    enterDraftSite(
      state,
      "site-a",
      cardDatabase,
      undefined,
      makeFresh20Deps(all, { computeOffer }),
    );

    // packSize 20, zero rng → pack [1..20]; head ranker → first four.
    expect(state.currentOffer).toEqual([1, 2, 3, 4]);
    expect(computeOffer).toHaveBeenCalledTimes(1);
  });

  it("records every shown card so it goes on cooldown next pick", () => {
    const all = Array.from({ length: 60 }, (_, i) => i + 1);
    const cardDatabase = buildDB(all.map((n) => makeCard(n)));
    const state = createInitialFresh20DraftState({ packSize: 20 });

    enterDraftSite(state, "site-a", cardDatabase, undefined, makeFresh20Deps(all));
    expect(state.currentOffer).toEqual([1, 2, 3, 4]);
    // All four shown cards are recorded at pick 1.
    for (const card of [1, 2, 3, 4]) {
      expect(state.shownPicksByCard[String(card)]).toEqual([1]);
    }

    const complete = processPlayerPick(
      state.currentOffer[0],
      state,
      cardDatabase,
      undefined,
      makeFresh20Deps(all),
    );

    expect(complete).toBe(false);
    expect(state.pickNumber).toBe(2);
    // Pick 2's pack must exclude the four cards shown at pick 1 (cooldown), so
    // the next eligible head-of-list cards [5..8] are offered instead.
    expect(state.currentOffer).toEqual([5, 6, 7, 8]);
  });

  it("frees a card again once its cooldown elapses", () => {
    // A tiny universe forces reuse: 8 cards, packSize 8 → every pick shows the 4
    // best of all 8 still-eligible cards. Card 1, shown at pick 1, must be
    // offerable again exactly FRESH20_COOLDOWN_PICKS picks later.
    const all = [1, 2, 3, 4, 5, 6, 7, 8];
    const cardDatabase = buildDB(all.map((n) => makeCard(n)));
    const state = createInitialFresh20DraftState({ packSize: 8 });
    // Pretend card 1 was shown once, long enough ago to be free at pick
    // 1 + FRESH20_COOLDOWN_PICKS.
    state.shownPicksByCard = { "1": [1] };
    state.pickNumber = 1 + FRESH20_COOLDOWN_PICKS;
    state.activeSiteId = null;

    const seenPacks: number[][] = [];
    enterDraftSite(
      state,
      "site-a",
      cardDatabase,
      undefined,
      makeFresh20Deps(all, {
        computeOffer: vi.fn((pack: readonly number[], _d, _s, _m, n: number) => {
          seenPacks.push([...pack]);
          return pack.slice(0, n);
        }),
      }),
    );
    expect(seenPacks[0]).toContain(1);
  });

  it("throws when fresh20 deps are missing", () => {
    const cardDatabase = buildDB([makeCard(1), makeCard(2)]);
    const state = createInitialFresh20DraftState({ packSize: 20 });
    expect(() => enterDraftSite(state, "site-a", cardDatabase)).toThrow(
      /fresh20Deps/,
    );
  });
});
