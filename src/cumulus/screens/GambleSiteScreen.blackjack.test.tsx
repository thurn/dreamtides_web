// @vitest-environment jsdom

// GambleSiteScreen: Blackjack.
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlackjackSiteView } from "./GambleSiteScreen";
import {
  testGambleResultId,
  testShuffleCommitment,
} from "../../types/test-identities";
import { SITE, renderGamble, tid } from "./GambleSiteScreen.fixtures";

const BLACKJACK: BlackjackSiteView = {
  ...SITE,
  gameId: "blackjack",
  handId: testShuffleCommitment("fixture-blackjack-hand"),
  wagerCost: 50,
  prizeEssence: 300,
  attemptNumber: 1,
  maxAttempts: 3,
  target: 21,
  canAffordWager: true,
  playerCards: [],
  playerTotal: null,
  dealerCards: [],
  dealerTotal: null,
  dealerRevealed: false,
  outcome: null,
  essenceAwarded: 0,
  resultSettled: false,
  resultId: null,
  canPlayAgain: false,
};

const BLACKJACK_HANDS = {
  playerCards: [
    { rank: "10", suit: "clubs" },
    { rank: "8", suit: "hearts" },
  ],
  playerTotal: 18,
  dealerCards: [
    { rank: "9", suit: "spades" },
    { rank: "9", suit: "diamonds" },
  ],
} as const;

globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

afterEach(() => {
  vi.useRealTimers();
});

describe("GambleSiteScreen — Blackjack", () => {
  it("deals, conceals the dealer hole card, and hits while the player turn is open", () => {
    vi.useFakeTimers();
    const onDealBlackjack = vi.fn();
    const onHitBlackjack = vi.fn();
    const screen = renderGamble(BLACKJACK, { onDealBlackjack, onHitBlackjack });

    expect(screen.query("[data-blackjack-prize]")).not.toBeNull();
    screen.tap(tid("gamble-blackjack-deal"));
    expect(onDealBlackjack).toHaveBeenCalledOnce();

    screen.show({ ...BLACKJACK, ...BLACKJACK_HANDS, dealerTotal: 9 });

    void act(() => vi.runAllTimers());
    expect(screen.count("[data-blackjack-card]")).toBe(4);
    expect(screen.count('[data-playing-card-state="concealed"]')).toBe(1);
    screen.tap(tid("gamble-blackjack-hit"));
    expect(onHitBlackjack).toHaveBeenCalledOnce();
  });

  it("settles on the announcement, then conceals and clears the table before playing again", () => {
    vi.useFakeTimers();
    const onBlackjackOutcomeShown = vi.fn();
    const onPlayAgainBlackjack = vi.fn();
    const push: BlackjackSiteView = {
      ...BLACKJACK,
      ...BLACKJACK_HANDS,
      dealerTotal: 18,
      dealerRevealed: true,
      outcome: "push",
      essenceAwarded: 50,
      resultId: testGambleResultId("fixture-blackjack-push"),
      canPlayAgain: true,
    };
    const screen = renderGamble(push, {
      onBlackjackOutcomeShown,
      onPlayAgainBlackjack,
    });
    const phase = () =>
      screen.query("[data-blackjack-departure-phase]")?.dataset
        .blackjackDeparturePhase;

    void act(() => vi.runAllTimers());
    expect(onBlackjackOutcomeShown).toHaveBeenCalledOnce();
    expect(screen.count('[data-playing-card-state="drawn"]')).toBe(4);
    screen.show({ ...push, resultSettled: true });
    void act(() => vi.runAllTimers());
    const cards = [
      ...screen.container.querySelectorAll("[data-blackjack-card]"),
    ];
    screen.tap(tid("gamble-blackjack-play-again"));
    expect(phase()).toBe("concealing");
    expect(screen.count('[data-playing-card-state="concealed"]')).toBe(4);
    void act(() => vi.advanceTimersToNextTimer());
    expect(phase()).toBe("departing");
    expect([
      ...screen.container.querySelectorAll("[data-blackjack-card]"),
    ]).toEqual(cards);
    expect(onPlayAgainBlackjack).not.toHaveBeenCalled();
    void act(() => vi.advanceTimersToNextTimer());
    expect(onPlayAgainBlackjack).toHaveBeenCalledOnce();
  });
});
