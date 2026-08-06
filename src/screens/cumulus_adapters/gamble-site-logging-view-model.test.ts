import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { artRef } from "../../cumulus/primitives/art";
import { getLogEntries, resetLog } from "../../logging";
import type { TidemarkLadderClimbSiteRuntime } from "../../types/journey";
import type { LadderClimbSiteView } from "../../cumulus/screens/GambleSiteScreen";
import { logGambleSettled } from "./gamble-site-logging-view-model";

const REWARD_DREAMSIGN = {
  id: "00000000-0000-4000-8000-000000000025",
  name: "Fixture Sign",
  effectDescription: "Fixture effect.",
  isNegative: false,
};

const RUNTIME: TidemarkLadderClimbSiteRuntime = {
  kind: "gamble",
  gameId: "tidemark-ladder-climb",
  rulesVersion: "fixture-ladder-rules",
  isFarpoint: false,
  shuffleCommitments: ["attempt-1", "attempt-2", "attempt-3", "attempt-4"],
  committedCards: [
    { rank: "Q", suit: "clubs" },
    { rank: "10", suit: "diamonds" },
    { rank: "8", suit: "hearts" },
    { rank: "6", suit: "spades" },
  ],
  dreamsignCandidateScores: [{ dreamsignId: REWARD_DREAMSIGN.id, score: 1 }],
  strongPoolSize: 1,
  strongPoolCutoffScore: 1,
  rewardDreamsign: REWARD_DREAMSIGN,
  revealedCards: [{ rank: "Q", suit: "clubs" }],
  cumulativeCost: 15,
  result: {
    attemptNumber: 1,
    card: { rank: "Q", suit: "clubs" },
    won: true,
    costPaid: 15,
    cumulativeCost: 15,
    resultSettled: true,
    dreamsignAwarded: true,
    pendingDreamsignReplacement: false,
  },
};

const VIEW: LadderClimbSiteView = {
  gameId: "tidemark-ladder-climb",
  siteId: "fixture-site",
  scene: null,
  isFarpoint: false,
  runtimeReady: true,
  essenceReward: 25,
  rewardDreamsign: REWARD_DREAMSIGN,
  nextDraw: null,
  guide: {
    id: "fixture-guide",
    name: "Fixture Guide",
    line: "Fixture line.",
    art: artRef.dreamGuide("fixture-guide"),
  },
  result: null,
  replacement: null,
};

describe("gamble-site-logging-view-model", () => {
  beforeEach(() => {
    resetLog();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetLog();
  });

  it("records the Ladder Climb Essence payout and net settlement", () => {
    logGambleSettled("fixture-site", RUNTIME, VIEW);

    expect(getLogEntries()).toHaveLength(1);
    expect(getLogEntries()[0]).toMatchObject({
      event: "gamble_wager_settled",
      gameId: "tidemark-ladder-climb",
      attemptNumber: 1,
      cumulativeCost: 15,
      essenceGained: 25,
      essenceChangeAtSettlement: 25,
      netEssenceChange: 10,
      dreamsignId: REWARD_DREAMSIGN.id,
      dreamsignAwarded: true,
    });
  });
});
