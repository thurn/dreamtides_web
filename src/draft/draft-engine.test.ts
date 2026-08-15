import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../logging";
import type { CardData } from "../types/cards";
import { parseCardName } from "../types/card-identity";
import type { DraftConfig, PoolDraftState } from "../types/draft";
import type { ResolvedAvatarPackage } from "../types/content";
import {
  enterDraftSite,
  getCurrentOffer,
  initializeDraftState,
  processPlayerPick,
  SITE_PICKS,
} from "./draft-engine";
import { parseSiteId } from "../types/identifiers";
import { testAvatarId, testCardId } from "../types/test-identities";

function makeCard(
  cardNumber: number,
  overrides: Partial<CardData> = {},
): CardData {
  return {
    name: parseCardName(`TestCard${String(cardNumber)}`),
    id: testCardId(`test-${String(cardNumber)}`),
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
): ResolvedAvatarPackage {
  return {
    avatar: {
      id: testAvatarId("test-avatar"),
      name: "Test Avatar",
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
    doubledCardCount: Object.values(copiesByCard).filter(
      (copies) => copies === 2,
    ).length,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
  };
}

function makeDraftState(
  overrides: Partial<PoolDraftState> = {},
): PoolDraftState {
  const base: PoolDraftState = {
    mode: "tides4",
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
    const cardDatabase = buildDB([makeCard(1), makeCard(2), makeCard(3)]);

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

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase);

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

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase, undefined, () => 0);
    expect(state.currentOffer).toEqual([8, 6, 4, 2]);

    processPlayerPick(8, state, cardDatabase, undefined, () => 0);
    expect(state.currentOffer).toEqual([7, 5, 3, 1]);
    expect(
      getLogEntries()
        .filter((entry) => entry.event === "draft_offer_revealed")
        .map((entry) => entry.source),
    ).toEqual(["authored_opening", "authored_opening"]);

    processPlayerPick(7, state, cardDatabase, undefined, () => 0);
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

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase);

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

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase);
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

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase);
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
    enterDraftSite(state, parseSiteId("site-b"), cardDatabase);
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

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase);
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

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase);

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

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase);
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

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase);
    const firstOffer = [...state.currentOffer];
    const firstRemainingPool = { ...state.remainingCopiesByCard };

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase);

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
      activeSiteId: parseSiteId("site-a"),
      currentOffer: [],
      sitePicksCompleted: 3,
    });

    vi.spyOn(Math, "random").mockReturnValue(0);

    enterDraftSite(state, parseSiteId("site-b"), cardDatabase);

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
      activeSiteId: parseSiteId("site-a"),
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
      activeSiteId: parseSiteId("site-a"),
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

    enterDraftSite(state, parseSiteId("site-a"), cardDatabase);
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
    enterDraftSite(state, parseSiteId("site-b"), cardDatabase);
    for (const cardNumber of state.currentOffer) {
      expect(cardDatabase.get(cardNumber)?.rarity).not.toBe("Legendary");
    }
  });
});

describe("configured draft rules", () => {
  const config: DraftConfig = {
    packSize: 3,
    sitePickCount: 2,
    rarityCaps: [{ rarity: "Special", poolCopyCap: 1, maxPicksPerRun: 2 }],
  };

  it("uses the configured offer size and completes at the configured site target", () => {
    const cards = Array.from({ length: 8 }, (_, index) => makeCard(index + 1));
    const cardDatabase = buildDB(cards);
    const state = makeDraftState({
      remainingCopiesByCard: Object.fromEntries(
        cards.map((card) => [String(card.cardNumber), 1]),
      ),
    });

    enterDraftSite(
      state,
      parseSiteId("site-configured"),
      cardDatabase,
      config,
      () => 0,
    );
    expect(state.currentOffer).toHaveLength(3);
    expect(
      processPlayerPick(
        state.currentOffer[0],
        state,
        cardDatabase,
        config,
        () => 0,
      ),
    ).toBe(false);
    expect(state.currentOffer).toHaveLength(3);
    expect(
      processPlayerPick(
        state.currentOffer[0],
        state,
        cardDatabase,
        config,
        () => 0,
      ),
    ).toBe(true);
    expect(state.sitePicksCompleted).toBe(2);
    expect(state.currentOffer).toEqual([]);
  });

  it("prunes any configured rarity using post-pick run deck counts", () => {
    const cardDatabase = buildDB([
      makeCard(1, { rarity: "Special" }),
      makeCard(2, { rarity: "Special" }),
      makeCard(3, { rarity: "Special" }),
      makeCard(4),
    ]);
    const state = makeDraftState({
      draftPoolCopiesByCard: { "1": 1, "2": 1, "3": 1, "4": 1 },
      remainingCopiesByCard: { "2": 1, "3": 1, "4": 1 },
      activeSiteId: parseSiteId("site-a"),
      currentOffer: [1, 2, 3],
      siteShownCardNumbers: [1, 2, 3],
      sitePicksCompleted: 1,
    });

    processPlayerPick(1, state, cardDatabase, config, () => 0, [2, 1]);

    expect(state.draftPoolCopiesByCard).toEqual({ "4": 1 });
    expect(state.remainingCopiesByCard).toEqual({ "4": 1 });
  });
});
