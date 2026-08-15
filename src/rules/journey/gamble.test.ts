import { testJourneySeed } from "../../types/test-identities";
import { testEventActor } from "../../types/test-identities";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { economyFixture } from "../../testing/economy-fixture";
import { gambleFixture } from "../../testing/gamble-fixture";
import { MINIMAL_SITES_DATA } from "../../__test-helpers__/atlas-fixtures";
import type { EventContext, GameEvent, Genesis } from "../../eventlog/types";
import type {
  GravokGateId,
  StandardPlayingCard,
  StandardPlayingCardRank,
} from "../../types/gamble";
import { LayerName } from "../../types/layer-name";
import type {
  Dreamsign,
  FourSuitRepriseSiteRuntime,
  FourSuitRepriseTarget,
  GravokWagerSiteRuntime,
  JourneyState,
  SiteState,
  StarwayStairsSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
  BlackjackSiteRuntime,
} from "../../types/journey";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { registerSiteContentProvider, type SiteContentProvider } from "./sites";
import { parseShuffleCommitment } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { parseSiteId } from "../../types/identifiers";
import { parseAtlasNodeId } from "../../types/identifiers";
import { testCardId, testDreamscapeId, testDreamsignId } from "../../types/test-identities";

const SITE_ID = parseSiteId("fixture-gamble");
const NODE_ID = parseAtlasNodeId("fixture-node");
const GENESIS: Genesis = {
  seed: testJourneySeed("fixture-seed"),
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: {
    poolVariant: "tides4",
  },
};
const REWARD_DREAMSIGN: Dreamsign = {
  id: testDreamsignId("reward-sign"),
  name: "Reward Sign",
  effectDescription: "Fixture effect.",
};
const OTHER_DREAMSIGN_ID = testDreamsignId("other-sign");
const ECONOMY = economyFixture();
const GAMBLE = gambleFixture();

function runtime(
  rank: StandardPlayingCardRank,
  overrides: Partial<GravokWagerSiteRuntime> = {},
): GravokWagerSiteRuntime {
  return {
    kind: "gamble",
    gameId: "gravok-three-gate-wager",
    roundNumber: 1,
    isFarpoint: false,
    wagerCost: 50,
    shuffleCommitment: parseShuffleCommitment("fixture-commitment"),
    committedCard: { rank, suit: "clubs" },
    dreamsignCandidateIds: [testDreamsignId("reward-sign")],
    rewardDreamsign: REWARD_DREAMSIGN,
    result: null,
    ...overrides,
  };
}

function stateWith(
  rank: StandardPlayingCardRank,
  overrides: Partial<JourneyState> = {},
  runtimeOverrides: Partial<GravokWagerSiteRuntime> = {},
): FoldState {
  const base = genesisFoldState(GENESIS);
  const site: SiteState = {
    id: SITE_ID,
    type: "Gamble",
    isEnhanced: false,
    isVisited: false,
  };
  return {
    ...base,
    journey: {
      ...base.journey,
      essence: 200,
      maxDreamsigns: 12,
      remainingDreamsignPool: [
        testDreamsignId("reward-sign"),
        OTHER_DREAMSIGN_ID,
      ],
      currentDreamscape: NODE_ID,
      activeSiteId: SITE_ID,
      screen: { type: "site", siteId: SITE_ID },
      atlas: {
        ...base.journey.atlas,
        startingNodeId: NODE_ID,
        currentNodeId: NODE_ID,
        nodes: {
          [NODE_ID]: {
            id: NODE_ID,
            layer: LayerName.Two,
            indexInLayer: 0,
            dreamscapeId: testDreamscapeId("fixture-dreamscape"),
            sites: [site],
            position: { x: 0, y: 0 },
            state: "available",
            enhancedSiteType: null,
            forwardIds: [],
            backwardIds: [],
            knownDreamsignId: null,
          },
        },
      },
      siteRuntime: {
        [SITE_ID]: runtime(rank, runtimeOverrides),
      },
      ...overrides,
    },
  };
}

function apply(
  state: FoldState,
  type:
    | "PLACE_GRAVOK_WAGER"
    | "SETTLE_GRAVOK_WAGER"
    | "PLAY_AGAIN_GRAVOK_WAGER"
    | "REPLACE_GRAVOK_WAGER_DREAMSIGN"
    | "DRAW_TIDEMARK_LADDER_CLIMB"
    | "SETTLE_TIDEMARK_LADDER_CLIMB"
    | "REPLACE_TIDEMARK_LADDER_CLIMB_DREAMSIGN"
    | "DRAW_STARWAY_STAIRS"
    | "SETTLE_STARWAY_STAIRS"
    | "CASH_OUT_STARWAY_STAIRS"
    | "PLAY_AGAIN_STARWAY_STAIRS"
    | "DRAW_FOUR_SUIT_REPRISE"
    | "SETTLE_FOUR_SUIT_REPRISE"
    | "CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION"
    | "PLAY_AGAIN_FOUR_SUIT_REPRISE"
    | "DEAL_BLACKJACK"
    | "HIT_BLACKJACK"
    | "STAND_BLACKJACK"
    | "SETTLE_BLACKJACK"
    | "PLAY_AGAIN_BLACKJACK"
    | "COMPLETE_SITE",
  payload: Record<string, unknown>,
) {
  const event: GameEvent = {
    type,
    payload,
    actor: testEventActor("fixture-player"),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: 0,
  };
  const context: EventContext = {
    seq: 1,
    timestamp: "1970-01-01T00:00:00.000Z",
    rng: () => 0.5,
    intervening: [],
  };
  return reduceGameEvent(state, event, context);
}

afterEach(() => {
  registerSiteContentProvider(null);
});
beforeEach(() => {
  registerSiteContentProvider({
    sitesData: MINIMAL_SITES_DATA,
    economyData: ECONOMY,
    gambleData: GAMBLE,
    openSite: () => null,
  });
});

function wager(state: FoldState, gateId: GravokGateId) {
  return apply(state, "PLACE_GRAVOK_WAGER", {
    siteId: SITE_ID,
    gateId,
  });
}

function settleWager(state: FoldState) {
  const siteRuntime = state.journey.siteRuntime[SITE_ID];
  if (
    siteRuntime?.kind !== "gamble" ||
    siteRuntime.gameId !== "gravok-three-gate-wager"
  ) {
    throw new Error("expected Gamble runtime");
  }
  return apply(state, "SETTLE_GRAVOK_WAGER", {
    siteId: SITE_ID,
    shuffleCommitment: siteRuntime.shuffleCommitment,
  });
}

describe("Gravok's Three-Gate Wager", () => {
  it("settles the Six Gate exactly once when its result is presented", () => {
    const wagered = wager(stateWith("6"), "six");

    expect(wagered.outcome).toBe("applied");
    expect(wagered.state.journey.essence).toBe(150);
    expect(wagered.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      kind: "gamble",
      result: {
        gateId: "six",
        card: { rank: "6", suit: "clubs" },
        won: true,
        essenceGained: 100,
        essenceSettled: false,
      },
    });
    expect(
      apply(wagered.state, "COMPLETE_SITE", { siteId: SITE_ID })
        .outcome,
    ).toBe("bounced");

    const settled = settleWager(wagered.state);
    expect(settled.outcome).toBe("applied");
    expect(settled.state.journey.essence).toBe(250);
    expect(settled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: { essenceSettled: true },
    });
    const duplicate = settleWager(settled.state);
    expect(duplicate.outcome).toBe("bounced");
    expect(duplicate.state).toEqual(settled.state);
    expect(
      apply(settled.state, "COMPLETE_SITE", { siteId: SITE_ID })
        .outcome,
    ).toBe("applied");
  });

  it("busts below the chosen threshold and grants no reward", () => {
    const out = wager(stateWith("10"), "jack");

    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(150);
    expect(out.state.journey.dreamsigns).toEqual([]);
    expect(out.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: { won: false, essenceGained: 0, dreamsignAwarded: false },
    });
    expect(settleWager(out.state).state.journey.essence).toBe(150);
  });

  it("awards both jackpot rewards and spends the UUID-backed Dreamsign", () => {
    const out = wager(stateWith("J"), "jack");

    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(150);
    expect(out.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([
      REWARD_DREAMSIGN.id,
    ]);
    expect(out.state.journey.remainingDreamsignPool).toEqual([
      OTHER_DREAMSIGN_ID,
    ]);
    expect(out.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: {
        won: true,
        dreamsignAwarded: true,
        pendingDreamsignReplacement: false,
      },
    });
    expect(settleWager(out.state).state.journey.essence).toBe(350);
  });

  it("applies Farpoint's reduced cost without changing thresholds or payouts", () => {
    const out = wager(
      stateWith("9", {}, { isFarpoint: true, wagerCost: 45 }),
      "nine",
    );

    expect(out.outcome).toBe("applied");
    expect(out.state.journey.essence).toBe(155);
    expect(out.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: { gateId: "nine", won: true, essenceGained: 150 },
    });
    expect(settleWager(out.state).state.journey.essence).toBe(305);
  });

  it("bounces an unaffordable wager and an unavailable jackpot", () => {
    const poor = wager(stateWith("A", { essence: 49 }), "six");
    const unavailable = wager(
      stateWith("A", {}, { rewardDreamsign: null, dreamsignCandidateIds: [] }),
      "jack",
    );

    expect(poor.outcome).toBe("bounced");
    expect(poor.state.journey.essence).toBe(49);
    expect(unavailable.outcome).toBe("bounced");
    expect(unavailable.state.journey.essence).toBe(200);
  });

  it("holds a jackpot Dreamsign at the cap until a UUID replacement resolves", () => {
    const held: Dreamsign = {
      id: testDreamsignId("held-sign"),
      name: "Held Sign",
      effectDescription: "Held effect.",
    };
    const won = wager(
      stateWith("A", { maxDreamsigns: 1, dreamsigns: [held] }),
      "jack",
    );

    expect(won.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([
      held.id,
    ]);
    expect(won.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: {
        pendingDreamsignReplacement: true,
        dreamsignAwarded: false,
      },
    });

    const unsettledReplacement = apply(
      won.state,
      "REPLACE_GRAVOK_WAGER_DREAMSIGN",
      {
        siteId: SITE_ID,
        replacedDreamsignId: testDreamsignId("held-sign"),
      },
    );
    expect(unsettledReplacement.outcome).toBe("bounced");

    const settled = settleWager(won.state);
    const replaced = apply(settled.state, "REPLACE_GRAVOK_WAGER_DREAMSIGN", {
      siteId: SITE_ID,
      replacedDreamsignId: testDreamsignId("held-sign"),
    });
    expect(replaced.outcome).toBe("applied");
    expect(replaced.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([
      REWARD_DREAMSIGN.id,
    ]);
    expect(replaced.state.journey.visitedSites).not.toContain(SITE_ID);
    expect(replaced.state.journey.screen).toEqual({
      type: "site",
      siteId: SITE_ID,
    });
    expect(replaced.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: {
        dreamsignAwarded: true,
        pendingDreamsignReplacement: false,
        replacedDreamsignId: testDreamsignId("held-sign"),
      },
    });
  });

  it("rejects a second wager against a resolved commitment", () => {
    const first = wager(stateWith("Q"), "nine");
    const second = wager(first.state, "six");

    expect(second.outcome).toBe("bounced");
    expect(second.state).toEqual(first.state);
  });

  it("prepares a fresh full-deck commitment when the player plays again", () => {
    const provider: SiteContentProvider = {
      sitesData: MINIMAL_SITES_DATA,
      economyData: ECONOMY,
      gambleData: GAMBLE,
      openSite: () => ({
        runtime: runtime("K", {
          shuffleCommitment: parseShuffleCommitment("next-commitment"),
          committedCard: { rank: "K", suit: "diamonds" },
        }),
      }),
    };
    registerSiteContentProvider(provider);

    const wagered = wager(stateWith("6"), "six");
    const settled = settleWager(wagered.state);
    const replayed = apply(settled.state, "PLAY_AGAIN_GRAVOK_WAGER", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("fixture-commitment"),
    });

    expect(replayed.outcome).toBe("applied");
    expect(replayed.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      kind: "gamble",
      roundNumber: 2,
      shuffleCommitment: parseShuffleCommitment("next-commitment"),
      committedCard: { rank: "K", suit: "diamonds" },
      result: null,
    });
    expect(replayed.state.journey.essence).toBe(250);
    expect(replayed.state.journey.screen).toEqual({
      type: "site",
      siteId: SITE_ID,
    });

    const duplicate = apply(replayed.state, "PLAY_AGAIN_GRAVOK_WAGER", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("fixture-commitment"),
    });
    expect(duplicate.outcome).toBe("bounced");
    expect(wager(replayed.state, "nine").outcome).toBe("applied");
  });

  it("allows two retries and bounces a third", () => {
    const provider: SiteContentProvider = {
      sitesData: MINIMAL_SITES_DATA,
      economyData: ECONOMY,
      gambleData: GAMBLE,
      openSite: () => ({
        runtime: runtime("K", {
          shuffleCommitment: parseShuffleCommitment("final-commitment"),
          committedCard: { rank: "K", suit: "diamonds" },
        }),
      }),
    };
    registerSiteContentProvider(provider);

    const secondRound = settleWager(
      wager(stateWith("6", {}, { roundNumber: 2 }), "six").state,
    );
    const secondRetry = apply(secondRound.state, "PLAY_AGAIN_GRAVOK_WAGER", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("fixture-commitment"),
    });
    expect(secondRetry.outcome).toBe("applied");
    expect(secondRetry.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      roundNumber: 3,
      shuffleCommitment: parseShuffleCommitment("final-commitment"),
    });

    const thirdRound = settleWager(wager(secondRetry.state, "six").state);
    const thirdRetry = apply(thirdRound.state, "PLAY_AGAIN_GRAVOK_WAGER", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("final-commitment"),
    });
    expect(thirdRetry.outcome).toBe("bounced");
    expect(thirdRetry.state).toEqual(thirdRound.state);
  });
});

function ladderRuntime(
  cards: readonly StandardPlayingCard[],
  overrides: Partial<TidemarkLadderClimbSiteRuntime> = {},
): TidemarkLadderClimbSiteRuntime {
  return {
    kind: "gamble",
    gameId: "tidemark-ladder-climb",
    isFarpoint: false,
    shuffleCommitments: [
      parseShuffleCommitment("attempt-1"),
      parseShuffleCommitment("attempt-2"),
      parseShuffleCommitment("attempt-3"),
      parseShuffleCommitment("attempt-4"),
    ],
    committedCards: [...cards],
    dreamsignCandidateScores: [
      { dreamsignId: testDreamsignId("reward-sign"), score: 1 },
    ],
    strongPoolSize: 1,
    strongPoolCutoffScore: 1,
    rewardDreamsign: REWARD_DREAMSIGN,
    revealedCards: [],
    cumulativeCost: 0,
    result: null,
    ...overrides,
  };
}

function ladderStateWith(
  cards: readonly StandardPlayingCard[],
  journeyOverrides: Partial<JourneyState> = {},
  runtimeOverrides: Partial<TidemarkLadderClimbSiteRuntime> = {},
): FoldState {
  const base = stateWith("2", journeyOverrides);
  return {
    ...base,
    journey: {
      ...base.journey,
      siteRuntime: {
        [SITE_ID]: ladderRuntime(cards, runtimeOverrides),
      },
    },
  };
}

function drawLadder(state: FoldState) {
  return apply(state, "DRAW_TIDEMARK_LADDER_CLIMB", {
    siteId: SITE_ID,
  });
}

function settleLadder(state: FoldState) {
  const siteRuntime = state.journey.siteRuntime[SITE_ID];
  if (
    siteRuntime?.kind !== "gamble" ||
    siteRuntime.gameId !== "tidemark-ladder-climb" ||
    siteRuntime.result === null
  ) {
    throw new Error("expected Ladder Climb result");
  }
  return apply(state, "SETTLE_TIDEMARK_LADDER_CLIMB", {
    siteId: SITE_ID,
    shuffleCommitment:
      siteRuntime.shuffleCommitments[siteRuntime.result.attemptNumber - 1],
  });
}

describe("Tidemark Ladder Climb", () => {
  const missCards: readonly StandardPlayingCard[] = [
    { rank: "J", suit: "clubs" },
    { rank: "9", suit: "diamonds" },
    { rank: "7", suit: "hearts" },
    { rank: "5", suit: "spades" },
  ];

  it("draws attempt one for free and grants its hidden Dreamsign only at settlement", () => {
    const drawn = drawLadder(
      ladderStateWith([{ rank: "Q", suit: "clubs" }, ...missCards.slice(1)]),
    );

    expect(drawn.outcome).toBe("applied");
    expect(drawn.state.journey.essence).toBe(200);
    expect(drawn.state.journey.dreamsigns).toEqual([]);
    expect(drawn.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      cumulativeCost: 0,
      revealedCards: [{ rank: "Q", suit: "clubs" }],
      result: {
        attemptNumber: 1,
        won: true,
        costPaid: 0,
        resultSettled: false,
      },
    });
    expect(
      apply(drawn.state, "COMPLETE_SITE", { siteId: SITE_ID })
        .outcome,
    ).toBe("bounced");

    const settled = settleLadder(drawn.state);
    expect(settled.outcome).toBe("applied");
    expect(settled.state.journey.essence).toBe(225);
    expect(settled.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([
      REWARD_DREAMSIGN.id,
    ]);
    expect(settled.state.journey.remainingDreamsignPool).toEqual([
      OTHER_DREAMSIGN_ID,
    ]);
    expect(settled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: {
        resultSettled: true,
        dreamsignAwarded: true,
        pendingDreamsignReplacement: false,
      },
    });
    expect(drawLadder(settled.state).outcome).toBe("bounced");
    expect(
      apply(settled.state, "COMPLETE_SITE", { siteId: SITE_ID })
        .outcome,
    ).toBe("applied");
  });

  it("unlocks broader attempts one at a time for free at Farpoint", () => {
    const start = ladderStateWith(
      [
        { rank: "J", suit: "clubs" },
        { rank: "10", suit: "diamonds" },
        ...missCards.slice(2),
      ],
      {},
      { isFarpoint: true },
    );
    const first = drawLadder(start);
    expect(first.state.journey.essence).toBe(200);
    expect(first.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: { attemptNumber: 1, won: false, costPaid: 0 },
    });
    expect(drawLadder(first.state).outcome).toBe("bounced");

    const firstSettled = settleLadder(first.state);
    const second = drawLadder(firstSettled.state);
    expect(second.state.journey.essence).toBe(200);
    expect(second.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      cumulativeCost: 0,
      result: { attemptNumber: 2, won: true, costPaid: 0 },
    });
  });

  it("charges 30 Essence across four misses and stops after the last draw", () => {
    let current = ladderStateWith(missCards);
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const drawn = drawLadder(current);
      expect(drawn.outcome).toBe("applied");
      expect(drawn.state.journey.siteRuntime[SITE_ID]).toMatchObject({
        result: { attemptNumber: attempt, won: false },
      });
      current = settleLadder(drawn.state).state;
    }

    expect(current.journey.essence).toBe(170);
    expect(current.journey.dreamsigns).toEqual([]);
    expect(current.journey.siteRuntime[SITE_ID]).toMatchObject({
      cumulativeCost: 30,
      revealedCards: missCards,
    });
    expect(drawLadder(current).outcome).toBe("bounced");
  });

  it("bounces unaffordable attempts without charging Essence", () => {
    const first = settleLadder(
      drawLadder(ladderStateWith(missCards, { essence: 4 })).state,
    );
    const poor = drawLadder(first.state);

    expect(poor.outcome).toBe("bounced");
    expect(poor.state.journey.essence).toBe(4);
  });

  it("holds a win at the cap until UUID replacement settles", () => {
    const held: Dreamsign = {
      id: testDreamsignId("held-sign"),
      name: "Held Sign",
      effectDescription: "Held effect.",
    };
    const drawn = drawLadder(
      ladderStateWith([{ rank: "A", suit: "spades" }, ...missCards.slice(1)], {
        maxDreamsigns: 1,
        dreamsigns: [held],
      }),
    );
    const settled = settleLadder(drawn.state);
    expect(settled.state.journey.essence).toBe(225);
    expect(settled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: {
        resultSettled: true,
        dreamsignAwarded: false,
        pendingDreamsignReplacement: true,
      },
    });
    expect(
      apply(settled.state, "COMPLETE_SITE", { siteId: SITE_ID })
        .outcome,
    ).toBe("bounced");

    const replaced = apply(
      settled.state,
      "REPLACE_TIDEMARK_LADDER_CLIMB_DREAMSIGN",
      {
        siteId: SITE_ID,
        replacedDreamsignId: testDreamsignId("held-sign"),
      },
    );
    expect(replaced.outcome).toBe("applied");
    expect(replaced.state.journey.essence).toBe(225);
    expect(replaced.state.journey.dreamsigns.map((sign) => sign.id)).toEqual([
      REWARD_DREAMSIGN.id,
    ]);
    expect(replaced.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      result: {
        dreamsignAwarded: true,
        pendingDreamsignReplacement: false,
        replacedDreamsignId: testDreamsignId("held-sign"),
      },
    });
  });
});

function starwayRuntime(
  cards: readonly StandardPlayingCard[],
  overrides: Partial<StarwayStairsSiteRuntime> = {},
): StarwayStairsSiteRuntime {
  return {
    kind: "gamble",
    gameId: "starway-stairs",
    roundNumber: 1,
    isFarpoint: false,
    wagerAmount: 30,
    shuffleCommitments: [
      parseShuffleCommitment("tier-1"),
      parseShuffleCommitment("tier-2"),
      parseShuffleCommitment("tier-3"),
    ],
    committedCards: [...cards],
    results: [],
    terminalReason: null,
    prizeAwarded: 0,
    ...overrides,
  };
}

function starwayStateWith(
  cards: readonly StandardPlayingCard[],
  journeyOverrides: Partial<JourneyState> = {},
  runtimeOverrides: Partial<StarwayStairsSiteRuntime> = {},
): FoldState {
  const base = stateWith("2", journeyOverrides);
  return {
    ...base,
    journey: {
      ...base.journey,
      siteRuntime: {
        [SITE_ID]: starwayRuntime(cards, runtimeOverrides),
      },
    },
  };
}

function drawStarway(state: FoldState) {
  return apply(state, "DRAW_STARWAY_STAIRS", { siteId: SITE_ID });
}

function settleStarway(state: FoldState) {
  const siteRuntime = state.journey.siteRuntime[SITE_ID];
  if (
    siteRuntime?.kind !== "gamble" ||
    siteRuntime.gameId !== "starway-stairs"
  ) {
    throw new Error("expected Starway Stairs runtime");
  }
  const result = siteRuntime.results[siteRuntime.results.length - 1];
  if (result === undefined) throw new Error("expected Starway Stairs result");
  return apply(state, "SETTLE_STARWAY_STAIRS", {
    siteId: SITE_ID,
    shuffleCommitment: siteRuntime.shuffleCommitments[result.tierNumber - 1],
  });
}

describe("Starway Stairs", () => {
  const safeCards: readonly StandardPlayingCard[] = [
    { rank: "3", suit: "clubs" },
    { rank: "5", suit: "diamonds" },
    { rank: "8", suit: "hearts" },
  ];

  it("charges the first tier and banks a settled safe prize", () => {
    const firstDraw = drawStarway(starwayStateWith(safeCards));
    expect(firstDraw.outcome).toBe("applied");
    expect(firstDraw.state.journey.essence).toBe(170);

    const firstSettled = settleStarway(firstDraw.state);
    expect(firstSettled.outcome).toBe("applied");
    expect(firstSettled.state.journey.essence).toBe(170);
    expect(firstSettled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      results: [{ tierNumber: 1, busted: false, resultSettled: true }],
      terminalReason: null,
    });

    const cashedOut = apply(firstSettled.state, "CASH_OUT_STARWAY_STAIRS", {
      siteId: SITE_ID,
      shuffleCommitment: parseShuffleCommitment("tier-1"),
    });
    expect(cashedOut.outcome).toBe("applied");
    expect(cashedOut.state.journey.essence).toBe(230);
    expect(cashedOut.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      terminalReason: "cashed-out",
      prizeAwarded: 60,
    });
  });

  it("loses the unclaimed prize when a later tier busts", () => {
    const firstSettled = settleStarway(
      drawStarway(
        starwayStateWith([
          safeCards[0],
          { rank: "4", suit: "spades" },
          safeCards[2],
        ]),
      ).state,
    );
    const secondDraw = drawStarway(firstSettled.state);
    expect(secondDraw.state.journey.essence).toBe(140);
    const busted = settleStarway(secondDraw.state);

    expect(busted.outcome).toBe("applied");
    expect(busted.state.journey.essence).toBe(140);
    expect(busted.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      terminalReason: "bust",
      prizeAwarded: 0,
      results: [
        { tierNumber: 1, busted: false, resultSettled: true },
        { tierNumber: 2, busted: true, resultSettled: true },
      ],
    });
  });

  it("automatically awards the top prize after the third safe reveal", () => {
    let state = starwayStateWith(safeCards);
    for (let tier = 0; tier < 3; tier += 1) {
      const drawn = drawStarway(state);
      expect(drawn.state.journey.essence).toBe(170 - tier * 30);
      state = settleStarway(drawn.state).state;
    }

    expect(state.journey.essence).toBe(410);
    expect(state.journey.siteRuntime[SITE_ID]).toMatchObject({
      terminalReason: "top",
      prizeAwarded: 300,
    });
  });

  it("charges the reduced tier wager at Farpoint Station", () => {
    const drawn = drawStarway(
      starwayStateWith(safeCards, {}, { isFarpoint: true, wagerAmount: 20 }),
    );
    expect(drawn.outcome).toBe("applied");
    expect(drawn.state.journey.essence).toBe(180);
  });

  it("blocks leaving while a safe result awaits a cash-out or climb", () => {
    const settled = settleStarway(
      drawStarway(starwayStateWith(safeCards)).state,
    );
    const leave = apply(settled.state, "COMPLETE_SITE", {
      siteId: SITE_ID,
    });
    expect(leave.outcome).toBe("bounced");
  });

  it("requires enough Essence before every climb", () => {
    const firstSettled = settleStarway(
      drawStarway(starwayStateWith(safeCards, { essence: 30 })).state,
    );
    expect(firstSettled.state.journey.essence).toBe(0);

    const blockedClimb = drawStarway(firstSettled.state);
    expect(blockedClimb.outcome).toBe("bounced");
    expect(blockedClimb.state).toEqual(firstSettled.state);
  });

  it("bounces a stale cash-out commitment after a later safe tier", () => {
    let state = starwayStateWith(safeCards);
    state = settleStarway(drawStarway(state).state).state;
    state = settleStarway(drawStarway(state).state).state;

    const staleCashOut = apply(state, "CASH_OUT_STARWAY_STAIRS", {
      siteId: SITE_ID,
      shuffleCommitment: parseShuffleCommitment("tier-1"),
    });
    expect(staleCashOut.outcome).toBe("bounced");
    expect(staleCashOut.state.journey.essence).toBe(140);
    expect(staleCashOut.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      terminalReason: null,
      prizeAwarded: 0,
    });
  });

  it("prepares an independent round and charges its first wager only when betting", () => {
    registerSiteContentProvider({
      sitesData: MINIMAL_SITES_DATA,
      economyData: ECONOMY,
      gambleData: GAMBLE,
      openSite: () => ({
        runtime: starwayRuntime(safeCards, {
          shuffleCommitments: [
            parseShuffleCommitment("next-1"),
            parseShuffleCommitment("next-2"),
            parseShuffleCommitment("next-3"),
          ],
        }),
      }),
    });
    const busted = settleStarway(
      drawStarway(
        starwayStateWith([
          { rank: "2", suit: "clubs" },
          safeCards[1],
          safeCards[2],
        ]),
      ).state,
    );

    const replayed = apply(busted.state, "PLAY_AGAIN_STARWAY_STAIRS", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("tier-1"),
    });
    expect(replayed.outcome).toBe("applied");
    expect(replayed.state.journey.essence).toBe(170);
    expect(replayed.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      roundNumber: 2,
      shuffleCommitments: ["next-1", "next-2", "next-3"],
      results: [],
      terminalReason: null,
    });

    const nextBet = drawStarway(replayed.state);
    expect(nextBet.outcome).toBe("applied");
    expect(nextBet.state.journey.essence).toBe(140);

    const staleReplay = apply(replayed.state, "PLAY_AGAIN_STARWAY_STAIRS", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("tier-1"),
    });
    expect(staleReplay.outcome).toBe("bounced");
  });

  it("allows two retries and bounces a third Starway round", () => {
    registerSiteContentProvider({
      sitesData: MINIMAL_SITES_DATA,
      economyData: ECONOMY,
      gambleData: GAMBLE,
      openSite: () => ({
        runtime: starwayRuntime(
          [{ rank: "2", suit: "diamonds" }, safeCards[1], safeCards[2]],
          {
            shuffleCommitments: [
              parseShuffleCommitment("final-1"),
              parseShuffleCommitment("final-2"),
              parseShuffleCommitment("final-3"),
            ],
          },
        ),
      }),
    });
    const secondRound = settleStarway(
      drawStarway(
        starwayStateWith(
          [{ rank: "2", suit: "clubs" }, safeCards[1], safeCards[2]],
          {},
          { roundNumber: 2 },
        ),
      ).state,
    );
    const secondRetry = apply(secondRound.state, "PLAY_AGAIN_STARWAY_STAIRS", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("tier-1"),
    });
    expect(secondRetry.outcome).toBe("applied");
    expect(secondRetry.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      roundNumber: 3,
      shuffleCommitments: ["final-1", "final-2", "final-3"],
    });

    const thirdRound = settleStarway(drawStarway(secondRetry.state).state);
    const thirdRetry = apply(thirdRound.state, "PLAY_AGAIN_STARWAY_STAIRS", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("final-1"),
    });
    expect(thirdRetry.outcome).toBe("bounced");
    expect(thirdRetry.state).toEqual(thirdRound.state);
  });
});

function fourSuitCard(index: number): CardData {
  return {
    name: parseCardName(`Fixture Card ${String(index)}`),
    id: testCardId(`fixture-card-${String(index)}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 3,
    spark: 2,
    isFast: false,
    renderedText: "Gain 2 spark.",
    imageNumber: index,
    artOwned: false,
  };
}

function fourSuitTarget(
  index: number,
  entryId = `deck-${String(index)}`,
): FourSuitRepriseTarget {
  const card = fourSuitCard(index);
  return {
    entryId: parseDeckEntryId(entryId),
    cardId: card.id,
    cardNumber: card.cardNumber,
    cardSnapshot: card,
    transfigurationOffers: [
      {
        entryId: parseDeckEntryId(entryId),
        type: "Empowered",
        effectDescription: "Fixture form.",
        effectDetails: {},
        previewCard: { ...card, energyCost: 2 },
        essenceCost: 0,
      },
    ],
  };
}

function fourSuitRuntime(
  cards: readonly StandardPlayingCard[],
  overrides: Partial<FourSuitRepriseSiteRuntime> = {},
): FourSuitRepriseSiteRuntime {
  return {
    kind: "gamble",
    gameId: "four-suit-reprise",
    isFarpoint: false,
    drawCost: 25,
    shuffleCommitments: [
      parseShuffleCommitment("round-1"),
      parseShuffleCommitment("round-2"),
      parseShuffleCommitment("round-3"),
    ],
    committedCards: [...cards],
    targets: [fourSuitTarget(1), fourSuitTarget(2), fourSuitTarget(3)],
    rounds: [],
    phase: "choose",
    ...overrides,
  };
}

function fourSuitStateWith(
  cards: readonly StandardPlayingCard[],
  runtimeOverrides: Partial<FourSuitRepriseSiteRuntime> = {},
): FoldState {
  const targets = runtimeOverrides.targets ?? [
    fourSuitTarget(1),
    fourSuitTarget(2),
    fourSuitTarget(3),
  ];
  const base = stateWith("2", {
    deck: targets.map((target) => ({
      entryId: target.entryId,
      cardNumber: target.cardNumber,
      transfiguration: null,
      isBane: false,
    })),
  });
  return {
    ...base,
    journey: {
      ...base.journey,
      siteRuntime: {
        [SITE_ID]: fourSuitRuntime(cards, { ...runtimeOverrides, targets }),
      },
    },
  };
}

function drawFourSuit(state: FoldState, entryId: DeckEntryId) {
  return apply(state, "DRAW_FOUR_SUIT_REPRISE", {
    siteId: SITE_ID,
    entryId,
  });
}

function settleFourSuit(state: FoldState) {
  const siteRuntime = state.journey.siteRuntime[SITE_ID];
  if (
    siteRuntime?.kind !== "gamble" ||
    siteRuntime.gameId !== "four-suit-reprise"
  ) {
    throw new Error("expected Four-Suit Reprise runtime");
  }
  const round = siteRuntime.rounds[siteRuntime.rounds.length - 1];
  if (round === undefined) throw new Error("expected Four-Suit Reprise round");
  return apply(state, "SETTLE_FOUR_SUIT_REPRISE", {
    siteId: SITE_ID,
    shuffleCommitment: round.shuffleCommitment,
  });
}

describe("Four-Suit Reprise", () => {
  const followupCards: readonly StandardPlayingCard[] = [
    { rank: "4", suit: "diamonds" },
    { rank: "7", suit: "hearts" },
    { rank: "Q", suit: "clubs" },
  ];

  it("charges one draw and grants Diamonds while leaving the target unchanged", () => {
    const drawn = drawFourSuit(
      fourSuitStateWith(followupCards),
      parseDeckEntryId("deck-1"),
    );
    expect(drawn.outcome).toBe("applied");
    expect(drawn.state.journey.essence).toBe(175);
    expect(drawn.state.journey.deck).toHaveLength(3);
    expect(
      apply(drawn.state, "COMPLETE_SITE", { siteId: SITE_ID })
        .outcome,
    ).toBe("bounced");

    const settled = settleFourSuit(drawn.state);
    expect(settled.outcome).toBe("applied");
    expect(settled.state.journey.essence).toBe(275);
    expect(settled.state.journey.deck).toHaveLength(3);
    expect(settled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      phase: "result",
      rounds: [
        {
          targetEntryId: parseDeckEntryId("deck-1"),
          targetCardId: testCardId("fixture-card-1"),
          outcome: "essence",
          resultRevealed: true,
          resultSettled: true,
          essenceGained: 100,
        },
      ],
    });
  });

  it("duplicates on Hearts and purges on Clubs", () => {
    const heartsState = fourSuitStateWith([
      { rank: "7", suit: "hearts" },
      followupCards[1],
      followupCards[2],
    ]);
    const duplicated = settleFourSuit(
      drawFourSuit(heartsState, parseDeckEntryId("deck-1")).state,
    );
    expect(duplicated.state.journey.deck).toHaveLength(4);
    expect(duplicated.state.journey.deck[3]).toMatchObject({
      cardNumber: 1,
      transfiguration: null,
      isBane: false,
    });
    expect(duplicated.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      rounds: [{ outcome: "duplication", resultSettled: true }],
    });

    const clubsState = fourSuitStateWith([
      { rank: "Q", suit: "clubs" },
      followupCards[1],
      followupCards[2],
    ]);
    const purged = settleFourSuit(
      drawFourSuit(clubsState, parseDeckEntryId("deck-1")).state,
    );
    expect(purged.state.journey.deck.map((entry) => entry.entryId)).toEqual([
      "deck-2",
      "deck-3",
    ]);
    expect(purged.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      rounds: [{ outcome: "purge", resultSettled: true }],
    });
  });

  it("requires a free chosen Transfiguration after Spades", () => {
    const drawn = drawFourSuit(
      fourSuitStateWith([
        { rank: "A", suit: "spades" },
        followupCards[1],
        followupCards[2],
      ]),
      parseDeckEntryId("deck-1"),
    );
    const revealed = settleFourSuit(drawn.state);
    expect(revealed.outcome).toBe("applied");
    expect(revealed.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      rounds: [
        {
          outcome: "transfiguration",
          resultRevealed: true,
          resultSettled: false,
        },
      ],
    });
    expect(
      apply(revealed.state, "COMPLETE_SITE", { siteId: SITE_ID })
        .outcome,
    ).toBe("bounced");

    const chosen = apply(
      revealed.state,
      "CHOOSE_FOUR_SUIT_REPRISE_TRANSFIGURATION",
      {
        siteId: SITE_ID,
        shuffleCommitment: parseShuffleCommitment("round-1"),
        type: "Empowered",
      },
    );
    expect(chosen.outcome).toBe("applied");
    expect(chosen.state.journey.deck[0]?.transfiguration).toBe("Empowered");
    expect(chosen.state.journey.essence).toBe(175);
    expect(chosen.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      rounds: [
        {
          resultSettled: true,
          chosenTransfiguration: "Empowered",
        },
      ],
    });
  });

  it("uses different card UUIDs across no more than three paid rounds", () => {
    const duplicateCardTarget = fourSuitTarget(1, "deck-1-copy");
    const targets = [
      fourSuitTarget(1),
      duplicateCardTarget,
      fourSuitTarget(2),
      fourSuitTarget(3),
      fourSuitTarget(4),
    ];
    let state = settleFourSuit(
      drawFourSuit(
        fourSuitStateWith(followupCards, { targets }),
        parseDeckEntryId("deck-1"),
      ).state,
    ).state;
    let replay = apply(state, "PLAY_AGAIN_FOUR_SUIT_REPRISE", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("round-1"),
    });
    expect(replay.outcome).toBe("applied");
    expect(
      drawFourSuit(replay.state, parseDeckEntryId("deck-1-copy")).outcome,
    ).toBe("bounced");

    state = settleFourSuit(
      drawFourSuit(replay.state, parseDeckEntryId("deck-2")).state,
    ).state;
    replay = apply(state, "PLAY_AGAIN_FOUR_SUIT_REPRISE", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("round-2"),
    });
    expect(replay.outcome).toBe("applied");
    state = settleFourSuit(
      drawFourSuit(replay.state, parseDeckEntryId("deck-3")).state,
    ).state;

    const fourthRound = apply(state, "PLAY_AGAIN_FOUR_SUIT_REPRISE", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("round-3"),
    });
    expect(fourthRound.outcome).toBe("bounced");
    expect(state.journey.essence).toBe(225);
    expect(state.journey.siteRuntime[SITE_ID]).toMatchObject({
      rounds: [{ roundNumber: 1 }, { roundNumber: 2 }, { roundNumber: 3 }],
    });
  });

  it("uses the Farpoint draw cost", () => {
    const drawn = drawFourSuit(
      fourSuitStateWith(followupCards, { isFarpoint: true, drawCost: 15 }),
      parseDeckEntryId("deck-1"),
    );
    expect(drawn.outcome).toBe("applied");
    expect(drawn.state.journey.essence).toBe(185);
  });
});

function blackjackRuntime(
  cards: readonly StandardPlayingCard[],
  overrides: Partial<BlackjackSiteRuntime> = {},
): BlackjackSiteRuntime {
  return {
    kind: "gamble",
    gameId: "blackjack",
    isFarpoint: false,
    wagerCost: 50,
    prizeEssence: 300,
    attemptNumber: 1,
    shuffleCommitment: parseShuffleCommitment("blackjack-hand"),
    committedDeck: [...cards],
    deckCursor: 0,
    playerCards: [],
    dealerCards: [],
    dealerRevealed: false,
    wagerPaid: false,
    playerDecision: null,
    outcome: null,
    resultSettled: false,
    essenceAwarded: 0,
    ...overrides,
  };
}

function blackjackStateWith(
  cards: readonly StandardPlayingCard[],
  stateOverrides: Partial<JourneyState> = {},
  runtimeOverrides: Partial<BlackjackSiteRuntime> = {},
): FoldState {
  const base = stateWith("2", stateOverrides);
  return {
    ...base,
    journey: {
      ...base.journey,
      siteRuntime: {
        [SITE_ID]: blackjackRuntime(cards, runtimeOverrides),
      },
    },
  };
}

function settleBlackjack(state: FoldState) {
  const siteRuntime = state.journey.siteRuntime[SITE_ID];
  if (siteRuntime?.kind !== "gamble" || siteRuntime.gameId !== "blackjack") {
    throw new Error("expected Blackjack runtime");
  }
  return apply(state, "SETTLE_BLACKJACK", {
    siteId: SITE_ID,
    shuffleCommitment: siteRuntime.shuffleCommitment,
  });
}

describe("Blackjack", () => {
  it("deals both opening hands and pays the flat prize for a player blackjack", () => {
    const dealt = apply(
      blackjackStateWith([
        { rank: "A", suit: "spades" },
        { rank: "10", suit: "clubs" },
        { rank: "K", suit: "hearts" },
        { rank: "9", suit: "diamonds" },
      ]),
      "DEAL_BLACKJACK",
      { siteId: SITE_ID },
    );
    expect(dealt.outcome).toBe("applied");
    expect(dealt.state.journey.essence).toBe(150);
    expect(dealt.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      deckCursor: 4,
      playerCards: [{ rank: "A" }, { rank: "K" }],
      dealerCards: [{ rank: "10" }, { rank: "9" }],
      dealerRevealed: true,
      outcome: "player-win",
      resultSettled: false,
    });

    const settled = settleBlackjack(dealt.state);
    expect(settled.outcome).toBe("applied");
    expect(settled.state.journey.essence).toBe(450);
    expect(settled.state.journey.dreamsigns).toEqual([]);
    expect(settled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      essenceAwarded: 300,
      resultSettled: true,
    });
  });

  it("keeps hits free, then draws the dealer to 17 before comparing hands", () => {
    const dealt = apply(
      blackjackStateWith([
        { rank: "A", suit: "clubs" },
        { rank: "10", suit: "spades" },
        { rank: "5", suit: "hearts" },
        { rank: "6", suit: "clubs" },
        { rank: "3", suit: "diamonds" },
        { rank: "K", suit: "diamonds" },
      ]),
      "DEAL_BLACKJACK",
      { siteId: SITE_ID },
    );
    const hit = apply(dealt.state, "HIT_BLACKJACK", {
      siteId: SITE_ID,
    });
    expect(hit.outcome).toBe("applied");
    expect(hit.state.journey.essence).toBe(150);
    expect(hit.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      deckCursor: 5,
      playerCards: [{ rank: "A" }, { rank: "5" }, { rank: "3" }],
      dealerRevealed: false,
      outcome: null,
    });
    const stood = apply(hit.state, "STAND_BLACKJACK", {
      siteId: SITE_ID,
    });
    expect(stood.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      deckCursor: 6,
      dealerCards: [{ rank: "10" }, { rank: "6" }, { rank: "K" }],
      dealerRevealed: true,
      outcome: "player-win",
    });
    const settled = settleBlackjack(stood.state);
    expect(settled.state.journey.essence).toBe(450);
    expect(settled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      essenceAwarded: 300,
      resultSettled: true,
    });
  });

  it("reveals the dealer and resolves a player bust without drawing", () => {
    const dealt = apply(
      blackjackStateWith([
        { rank: "K", suit: "clubs" },
        { rank: "10", suit: "spades" },
        { rank: "9", suit: "hearts" },
        { rank: "6", suit: "clubs" },
        { rank: "5", suit: "diamonds" },
      ]),
      "DEAL_BLACKJACK",
      { siteId: SITE_ID },
    );
    const hit = apply(dealt.state, "HIT_BLACKJACK", {
      siteId: SITE_ID,
    });
    expect(hit.state.journey.essence).toBe(150);
    expect(hit.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      deckCursor: 5,
      dealerRevealed: true,
      outcome: "dealer-win",
    });
    const settled = settleBlackjack(hit.state);
    expect(settled.state.journey.essence).toBe(150);
    expect(settled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      essenceAwarded: 0,
      resultSettled: true,
    });

    registerSiteContentProvider({
      sitesData: MINIMAL_SITES_DATA,
      economyData: ECONOMY,
      gambleData: GAMBLE,
      openSite: () => ({
        runtime: blackjackRuntime(
          [
            { rank: "10", suit: "hearts" },
            { rank: "9", suit: "clubs" },
            { rank: "5", suit: "spades" },
            { rank: "7", suit: "diamonds" },
          ],
          { shuffleCommitment: parseShuffleCommitment("bust-retry-hand") },
        ),
      }),
    });
    const replayed = apply(settled.state, "PLAY_AGAIN_BLACKJACK", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("blackjack-hand"),
    });
    expect(replayed.outcome).toBe("applied");
    expect(replayed.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      attemptNumber: 2,
      shuffleCommitment: parseShuffleCommitment("bust-retry-hand"),
      wagerPaid: true,
    });
  });

  it("offers another paid attempt after a dealer blackjack", () => {
    const dealt = apply(
      blackjackStateWith([
        { rank: "10", suit: "clubs" },
        { rank: "A", suit: "spades" },
        { rank: "9", suit: "hearts" },
        { rank: "K", suit: "diamonds" },
      ]),
      "DEAL_BLACKJACK",
      { siteId: SITE_ID },
    );
    expect(dealt.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      dealerRevealed: true,
      outcome: "dealer-win",
    });
    const settled = settleBlackjack(dealt.state);
    registerSiteContentProvider({
      sitesData: MINIMAL_SITES_DATA,
      economyData: ECONOMY,
      gambleData: GAMBLE,
      openSite: () => ({
        runtime: blackjackRuntime(
          [
            { rank: "10", suit: "hearts" },
            { rank: "9", suit: "clubs" },
            { rank: "5", suit: "spades" },
            { rank: "7", suit: "diamonds" },
          ],
          { shuffleCommitment: parseShuffleCommitment("dealer-blackjack-retry") },
        ),
      }),
    });
    const replayed = apply(settled.state, "PLAY_AGAIN_BLACKJACK", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("blackjack-hand"),
    });
    expect(replayed.outcome).toBe("applied");
    expect(replayed.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      attemptNumber: 2,
      shuffleCommitment: parseShuffleCommitment("dealer-blackjack-retry"),
      wagerPaid: true,
    });
  });

  it("allows at most three paid attempts after losses", () => {
    const state = blackjackStateWith(
      [],
      {},
      {
        attemptNumber: 3,
        shuffleCommitment: parseShuffleCommitment("third-attempt"),
        playerCards: [
          { rank: "K", suit: "clubs" },
          { rank: "9", suit: "hearts" },
          { rank: "5", suit: "diamonds" },
        ],
        dealerCards: [
          { rank: "10", suit: "spades" },
          { rank: "6", suit: "clubs" },
        ],
        dealerRevealed: true,
        wagerPaid: true,
        outcome: "dealer-win",
        resultSettled: true,
      },
    );
    const replayed = apply(state, "PLAY_AGAIN_BLACKJACK", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("third-attempt"),
    });
    expect(replayed.outcome).toBe("bounced");
  });

  it("advances directly through the dealer turn when a hit reaches 21", () => {
    const dealt = apply(
      blackjackStateWith([
        { rank: "10", suit: "clubs" },
        { rank: "9", suit: "spades" },
        { rank: "5", suit: "hearts" },
        { rank: "7", suit: "clubs" },
        { rank: "6", suit: "diamonds" },
        { rank: "K", suit: "hearts" },
      ]),
      "DEAL_BLACKJACK",
      { siteId: SITE_ID },
    );
    const hit = apply(dealt.state, "HIT_BLACKJACK", {
      siteId: SITE_ID,
    });
    expect(hit.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      deckCursor: 6,
      playerCards: [{ rank: "10" }, { rank: "5" }, { rank: "6" }],
      dealerCards: [{ rank: "9" }, { rank: "7" }, { rank: "K" }],
      dealerRevealed: true,
      playerDecision: "hit",
      outcome: "player-win",
    });
  });

  it("refunds the wager on a push and makes the enhanced wager cheaper", () => {
    const dealt = apply(
      blackjackStateWith(
        [
          { rank: "10", suit: "clubs" },
          { rank: "9", suit: "spades" },
          { rank: "8", suit: "hearts" },
          { rank: "9", suit: "diamonds" },
        ],
        {},
        { isFarpoint: true, wagerCost: 40 },
      ),
      "DEAL_BLACKJACK",
      { siteId: SITE_ID },
    );
    expect(dealt.state.journey.essence).toBe(160);
    const stood = apply(dealt.state, "STAND_BLACKJACK", {
      siteId: SITE_ID,
    });
    expect(stood.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      outcome: "push",
    });
    const settled = settleBlackjack(stood.state);
    expect(settled.state.journey.essence).toBe(200);
    expect(settled.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      essenceAwarded: 40,
    });

    registerSiteContentProvider({
      sitesData: MINIMAL_SITES_DATA,
      economyData: ECONOMY,
      gambleData: GAMBLE,
      openSite: () => ({
        runtime: blackjackRuntime(
          [
            { rank: "10", suit: "hearts" },
            { rank: "9", suit: "clubs" },
            { rank: "5", suit: "spades" },
            { rank: "7", suit: "diamonds" },
          ],
          {
            isFarpoint: true,
            wagerCost: 40,
            shuffleCommitment: parseShuffleCommitment("next-blackjack-hand"),
          },
        ),
      }),
    });
    const replayed = apply(settled.state, "PLAY_AGAIN_BLACKJACK", {
      siteId: SITE_ID,
      previousShuffleCommitment: parseShuffleCommitment("blackjack-hand"),
    });
    expect(replayed.outcome).toBe("applied");
    expect(replayed.state.journey.essence).toBe(160);
    expect(replayed.state.journey.siteRuntime[SITE_ID]).toMatchObject({
      shuffleCommitment: parseShuffleCommitment("next-blackjack-hand"),
      wagerPaid: true,
      deckCursor: 4,
      playerCards: [{ rank: "10" }, { rank: "5" }],
      dealerCards: [{ rank: "9" }, { rank: "7" }],
      outcome: null,
      resultSettled: false,
    });
  });
});
