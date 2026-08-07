import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { artRef } from "../../cumulus/primitives/art";
import type {
  FourSuitRepriseSiteView,
  LadderClimbSiteView,
  TwentyOneSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import { getLogEntries, resetLog } from "../../logging";
import { economyFixture } from "../../testing/economy-fixture";
import { MINIMAL_SITES_DATA } from "../../__test-helpers__/atlas-fixtures";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import type {
  FourSuitRepriseSiteRuntime,
  TidemarkLadderClimbSiteRuntime,
  TwentyOneSiteRuntime,
} from "../../types/journey";
import {
  logGamblePrepared,
  logGambleResolved,
  logGambleSettled,
} from "./gamble-site-logging-view-model";

const REWARD_DREAMSIGN = {
  id: "00000000-0000-4000-8000-000000000025",
  name: "Fixture Sign",
  effectDescription: "Fixture effect.",
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
  cumulativeCost: 0,
  result: {
    attemptNumber: 1,
    card: { rank: "Q", suit: "clubs" },
    won: true,
    costPaid: 0,
    cumulativeCost: 0,
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
    logGambleSettled(
      "fixture-site",
      RUNTIME,
      VIEW,
      economyFixture(),
      MINIMAL_SITES_DATA,
    );

    expect(getLogEntries()).toHaveLength(1);
    expect(getLogEntries()[0]).toMatchObject({
      event: "gamble_wager_settled",
      gameId: "tidemark-ladder-climb",
      attemptNumber: 1,
      cumulativeCost: 0,
      essenceGained: 25,
      essenceChangeAtSettlement: 25,
      netEssenceChange: 25,
      dreamsignId: REWARD_DREAMSIGN.id,
      dreamsignAwarded: true,
    });
  });

  it("records enough Four-Suit data to reconstruct the paid deck mutation", () => {
    const card: CardData = {
      name: asCardName("Fixture Card"),
      id: asCardId("00000000-0000-4000-8000-000000000101"),
      cardNumber: 101,
      cardType: "Character",
      subtype: "",
      isStarter: false,
      energyCost: 2,
      spark: 2,
      isFast: false,
      renderedText: "Materialized: Gain 1 Essence.",
      imageNumber: 101,
      artOwned: true,
    };
    const runtime: FourSuitRepriseSiteRuntime = {
      kind: "gamble",
      gameId: "four-suit-reprise",
      rulesVersion: "fixture-four-suit-rules",
      isFarpoint: false,
      drawCost: 25,
      shuffleCommitments: ["round-1", "round-2", "round-3"],
      committedCards: [
        { rank: "7", suit: "hearts" },
        { rank: "4", suit: "diamonds" },
        { rank: "Q", suit: "clubs" },
      ],
      targets: [
        {
          entryId: "entry-101",
          cardId: card.id,
          cardNumber: card.cardNumber,
          cardSnapshot: card,
          transfigurationOffers: [
            {
              entryId: "entry-101",
              type: "Empowered",
              effectDescription: "Fixture form.",
              effectDetails: { fixture: true },
              previewCard: { ...card, energyCost: 1 },
              essenceCost: 0,
            },
          ],
        },
      ],
      rounds: [
        {
          roundNumber: 1,
          shuffleCommitment: "round-1",
          card: { rank: "7", suit: "hearts" },
          targetEntryId: "entry-101",
          targetCardId: card.id,
          costPaid: 25,
          outcome: "duplication",
          resultRevealed: true,
          resultSettled: true,
          essenceGained: 0,
          duplicatedEntryId: "duplicate-101",
        },
      ],
      phase: "result",
    };
    const view = {
      gameId: "four-suit-reprise",
      cards: [],
    } as unknown as FourSuitRepriseSiteView;

    logGamblePrepared(
      "fixture-site",
      runtime,
      view,
      economyFixture(),
      MINIMAL_SITES_DATA,
    );
    logGambleResolved(
      "fixture-site",
      runtime,
      view,
      economyFixture(),
      MINIMAL_SITES_DATA,
    );
    logGambleSettled(
      "fixture-site",
      runtime,
      view,
      economyFixture(),
      MINIMAL_SITES_DATA,
    );

    expect(getLogEntries()).toHaveLength(3);
    expect(getLogEntries()[0]).toMatchObject({
      event: "gamble_game_prepared",
      gameId: "four-suit-reprise",
      drawCost: 25,
      outcomes: [
        { suit: "spades", outcome: "transfiguration" },
        { suit: "diamonds", outcome: "essence" },
        { suit: "hearts", outcome: "duplication" },
        { suit: "clubs", outcome: "purge" },
      ],
    });
    expect(getLogEntries()[1]).toMatchObject({
      event: "gamble_wager_resolved",
      roundNumber: 1,
      payment: 25,
      selectedEntryId: "entry-101",
      selectedCardId: card.id,
      resolvedSuitOutcome: "duplication",
    });
    expect(getLogEntries()[2]).toMatchObject({
      event: "gamble_wager_settled",
      finalEffect: "duplication",
      duplicatedEntryId: "duplicate-101",
    });
  });

  it("records the Twenty-One wager, both hands, decision, and final reward", () => {
    const runtime: TwentyOneSiteRuntime = {
      kind: "gamble",
      gameId: "twenty-one",
      rulesVersion: "fixture-twenty-one-rules",
      isFarpoint: false,
      wagerCost: 50,
      prizeEssence: 300,
      attemptNumber: 1,
      shuffleCommitment: "twenty-one-hand",
      committedDeck: [
        { rank: "10", suit: "clubs" },
        { rank: "10", suit: "spades" },
        { rank: "9", suit: "hearts" },
        { rank: "8", suit: "diamonds" },
      ],
      deckCursor: 4,
      playerCards: [
        { rank: "10", suit: "clubs" },
        { rank: "9", suit: "hearts" },
      ],
      dealerCards: [
        { rank: "10", suit: "spades" },
        { rank: "8", suit: "diamonds" },
      ],
      dealerRevealed: true,
      wagerPaid: true,
      playerDecision: "stand",
      outcome: "player-win",
      resultSettled: true,
      essenceAwarded: 300,
    };
    const view = { gameId: "twenty-one" } as unknown as TwentyOneSiteView;

    logGamblePrepared("fixture-site", runtime, view, economyFixture());
    logGambleResolved("fixture-site", runtime, view, economyFixture());
    logGambleSettled("fixture-site", runtime, view, economyFixture());

    expect(getLogEntries()).toHaveLength(3);
    expect(getLogEntries()[0]).toMatchObject({
      event: "gamble_game_prepared",
      gameId: "twenty-one",
      wagerCost: 50,
      prizeEssence: 300,
      dealerRule: "stand-soft-17",
    });
    expect(getLogEntries()[1]).toMatchObject({
      event: "gamble_wager_resolved",
      playerDecision: "stand",
      payment: 0,
      deckCursor: 4,
      playerTotal: 19,
      dealerTotal: 18,
      outcome: "player-win",
    });
    expect(getLogEntries()[2]).toMatchObject({
      event: "gamble_wager_settled",
      playerTotal: 19,
      dealerTotal: 18,
      wagerPayment: 50,
      essenceGained: 300,
      netEssenceChange: 250,
      outcome: "player-win",
    });
  });
});
