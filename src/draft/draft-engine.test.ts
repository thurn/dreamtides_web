import { beforeEach, describe, expect, it } from "vitest";
import { getLogEntries, resetLog } from "../logging";
import type { CardData } from "../types/cards";
import { parseCardName } from "../types/card-identity";
import type { DraftConfig, PoolDraftState } from "../types/draft";
import type { ResolvedAvatarPackage } from "../types/content";
import {
  enterDraftSite,
  initializeDraftState,
  processPlayerPick,
} from "./draft-engine";
import { parseSiteId } from "../types/identifiers";
import { testAvatarId, testCardId } from "../types/test-identities";

/** Synthetic rules, so no case depends on the authored draft catalog. */
const CONFIG: DraftConfig = {
  packSize: 4,
  sitePickCount: 3,
  rarityCaps: [{ rarity: "Legendary", poolCopyCap: 1, maxPicksPerRun: 1 }],
};

/** rng 0 makes the weighted sample take the lowest-numbered entries in order. */
const lowest = (): number => 0;

const SITE_A = parseSiteId("site-a");
const SITE_B = parseSiteId("site-b");

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

/** A database of cards 1..count; `legendary` lists the Legendary card numbers. */
function cardsDB(
  count: number,
  legendary: readonly number[] = [],
): Map<number, CardData> {
  return new Map(
    Array.from({ length: count }, (_, index) => {
      const cardNumber = index + 1;
      return [
        cardNumber,
        makeCard(
          cardNumber,
          legendary.includes(cardNumber) ? { rarity: "Legendary" } : {},
        ),
      ];
    }),
  );
}

/** One copy each of cards 1..count. */
function singles(count: number): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [String(index + 1), 1]),
  );
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
    draftPoolCopiesByCard: { ...copiesByCard },
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
  const remainingCopiesByCard = overrides.remainingCopiesByCard ?? {};
  return {
    mode: "tides4",
    draftPoolCopiesByCard: { ...remainingCopiesByCard },
    remainingCopiesByCard,
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
    siteShownCardNumbers: [],
    ...overrides,
  };
}

function revealedOffers() {
  return getLogEntries().filter(
    (entry) => entry.event === "draft_offer_revealed",
  );
}

beforeEach(() => {
  resetLog();
});

describe("initializeDraftState", () => {
  it("keeps only catalog cards from the resolved package pool", () => {
    const state = initializeDraftState(
      cardsDB(3),
      buildResolvedPackage({ 1: 2, 2: 1, 999: 3 }),
    );

    expect(state.remainingCopiesByCard).toEqual({ "1": 2, "2": 1 });
    expect(state).toMatchObject({
      currentOffer: [],
      activeSiteId: null,
      pickNumber: 1,
      sitePicksCompleted: 0,
    });
  });
});

describe("pool offers", () => {
  it("reveals unique cards, spending one copy of each shown card once", () => {
    const state = makeDraftState({
      remainingCopiesByCard: { ...singles(8), "1": 2 },
    });

    enterDraftSite(state, SITE_A, cardsDB(8), CONFIG, lowest);
    expect(state.activeSiteId).toBe(SITE_A);
    expect(state.currentOffer).toEqual([1, 2, 3, 4]);
    expect(state.remainingCopiesByCard).toEqual({
      "1": 1,
      "5": 1,
      "6": 1,
      "7": 1,
      "8": 1,
    });

    // Picking does not spend the shown card again; the next offer excludes
    // every card already shown this visit, so card 1's last copy survives.
    expect(processPlayerPick(1, state, cardsDB(8), CONFIG, lowest)).toBe(false);
    expect(state.pickNumber).toBe(2);
    expect(state.sitePicksCompleted).toBe(1);
    expect(state.currentOffer).toEqual([5, 6, 7, 8]);
    expect(state.remainingCopiesByCard).toEqual({ "1": 1 });
    expect(new Set(state.siteShownCardNumbers)).toEqual(
      new Set([1, 2, 3, 4, 5, 6, 7, 8]),
    );
  });

  it("weights the sample by remaining copies", () => {
    const state = makeDraftState({
      remainingCopiesByCard: { ...singles(5), "1": 2 },
    });
    // A roll of 0.32 over six copies lands inside card 1's double weight.
    const rolls = [0.32];

    enterDraftSite(state, SITE_A, cardsDB(5), CONFIG, () => rolls.shift() ?? 0);

    expect(state.currentOffer[0]).toBe(1);
  });

  it("presents authored opening offers before weighted pool offers", () => {
    const cardDatabase = cardsDB(12);
    const state = initializeDraftState(cardDatabase, {
      ...buildResolvedPackage(singles(12)),
      openingDraftOffers: { "1": [8, 6, 4, 2], "2": [7, 5, 3, 1] },
    });

    enterDraftSite(state, SITE_A, cardDatabase, CONFIG, lowest);
    expect(state.currentOffer).toEqual([8, 6, 4, 2]);
    processPlayerPick(8, state, cardDatabase, CONFIG, lowest);
    expect(state.currentOffer).toEqual([7, 5, 3, 1]);
    processPlayerPick(7, state, cardDatabase, CONFIG, lowest);
    expect(state.currentOffer).toEqual([9, 10, 11, 12]);
    expect(revealedOffers().map((entry) => entry.source)).toEqual([
      "authored_opening",
      "authored_opening",
      "weighted_pool",
    ]);
  });

  it("ends the visit early when every card has been shown, and a new site reoffers them", () => {
    const state = makeDraftState({ remainingCopiesByCard: singles(4) });

    enterDraftSite(state, SITE_A, cardsDB(4), CONFIG, lowest);
    expect(state.currentOffer).toEqual([1, 2, 3, 4]);
    expect(processPlayerPick(1, state, cardsDB(4), CONFIG, lowest)).toBe(true);

    enterDraftSite(state, SITE_B, cardsDB(4), CONFIG, lowest);
    expect(new Set(state.currentOffer)).toEqual(new Set([1, 2, 3, 4]));
    expect(new Set(state.siteShownCardNumbers)).toEqual(new Set([1, 2, 3, 4]));
  });

  it("recreates the multiset from the fixed pool when too few unique cards remain", () => {
    const state = makeDraftState({
      draftPoolCopiesByCard: singles(7),
      remainingCopiesByCard: { "1": 1, "2": 1 },
    });

    enterDraftSite(state, SITE_A, cardsDB(7), CONFIG, lowest);

    expect(state.currentOffer).toHaveLength(4);
    expect(
      getLogEntries().some((entry) => entry.event === "draft_pool_recreated"),
    ).toBe(true);
  });

  it("reuses the persisted offer when the same site remounts", () => {
    const state = makeDraftState({ remainingCopiesByCard: singles(8) });

    enterDraftSite(state, SITE_A, cardsDB(8), CONFIG, lowest);
    const offer = [...state.currentOffer];
    const remaining = { ...state.remainingCopiesByCard };
    enterDraftSite(state, SITE_A, cardsDB(8), CONFIG, lowest);

    expect(state.currentOffer).toEqual(offer);
    expect(state.remainingCopiesByCard).toEqual(remaining);
    expect(revealedOffers()).toHaveLength(1);
  });

  it("starts a fresh visit after a prior site completed", () => {
    const state = makeDraftState({
      remainingCopiesByCard: singles(8),
      activeSiteId: SITE_A,
      sitePicksCompleted: 3,
    });

    enterDraftSite(state, SITE_B, cardsDB(8), CONFIG, lowest);

    expect(state.activeSiteId).toBe(SITE_B);
    expect(state.sitePicksCompleted).toBe(0);
    expect(state.currentOffer).toEqual([1, 2, 3, 4]);
  });

  it.each([
    { packSize: 3, sitePickCount: 2 },
    { packSize: 4, sitePickCount: 3 },
  ])(
    "offers $packSize cards and completes after $sitePickCount picks",
    ({ packSize, sitePickCount }) => {
      const config: DraftConfig = { ...CONFIG, packSize, sitePickCount };
      const state = makeDraftState({ remainingCopiesByCard: singles(24) });

      enterDraftSite(state, SITE_A, cardsDB(24), config, lowest);
      for (let pick = 1; pick <= sitePickCount; pick += 1) {
        expect(state.currentOffer).toHaveLength(packSize);
        expect(
          processPlayerPick(
            state.currentOffer[0],
            state,
            cardsDB(24),
            config,
            lowest,
          ),
        ).toBe(pick === sitePickCount);
      }
      expect(state.sitePicksCompleted).toBe(sitePickCount);
      expect(state.currentOffer).toEqual([]);
    },
  );
});

describe("rarity caps", () => {
  // Final pick of the visit, so no follow-up offer hides the pool pruning.
  function finalPickState(): PoolDraftState {
    return makeDraftState({
      draftPoolCopiesByCard: { "1": 1, "2": 1, "3": 1, "4": 2, "5": 2 },
      remainingCopiesByCard: { "2": 1, "3": 1, "4": 1, "5": 1 },
      activeSiteId: SITE_A,
      currentOffer: [1, 4, 5, 2],
      siteShownCardNumbers: [1, 4, 5, 2],
      sitePicksCompleted: CONFIG.sitePickCount - 1,
    });
  }

  it("strips the capped rarity from both pool maps once the run deck reaches the cap", () => {
    const state = finalPickState();

    expect(
      processPlayerPick(1, state, cardsDB(5, [1, 2, 3]), CONFIG, lowest),
    ).toBe(true);

    expect(state.remainingCopiesByCard).toEqual({ "4": 1, "5": 1 });
    expect(state.draftPoolCopiesByCard).toEqual({ "4": 2, "5": 2 });
  });

  it("leaves the capped rarity in the pool while the run deck is under the cap", () => {
    const state = finalPickState();

    processPlayerPick(4, state, cardsDB(5, [1, 2, 3]), CONFIG, lowest);

    expect(state.remainingCopiesByCard["2"]).toBe(1);
    expect(state.draftPoolCopiesByCard["1"]).toBe(1);
  });

  it("counts the post-pick run deck rather than this pick alone", () => {
    const config: DraftConfig = {
      packSize: 3,
      sitePickCount: 2,
      rarityCaps: [{ rarity: "Special", poolCopyCap: 1, maxPicksPerRun: 2 }],
    };
    const special = { rarity: "Special" as const };
    const cardDatabase = new Map([
      [1, makeCard(1, special)],
      [2, makeCard(2, special)],
      [3, makeCard(3, special)],
      [4, makeCard(4)],
    ]);
    const state = makeDraftState({
      draftPoolCopiesByCard: singles(4),
      remainingCopiesByCard: { "2": 1, "3": 1, "4": 1 },
      activeSiteId: SITE_A,
      currentOffer: [1, 2, 3],
      siteShownCardNumbers: [1, 2, 3],
      sitePicksCompleted: 1,
    });

    processPlayerPick(1, state, cardDatabase, config, lowest, [2, 1]);

    expect(state.draftPoolCopiesByCard).toEqual({ "4": 1 });
    expect(state.remainingCopiesByCard).toEqual({ "4": 1 });
  });
});
