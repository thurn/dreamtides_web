import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { StandardPlayingCard } from "../../../types/gamble";
import type {
  BlackjackSiteRuntime,
  JourneyState,
} from "../../../types/journey";
import { parseShuffleCommitment } from "../../../types/identifiers";
import { testGambleSelectionTrace } from "../../../testing/gamble-fixture";
import type { FoldState } from "../../fold-state";
import { registerSiteContentProvider } from "../sites";
import { testSiteContentProvider } from "../test-content-providers";
import { apply, gambleStateWith, SITE_ID } from "./test-fixture";

afterEach(() => {
  registerSiteContentProvider(null);
});
beforeEach(() => {
  registerSiteContentProvider(testSiteContentProvider());
});

function blackjackRuntime(
  cards: readonly StandardPlayingCard[],
  overrides: Partial<BlackjackSiteRuntime> = {},
): BlackjackSiteRuntime {
  return {
    kind: "gamble",
    gameId: "blackjack",
    selectionTrace: testGambleSelectionTrace("blackjack"),
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
  return gambleStateWith(
    blackjackRuntime(cards, runtimeOverrides),
    stateOverrides,
  );
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

    registerSiteContentProvider(
      testSiteContentProvider({
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
      }),
    );
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

    registerSiteContentProvider(
      testSiteContentProvider({
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
      }),
    );
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
