import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StandardPlayingCard } from "../../../types/gamble";
import type {
  JourneyState,
  TidemarkLadderClimbSiteRuntime,
} from "../../../types/journey";
import { parseShuffleCommitment } from "../../../types/identifiers";
import { testDreamsignId } from "../../../types/test-identities";
import { testGambleSelectionTrace } from "../../../testing/gamble-fixture";
import type { FoldState } from "../../fold-state";
import { registerSiteContentProvider } from "../sites";
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

function ladderRuntime(
  cards: readonly StandardPlayingCard[],
  overrides: Partial<TidemarkLadderClimbSiteRuntime> = {},
): TidemarkLadderClimbSiteRuntime {
  return {
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
  return gambleStateWith(
    ladderRuntime(cards, runtimeOverrides),
    journeyOverrides,
  );
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
      apply(drawn.state, "COMPLETE_SITE", { siteId: SITE_ID }).outcome,
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
      apply(settled.state, "COMPLETE_SITE", { siteId: SITE_ID }).outcome,
    ).toBe("applied");
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
});
