import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLogEntries, resetLog } from "../logging";
import type { CardData } from "../types/cards";
import type { DraftState } from "../types/draft";
import type { ResolvedDreamcallerPackage } from "../types/content";
import {
  completeDraftSite,
  enterDraftSite,
  getCurrentOffer,
  initializeDraftState,
  processPlayerPick,
  SITE_PICKS,
} from "./draft-engine";

function makeCard(
  cardNumber: number,
  tide: string = "tide_alpha",
): CardData {
  return {
    name: `TestCard${String(cardNumber)}`,
    id: `test-${String(cardNumber)}`,
    cardNumber,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 3,
    spark: 1,
    isFast: false,
    tides: [tide],
    renderedText: "",
    imageNumber: cardNumber,
    artOwned: false,
  };
}

function buildDB(cards: CardData[]): Map<number, CardData> {
  return new Map(cards.map((card) => [card.cardNumber, card]));
}

function buildResolvedPackage(
  copiesByCard: Record<number, number>,
): ResolvedDreamcallerPackage {
  return {
    dreamcaller: {
      id: "test-dreamcaller",
      name: "Test Dreamcaller",
      title: "Draft Architect",
      renderedText: "Test rules text.",
      imageNumber: "0003",
      startingEssence: 250,
      mandatoryTides: ["core"],
      optionalTides: ["support-a", "support-b", "support-c"],
    },
    mandatoryTides: ["core"],
    optionalSubset: ["support-a", "support-b", "support-c"],
    selectedTides: ["core", "support-a", "support-b", "support-c"],
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
  overrides: Partial<DraftState> = {},
): DraftState {
  const base: DraftState = {
    draftPoolCopiesByCard: {},
    remainingCopiesByCard: {},
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
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

  it("allows duplicate names to recur across the run while keeping each offer unique", () => {
    const cardDatabase = buildDB(
      Array.from({ length: 6 }, (_, index) => makeCard(index + 1)),
    );
    const state = makeDraftState({
      remainingCopiesByCard: {
        "1": 2,
        "2": 2,
        "3": 1,
        "4": 1,
        "5": 1,
        "6": 1,
      },
    });

    vi.spyOn(Math, "random").mockReturnValue(0);

    enterDraftSite(state, "site-a", cardDatabase);
    const firstOffer = [...state.currentOffer];
    const isComplete = processPlayerPick(firstOffer[0], state, cardDatabase);

    expect(isComplete).toBe(false);
    expect(new Set(firstOffer).size).toBe(4);
    expect(new Set(state.currentOffer).size).toBe(4);
    expect(firstOffer).toContain(1);
    expect(state.currentOffer).toContain(1);
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
    expect(state.remainingCopiesByCard).toEqual({
      "8": 1,
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
