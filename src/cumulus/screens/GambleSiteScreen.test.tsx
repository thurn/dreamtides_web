// @vitest-environment jsdom

// GambleSiteScreen: Three-Gate Wager, Ladder Climb, and Starway Stairs.
// Four-Suit Reprise and Blackjack have their own GambleSiteScreen.*.test.tsx.
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  GravokWagerSiteView,
  LadderClimbSiteView,
  StarwayStairsSiteView,
} from "./GambleSiteScreen";
import { dreamsignViewFixture } from "../test-helpers/dreamsign-fixture";
import {
  testDreamsignId,
  testGambleResultId,
} from "../../types/test-identities";
import { SITE, advance, renderGamble, tid } from "./GambleSiteScreen.fixtures";

const JACKPOT = dreamsignViewFixture({
  id: testDreamsignId("00000000-0000-4000-8000-000000000041"),
  name: "Fixture Jackpot",
  effectDescription: "Foresee 1.",
});

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
    const held = dreamsignViewFixture({
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
