// @vitest-environment jsdom

import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { artRef } from "../primitives/art";
import {
  GambleSiteScreen,
  type BlackjackSiteView,
  type FourSuitRepriseSiteView,
  type GambleSiteScreenProps,
  type GravokWagerSiteView,
  type LadderClimbSiteView,
  type StarwayStairsSiteView,
} from "./GambleSiteScreen";
import { localizedTransfigurationFormFixture } from "../test-helpers/transfiguration-fixture";
import { localizedDreamsignFixture } from "../test-helpers/dreamsign-fixture";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import {
  testDreamsignId,
  testGambleResultId,
  testGuideId,
  testShuffleCommitment,
} from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";
import { syntheticGameCard } from "../test-helpers/component-test-fixtures";

const JACKPOT = localizedDreamsignFixture({
  id: testDreamsignId("00000000-0000-4000-8000-000000000041"),
  name: "Fixture Jackpot",
  effectDescription: "Foresee 1.",
});

const SITE = {
  siteId: parseSiteId("fixture-gamble-site"),
  scene: null,
  isFarpoint: false,
  runtimeReady: true,
  guide: {
    id: testGuideId("fixture-guide"),
    name: "Fixture Guide",
    line: "A fixture gamble.",
    art: artRef.dreamGuide(testGuideId("fixture-guide")),
  },
} as const;

const GRAVOK: GravokWagerSiteView = {
  ...SITE,
  gameId: "gravok-three-gate-wager",
  wagerCost: 50,
  canAfford: true,
  canPlayAgain: true,
  card: { rank: "A", suit: "spades" },
  gates: (["six", "nine", "jack"] as const).map((id, index) => ({
    id,
    minimumWinningRank: (["6", "9", "J"] as const)[index],
    chanceLabel: "50%",
    oddsNumerator: 26,
    oddsDenominator: 52,
    essenceReward: 100 * (index + 1),
    rewardDreamsign: id === "jack" ? JACKPOT : null,
    available: true,
  })),
  result: null,
  replacement: null,
};

const GRAVOK_RESULT = {
  id: testGambleResultId("fixture-result"),
  gateId: "nine",
  revealGateId: "jack",
  won: true,
  essenceGained: 200,
  essenceSettled: false,
  rewardDreamsign: null,
  pendingDreamsignReplacement: false,
} as const;

const LADDER: LadderClimbSiteView = {
  ...SITE,
  gameId: "tidemark-ladder-climb",
  essenceReward: 25,
  rewardDreamsign: JACKPOT,
  nextDraw: {
    attemptNumber: 1,
    targetRank: "Q",
    cost: 0,
    canAfford: true,
    available: true,
  },
  result: null,
  replacement: null,
};

const STARWAY: StarwayStairsSiteView = {
  ...SITE,
  gameId: "starway-stairs",
  wagerAmount: 30,
  canAffordWager: true,
  canPlayAgain: true,
  tiers: (["3", "5", "8"] as const).map((minimumWinningRank, index) => ({
    tierNumber: index + 1,
    minimumWinningRank,
    essenceReward: 60 * (index + 1),
    state: index === 0 ? "current" : "future",
    card: null,
  })),
  currentTierNumber: 1,
  result: null,
  cashOutReward: null,
  terminalReason: null,
  prizeAwarded: 0,
};

function starwayAfterTierOne(busted: boolean): StarwayStairsSiteView {
  return {
    ...STARWAY,
    canAffordWager: false,
    tiers: STARWAY.tiers.map((tier) =>
      tier.tierNumber === 1
        ? {
            ...tier,
            state: busted ? "bust" : "safe",
            card: { rank: busted ? "2" : "3", suit: "clubs" },
          }
        : tier.tierNumber === 2 && !busted
          ? { ...tier, state: "current" }
          : tier,
    ),
    currentTierNumber: busted ? null : 2,
    result: {
      id: testGambleResultId("starway-tier-1"),
      tierNumber: 1,
      busted,
      resultSettled: true,
      prizeAtRisk: 60,
    },
    cashOutReward: busted ? null : 60,
    terminalReason: busted ? "bust" : null,
  };
}

function fourSuitCardView(index: number) {
  const model = syntheticGameCard(index);
  return {
    entryId: parseDeckEntryId(`four-suit-entry-${String(index)}`),
    cardId: model.cardId,
    model,
  };
}

const FOUR_SUIT: FourSuitRepriseSiteView = {
  ...SITE,
  gameId: "four-suit-reprise",
  drawCost: 25,
  canAffordDraw: true,
  roundNumber: 1,
  maxRounds: 3,
  essenceReward: 100,
  outcomes: [
    { suit: "spades", outcome: "transfiguration" },
    { suit: "diamonds", outcome: "essence" },
    { suit: "hearts", outcome: "duplication" },
    { suit: "clubs", outcome: "purge" },
  ],
  phase: "choose",
  cards: [fourSuitCardView(1), fourSuitCardView(2)],
  result: null,
  canPlayAgain: false,
};

function spadesResult(
  overrides: Partial<NonNullable<FourSuitRepriseSiteView["result"]>> = {},
): FourSuitRepriseSiteView {
  const target = FOUR_SUIT.cards[0];
  return {
    ...FOUR_SUIT,
    phase: "result",
    cards: [FOUR_SUIT.cards[1]],
    result: {
      id: testGambleResultId("four-suit-result-1"),
      roundNumber: 1,
      card: { rank: "A", suit: "spades" },
      outcome: "transfiguration",
      resultRevealed: false,
      resultSettled: false,
      essenceGained: 0,
      target,
      transfigurationCandidate: {
        entryId: target.entryId,
        model: target.model,
        availability: "available",
        reforgedType: null,
        forms: [
          {
            type: "Empowered",
            presentation: localizedTransfigurationFormFixture("Empowered"),
            effectDetails: { fixture: true },
            pricing: { kind: "unpriced" },
            previewModel: target.model,
          },
        ],
      },
      chosenTransfiguration: null,
      ...overrides,
    },
    canPlayAgain: overrides.resultSettled === true,
  };
}

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

type View = GambleSiteScreenProps["view"];
type Callbacks = Omit<GambleSiteScreenProps, "view">;

const tid = (marker: string) => `[data-testid="${marker}"]`;

function renderGamble(view: View, callbacks: Partial<Callbacks> = {}) {
  const props: Callbacks = {
    onChooseGate: () => undefined,
    onLeave: () => undefined,
    onOutcomeShown: () => undefined,
    onPlayAgain: () => undefined,
    onDrawLadder: () => undefined,
    onLadderOutcomeShown: () => undefined,
    onReplaceDreamsign: () => undefined,
    ...callbacks,
  };
  const rendered = renderInCumulus(<GambleSiteScreen view={view} {...props} />);
  const query = (selector: string) =>
    rendered.container.querySelector<HTMLElement>(selector);
  return {
    ...rendered,
    query,
    count: (selector: string) =>
      rendered.container.querySelectorAll(selector).length,
    tap: (selector: string) => {
      const button = query(selector);
      expect(button).not.toBeNull();
      act(() => button?.click());
    },
    show: (next: View) => {
      rendered.rerender(<GambleSiteScreen view={next} {...props} />);
    },
  };
}

function advance(ms = 10_000): void {
  void act(() => vi.advanceTimersByTime(ms));
}

globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

afterEach(() => {
  vi.useRealTimers();
});

describe("GambleSiteScreen — Three-Gate Wager", () => {
  it("commits a gate, locks the bets, settles on the announcement, and offers replay only when allowed", () => {
    vi.useFakeTimers();
    const onChooseGate = vi.fn();
    const onLeave = vi.fn();
    const onOutcomeShown = vi.fn();
    const onPlayAgain = vi.fn();
    const screen = renderGamble(GRAVOK, {
      onChooseGate,
      onLeave,
      onOutcomeShown,
      onPlayAgain,
    });

    expect(screen.count("[data-gamble-gate]")).toBe(3);
    expect(screen.count("[data-wager-prize-card]")).toBe(3);
    screen.tap(tid("gamble-choose-six"));
    expect(onChooseGate).toHaveBeenCalledWith("six");

    screen.show({ ...GRAVOK, result: GRAVOK_RESULT });

    const gate = (choice: string) =>
      screen.query(`[data-gamble-gate="${choice}"]`)?.dataset
        .gambleGatePresentation;
    expect(gate("nine")).toBe("selected");
    expect(gate("jack")).toBe("revealed");
    expect(screen.query(tid("gamble-leave"))).toBeNull();
    const lockedBet = screen.query('[data-gamble-bet="nine"]');
    expect(lockedBet?.getAttribute("aria-hidden")).toBe("true");
    expect(lockedBet?.hasAttribute("inert")).toBe(true);

    advance(2_000);
    expect(onOutcomeShown).toHaveBeenCalledOnce();
    const settled = {
      ...GRAVOK,
      result: { ...GRAVOK_RESULT, essenceSettled: true },
    };
    screen.show(settled);
    advance();
    screen.tap(tid("gamble-leave-after-round"));
    expect(onLeave).toHaveBeenCalledOnce();
    screen.tap(tid("gamble-play-again"));
    expect(onPlayAgain).toHaveBeenCalledOnce();

    screen.show({ ...settled, canPlayAgain: false });
    expect(screen.query(tid("gamble-play-again"))).toBeNull();
    expect(screen.query(tid("gamble-leave-after-round"))).not.toBeNull();
  });

  it("replaces a held Dreamsign by UUID after an at-cap jackpot", () => {
    vi.useFakeTimers();
    const onReplaceDreamsign = vi.fn();
    const held = localizedDreamsignFixture({
      id: testDreamsignId("held-sign"),
      name: "Held Sign",
      effectDescription: "A held effect.",
    });
    const screen = renderGamble(
      {
        ...GRAVOK,
        result: {
          ...GRAVOK_RESULT,
          gateId: "jack",
          revealGateId: "six",
          essenceSettled: true,
          rewardDreamsign: JACKPOT,
          pendingDreamsignReplacement: true,
        },
        replacement: { incoming: JACKPOT, held: [held], capacity: 1 },
      },
      { onReplaceDreamsign },
    );

    advance(2_000);
    advance();
    expect(screen.query("[data-dreamsign-replacement-dialog]")).not.toBeNull();
    screen.tap(`[data-replace-dreamsign-id="${held.id}"] button`);
    expect(onReplaceDreamsign).toHaveBeenCalledWith(held.id);
  });
});

describe("GambleSiteScreen — Ladder Climb", () => {
  it("draws, keeps the stage stable through a miss, and offers the next draw once settled", () => {
    vi.useFakeTimers();
    const onDrawLadder = vi.fn();
    const onLadderOutcomeShown = vi.fn();
    const screen = renderGamble(LADDER, { onDrawLadder, onLadderOutcomeShown });
    const prizeState = () =>
      screen.query("[data-wager-prize-card]")?.dataset.wagerPrizeCardState;

    expect(prizeState()).toBe("prize");
    screen.tap(tid("gamble-ladder-climb"));
    expect(onDrawLadder).toHaveBeenCalledOnce();

    const cardSlot = screen.query("[data-ladder-climb-card]");
    const actionSlot = screen.query("[data-ladder-actions]");
    const miss: LadderClimbSiteView = {
      ...LADDER,
      nextDraw: null,
      result: {
        id: testGambleResultId("ladder-attempt-1"),
        attemptNumber: 1,
        targetRank: "Q",
        card: { rank: "J", suit: "clubs" },
        won: false,
        resultSettled: false,
        terminal: false,
        pendingDreamsignReplacement: false,
      },
    };
    screen.show(miss);
    expect(screen.query("[data-ladder-climb-card]")).toBe(cardSlot);
    expect(screen.query("[data-ladder-actions]")).toBe(actionSlot);
    expect(actionSlot?.dataset.ladderActions).toBe("hidden");

    advance(2_000);
    expect(onLadderOutcomeShown).toHaveBeenCalledOnce();
    expect(prizeState()).toBe("drawn");
    expect(screen.query(tid("gamble-ladder-climb-again"))).toBeNull();

    screen.show({
      ...miss,
      nextDraw: { ...LADDER.nextDraw!, attemptNumber: 2, cost: 5 },
      result: { ...miss.result!, resultSettled: true },
    });
    advance();
    screen.tap(tid("gamble-ladder-climb-again"));
    expect(onDrawLadder).toHaveBeenCalledTimes(2);
  });
});

describe("GambleSiteScreen — Starway Stairs", () => {
  it("bets on the current tier, settles a safe draw on it, and cashes out once", () => {
    vi.useFakeTimers();
    const onDrawStarway = vi.fn();
    const onStarwayOutcomeShown = vi.fn();
    const onCashOutStarway = vi.fn();
    const screen = renderGamble(STARWAY, {
      onDrawStarway,
      onStarwayOutcomeShown,
      onCashOutStarway,
    });

    expect(screen.count("[data-starway-tier]")).toBe(3);
    expect(screen.count("[data-starway-tier-button]")).toBe(1);
    screen.tap(tid("gamble-starway-tier-1"));
    expect(onDrawStarway).toHaveBeenCalledOnce();

    screen.show(starwayAfterTierOne(false));

    advance(2_000);
    expect(onStarwayOutcomeShown).toHaveBeenCalledOnce();
    expect(
      screen.query("[data-starway-outcome]")?.parentElement?.dataset
        .starwayTier,
    ).toBe("1");
    advance();
    const disabled = (marker: string) =>
      screen.query(tid(marker))?.getAttribute("aria-disabled");
    expect(screen.count("[data-starway-tier-button]")).toBe(1);
    expect(disabled("gamble-starway-tier-2")).toBe("true");
    screen.tap(tid("gamble-starway-cash-out"));
    expect(onCashOutStarway).toHaveBeenCalledOnce();
    expect(disabled("gamble-starway-cash-out")).toBe("true");
  });

  it("offers Play Again after a bust only while rounds remain", () => {
    vi.useFakeTimers();
    const onPlayAgainStarway = vi.fn();
    const busted = starwayAfterTierOne(true);
    const screen = renderGamble(busted, { onPlayAgainStarway });

    advance();
    expect(screen.count("[data-starway-tier-button]")).toBe(0);
    expect(screen.query(tid("gamble-starway-cash-out"))).toBeNull();
    expect(
      screen.query(tid("gamble-starway-leave-after-result")),
    ).not.toBeNull();
    screen.tap(tid("gamble-starway-play-again"));
    expect(onPlayAgainStarway).toHaveBeenCalledOnce();

    screen.show({ ...busted, canPlayAgain: false });
    expect(screen.query(tid("gamble-starway-play-again"))).toBeNull();
  });
});

describe("GambleSiteScreen — Four-Suit Reprise", () => {
  it("selects, reselects, and draws against a card by entry id", () => {
    const onDrawFourSuit = vi.fn();
    const screen = renderGamble(FOUR_SUIT, { onDrawFourSuit });
    const pick = tid("gamble-four-suit-card-four-suit-entry-1");

    expect(screen.query("[data-four-suit-picker]")).not.toBeNull();
    screen.tap(pick);
    expect(screen.query("[data-four-suit-picker]")).toBeNull();
    expect(
      screen.query('[data-four-suit-target="four-suit-entry-1"]'),
    ).not.toBeNull();
    expect(screen.count("[data-four-suit-outcome]")).toBe(4);

    screen.tap(tid("gamble-four-suit-choose-again"));
    expect(screen.query("[data-four-suit-picker]")).not.toBeNull();
    screen.tap(pick);
    screen.tap(tid("gamble-four-suit-draw"));
    expect(onDrawFourSuit).toHaveBeenCalledWith("four-suit-entry-1");
  });

  it("chooses a free Transfiguration after Spades, then replays once settled", () => {
    vi.useFakeTimers();
    const onFourSuitOutcomeShown = vi.fn();
    const onChooseFourSuitTransfiguration = vi.fn();
    const onPlayAgainFourSuit = vi.fn();
    const screen = renderGamble(spadesResult(), {
      onFourSuitOutcomeShown,
      onChooseFourSuitTransfiguration,
      onPlayAgainFourSuit,
    });

    advance(2_000);
    expect(onFourSuitOutcomeShown).toHaveBeenCalledOnce();
    screen.show(spadesResult({ resultRevealed: true }));
    advance();
    expect(screen.query(tid("cumulus-transfiguration-detail"))).not.toBeNull();
    screen.tap(tid("cumulus-transfiguration-form-Empowered"));
    screen.tap(tid("cumulus-transfiguration-confirm"));
    expect(onChooseFourSuitTransfiguration).toHaveBeenCalledWith("Empowered");

    screen.show(
      spadesResult({
        resultRevealed: true,
        resultSettled: true,
        chosenTransfiguration: "Empowered",
      }),
    );
    advance();
    expect(screen.query("[data-four-suit-target]")).toBeNull();
    screen.tap(tid("gamble-four-suit-play-again"));
    expect(onPlayAgainFourSuit).toHaveBeenCalledOnce();
    expect(screen.query(tid("gamble-four-suit-play-again"))).toBeNull();
  });
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
