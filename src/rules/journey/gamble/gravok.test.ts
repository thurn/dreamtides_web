import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GravokGateId,
  StandardPlayingCardRank,
} from "../../../types/gamble";
import type {
  Dreamsign,
  GravokWagerSiteRuntime,
  JourneyState,
} from "../../../types/journey";
import { parseShuffleCommitment } from "../../../types/identifiers";
import { testDreamsignId } from "../../../types/test-identities";
import { testGambleSelectionTrace } from "../../../testing/gamble-fixture";
import type { FoldState } from "../../fold-state";
import { isSiteVisited, registerSiteContentProvider } from "../sites";
import { testSiteContentProvider } from "../test-content-providers";
import {
  apply,
  gambleStateWith,
  OTHER_DREAMSIGN_ID,
  REWARD_DREAMSIGN,
  SITE_ID,
} from "./test-fixture";

afterEach(() => {
  registerSiteContentProvider(null);
});
beforeEach(() => {
  registerSiteContentProvider(testSiteContentProvider());
});

function runtime(
  rank: StandardPlayingCardRank,
  overrides: Partial<GravokWagerSiteRuntime> = {},
): GravokWagerSiteRuntime {
  return {
    kind: "gamble",
    gameId: "gravok-three-gate-wager",
    selectionTrace: testGambleSelectionTrace("gravok-three-gate-wager"),
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
  return gambleStateWith(runtime(rank, runtimeOverrides), overrides);
}

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
      apply(wagered.state, "COMPLETE_SITE", { siteId: SITE_ID }).outcome,
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
      apply(settled.state, "COMPLETE_SITE", { siteId: SITE_ID }).outcome,
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
    expect(isSiteVisited(replaced.state.journey, SITE_ID)).toBe(false);
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

  it("allows two retries and bounces a third", () => {
    const provider = testSiteContentProvider({
      openSite: () => ({
        runtime: runtime("K", {
          shuffleCommitment: parseShuffleCommitment("final-commitment"),
          committedCard: { rank: "K", suit: "diamonds" },
        }),
      }),
    });
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
