import { describe, expect, it } from "vitest";
import { annotatedTextEquality } from "../../cumulus/testing/annotated-text";
import { testJourneyState } from "../../testing/journey-genesis";
import { gambleGameByRulesKind } from "../../data/gamble-data";
import {
  gambleFixture,
  testGambleSelectionTrace,
} from "../../testing/gamble-fixture";
import type {
  GravokWagerSiteRuntime,
  StarwayStairsSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
} from "../../types/journey";
import type {
  GambleSiteView,
  GravokWagerSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import { buildGambleGateViews } from "./gamble-site-view-model";
import { parseShuffleCommitment } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { buildGambleSiteView, GAMBLE_SITE, GUIDE, GUIDE_LINE_SOURCE } from "./gamble-site-view-model.fixtures";

expect.addEqualityTesters([annotatedTextEquality]);

const GUIDE_LINE = GUIDE_LINE_SOURCE;

const FIXTURE_SIGN_ID = testDreamsignId("fixture-sign");

const RUNTIME: GravokWagerSiteRuntime = {
  kind: "gamble",
  gameId: "gravok-three-gate-wager",
  selectionTrace: testGambleSelectionTrace("gravok-three-gate-wager"),
  roundNumber: 1,
  isFarpoint: false,
  wagerCost: 50,
  shuffleCommitment: parseShuffleCommitment("fixture-commitment"),
  committedCard: { rank: "Q", suit: "hearts" },
  dreamsignCandidateIds: [FIXTURE_SIGN_ID],
  rewardDreamsign: {
    id: FIXTURE_SIGN_ID,
    name: "Fixture Sign",
    effectDescription: "A fixture effect.",
  },
  result: null,
};

function expectGravokView(
  view: GambleSiteView | null,
): asserts view is GravokWagerSiteView {
  expect(view?.gameId).toBe("gravok-three-gate-wager");
  if (view?.gameId !== "gravok-three-gate-wager") {
    throw new Error("expected Three-Gate view");
  }
}

describe("gamble-site-view-model", () => {

  it("maps all exact gate targets, odds, rewards, and the locked jackpot", () => {
    const gates = buildGambleGateViews(
      gambleGameByRulesKind(gambleFixture(), "threeGate"),
      RUNTIME,
      12,
    );

    expect(gates).toMatchObject([
      {
        id: "six",
        minimumWinningRank: "6",
        chanceLabel: "69.23%",
        essenceReward: 100,
        rewardDreamsign: null,
        available: true,
      },
      {
        id: "nine",
        minimumWinningRank: "9",
        chanceLabel: "46.15%",
        essenceReward: 150,
        rewardDreamsign: null,
        available: true,
      },
      {
        id: "jack",
        minimumWinningRank: "J",
        essenceReward: 200,
        rewardDreamsign: { id: FIXTURE_SIGN_ID },
        available: true,
      },
    ]);
    expect(gates.every(({ chanceLabel }) => typeof chanceLabel === "string")).toBe(
      true,
    );
  });

  it("keeps the committed card concealed until the shared result exists", () => {
    const state = {
      ...testJourneyState(),
      essence: 75,
      siteRuntime: { [GAMBLE_SITE.id]: RUNTIME },
    };
    const view = buildGambleSiteView({
      state,
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expectGravokView(view);

    expect(view.runtimeReady).toBe(true);
    expect(view.canAfford).toBe(true);
    expect(view.canPlayAgain).toBe(false);
    expect(view.card).toEqual({ rank: "A", suit: "spades" });
    expect(view.guide.line).toBe(GUIDE_LINE_SOURCE);
    expect(view.result).toBeNull();
  });

  it("maps a jackpot result and its at-cap replacement by UUID", () => {
    const resultRuntime: GravokWagerSiteRuntime = {
      ...RUNTIME,
      result: {
        gateId: "jack",
        card: RUNTIME.committedCard,
        won: true,
        essenceGained: 200,
        essenceSettled: false,
        dreamsignAwarded: false,
        pendingDreamsignReplacement: true,
      },
    };
    const state = {
      ...testJourneyState(),
      essence: 350,
      maxDreamsigns: 1,
      dreamsigns: [
        {
          id: testDreamsignId("held-sign"),
          name: "Held Sign",
          effectDescription: "Held effect.",
        },
      ],
      siteRuntime: { [GAMBLE_SITE.id]: resultRuntime },
    };
    const view = buildGambleSiteView({
      state,
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });
    expectGravokView(view);

    expect(view.card).toEqual({ rank: "Q", suit: "hearts" });
    expect(view.result).toMatchObject({
      gateId: "jack",
      revealGateId: "six",
      won: true,
      essenceSettled: false,
      rewardDreamsign: { id: FIXTURE_SIGN_ID },
      pendingDreamsignReplacement: true,
    });
    expect(view.replacement).toMatchObject({
      incoming: { id: FIXTURE_SIGN_ID },
      held: [{ id: testDreamsignId("held-sign") }],
      capacity: 1,
    });
    expect(view.canPlayAgain).toBe(false);
  });
});

const LADDER_RUNTIME: TidemarkLadderClimbSiteRuntime = {
  kind: "gamble",
  gameId: "tidemark-ladder-climb",
  selectionTrace: testGambleSelectionTrace("tidemark-ladder-climb"),
  isFarpoint: false,
  shuffleCommitments: [
    parseShuffleCommitment("attempt-1"),
    parseShuffleCommitment("attempt-2"),
    parseShuffleCommitment("attempt-3"),
    parseShuffleCommitment("attempt-4"),
  ],
  committedCards: [
    { rank: "J", suit: "clubs" },
    { rank: "10", suit: "diamonds" },
    { rank: "8", suit: "hearts" },
    { rank: "6", suit: "spades" },
  ],
  dreamsignCandidateScores: [
    { dreamsignId: FIXTURE_SIGN_ID, score: 1 },
  ],
  strongPoolSize: 1,
  strongPoolCutoffScore: 1,
  rewardDreamsign: RUNTIME.rewardDreamsign!,
  revealedCards: [],
  cumulativeCost: 0,
  result: null,
};

describe("gamble-site-view-model — Ladder Climb", () => {
  it("shows only draw one with the locked Dreamsign prize", () => {
    const state = {
      ...testJourneyState(),
      essence: 75,
      siteRuntime: { [GAMBLE_SITE.id]: LADDER_RUNTIME },
    };
    const view = buildGambleSiteView({
      state,
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("tidemark-ladder-climb");
    if (view?.gameId !== "tidemark-ladder-climb") {
      throw new Error("expected Ladder Climb view");
    }
    expect(view.nextDraw).toEqual({
      attemptNumber: 1,
      targetRank: "Q",
      cost: 0,
      canAfford: true,
      available: true,
    });
    expect(view.result).toBeNull();
    expect(view.essenceReward).toBe(25);
    expect(view.rewardDreamsign?.id).toBe(FIXTURE_SIGN_ID);
  });
});

const STARWAY_RUNTIME: StarwayStairsSiteRuntime = {
  kind: "gamble",
  gameId: "starway-stairs",
  selectionTrace: testGambleSelectionTrace("starway-stairs"),
  roundNumber: 1,
  isFarpoint: false,
  wagerAmount: 30,
  shuffleCommitments: [
    parseShuffleCommitment("tier-1"),
    parseShuffleCommitment("tier-2"),
    parseShuffleCommitment("tier-3"),
  ],
  committedCards: [
    { rank: "3", suit: "clubs" },
    { rank: "5", suit: "diamonds" },
    { rank: "8", suit: "hearts" },
  ],
  results: [],
  terminalReason: null,
  prizeAwarded: 0,
};

describe("gamble-site-view-model — Starway Stairs", () => {
  it("maps all tier bust ranges and rewards with only tier one current", () => {
    const view = buildGambleSiteView({
      state: {
        ...testJourneyState(),
        essence: 30,
        siteRuntime: { [GAMBLE_SITE.id]: STARWAY_RUNTIME },
      },
      scene: null,
      site: GAMBLE_SITE,
      guide: GUIDE,
      guideLine: GUIDE_LINE,
    });

    expect(view?.gameId).toBe("starway-stairs");
    if (view?.gameId !== "starway-stairs") {
      throw new Error("expected Starway Stairs view");
    }
    expect(view.guide.line).toBe(GUIDE_LINE_SOURCE);
    expect(view.currentTierNumber).toBe(1);
    expect(view.tiers).toMatchObject([
      {
        tierNumber: 1,
        minimumWinningRank: "3",
        essenceReward: 60,
        state: "current",
      },
      {
        tierNumber: 2,
        minimumWinningRank: "5",
        essenceReward: 140,
        state: "future",
      },
      {
        tierNumber: 3,
        minimumWinningRank: "8",
        essenceReward: 300,
        state: "future",
      },
    ]);
    expect(view.canAffordWager).toBe(true);
    expect(view.canPlayAgain).toBe(false);
    expect(view.cashOutReward).toBeNull();
  });
});
