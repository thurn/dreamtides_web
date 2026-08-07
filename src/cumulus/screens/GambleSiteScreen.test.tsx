// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import { artRef } from "../primitives/art";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { PLAYING_CARD_DESIGN } from "../components/card/PlayingCard";
import {
  GambleSiteScreen,
  type FourSuitRepriseSiteView,
  type GravokWagerSiteView,
  type LadderClimbSiteView,
  type StarwayStairsSiteView,
  type TwentyOneSiteView,
} from "./GambleSiteScreen";

const JACKPOT_DREAMSIGN = {
  id: "00000000-0000-4000-8000-000000000041",
  name: "Fixture Jackpot",
  imageName: "fixture-jackpot.png",
  effectDescription: "Foresee 1.",
};

const VIEW: GravokWagerSiteView = {
  gameId: "gravok-three-gate-wager",
  siteId: "fixture-gamble-site",
  scene: null,
  isFarpoint: false,
  runtimeReady: true,
  wagerCost: 50,
  canAfford: true,
  canPlayAgain: true,
  card: { rank: "A", suit: "spades" },
  gates: [
    {
      id: "six",
      name: "Six Gate",
      targetLabel: "6-A",
      chanceLabel: "69.23%",
      oddsNumerator: 36,
      oddsDenominator: 52,
      essenceReward: 100,
      rewardDreamsign: null,
      available: true,
    },
    {
      id: "nine",
      name: "Nine Gate",
      targetLabel: "9-A",
      chanceLabel: "46.15%",
      oddsNumerator: 24,
      oddsDenominator: 52,
      essenceReward: 150,
      rewardDreamsign: null,
      available: true,
    },
    {
      id: "jack",
      name: "Jack Gate",
      targetLabel: "J-A",
      chanceLabel: "30.77%",
      oddsNumerator: 16,
      oddsDenominator: 52,
      essenceReward: 200,
      rewardDreamsign: JACKPOT_DREAMSIGN,
      available: true,
    },
  ],
  guide: {
    id: "fixture-guide",
    name: "Fixture Guide",
    line: "A fixture gamble.",
    art: artRef.dreamGuide("fixture-guide"),
  },
  result: null,
  replacement: null,
};

const STARWAY_VIEW: StarwayStairsSiteView = {
  gameId: "starway-stairs",
  siteId: "fixture-gamble-site",
  scene: null,
  isFarpoint: false,
  runtimeReady: true,
  wagerAmount: 30,
  canAffordWager: true,
  canPlayAgain: true,
  tiers: [
    {
      tierNumber: 1,
      drawTargetLabel: "3-A",
      essenceReward: 60,
      state: "current",
      card: null,
    },
    {
      tierNumber: 2,
      drawTargetLabel: "5-A",
      essenceReward: 140,
      state: "future",
      card: null,
    },
    {
      tierNumber: 3,
      drawTargetLabel: "8-A",
      essenceReward: 300,
      state: "future",
      card: null,
    },
  ],
  currentTierNumber: 1,
  guide: {
    id: "gravok",
    name: "Gravok",
    line: "Starway Stairs is the game. Keep betting to see how high you can go!",
    art: artRef.dreamGuide("gravok"),
  },
  result: null,
  cashOutReward: null,
  terminalReason: null,
  prizeAwarded: 0,
};

function fourSuitCard(index: number): CardData {
  return {
    name: asCardName(`Four Suit Fixture ${String(index)}`),
    id: asCardId(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "Materialized: Gain 1 Essence.",
    imageNumber: index,
    artOwned: true,
  };
}

function fourSuitCardView(index: number) {
  const card = fourSuitCard(index);
  return {
    entryId: `four-suit-entry-${String(index)}`,
    cardId: card.id,
    model: { cardId: card.id, displaySnapshot: card },
  };
}

const FOUR_SUIT_VIEW: FourSuitRepriseSiteView = {
  gameId: "four-suit-reprise",
  siteId: "fixture-gamble-site",
  scene: null,
  isFarpoint: false,
  runtimeReady: true,
  drawCost: 25,
  canAffordDraw: true,
  roundNumber: 1,
  maxRounds: 3,
  essenceReward: 100,
  outcomes: [
    { suit: "spades", outcome: "transfiguration", label: "Fixture A" },
    { suit: "diamonds", outcome: "essence", label: "Fixture B" },
    { suit: "hearts", outcome: "duplication", label: "Fixture C" },
    { suit: "clubs", outcome: "purge", label: "Fixture D" },
  ],
  phase: "choose",
  cards: [fourSuitCardView(1), fourSuitCardView(2)],
  guide: {
    id: "gravok",
    name: "Gravok",
    line: "A fixture gamble.",
    art: artRef.dreamGuide("gravok"),
  },
  result: null,
  canPlayAgain: false,
};

const TWENTY_ONE_VIEW: TwentyOneSiteView = {
  gameId: "twenty-one",
  siteId: "fixture-gamble-site",
  scene: null,
  isFarpoint: false,
  runtimeReady: true,
  roundNumber: 1,
  maxRounds: 3,
  dealCost: 55,
  hitCost: 10,
  canAffordDeal: true,
  canAffordHit: true,
  cards: [],
  total: null,
  title: "Twenty-One",
  essenceReward: 150,
  rewardDreamsign: JACKPOT_DREAMSIGN,
  nextCardOdds: null,
  terminalReason: null,
  resultSettled: false,
  resultId: null,
  canPlayAgain: false,
  guide: {
    id: "gravok",
    name: "Gravok",
    line: "A fixture gamble.",
    art: artRef.dreamGuide("gravok"),
  },
  replacement: null,
};

function fourSuitResultView(
  overrides: Partial<NonNullable<FourSuitRepriseSiteView["result"]>> = {},
): FourSuitRepriseSiteView {
  const target = FOUR_SUIT_VIEW.cards[0];
  const card = target.model.displaySnapshot;
  return {
    ...FOUR_SUIT_VIEW,
    phase: "result",
    cards: [FOUR_SUIT_VIEW.cards[1]],
    result: {
      id: "four-suit-result-1",
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
            description: "Fixture form.",
            effectDetails: { fixture: true },
            essenceCost: 0,
            affordable: true,
            previewModel: {
              cardId: card.id,
              displaySnapshot: { ...card, energyCost: 1 },
              transfiguration: {
                type: "Empowered",
                markedText: card.renderedText,
                energyChanged: true,
                sparkChanged: false,
                fastChanged: false,
              },
            },
          },
        ],
      },
      chosenTransfiguration: null,
      ...overrides,
    },
    canPlayAgain: overrides.resultSettled === true,
  };
}

function stubMatchMedia(): void {
  window.matchMedia = (query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

function stubMobileMatchMedia(): void {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => root.render(<CumulusRoot>{element}</CumulusRoot>));
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubMatchMedia();
  globalThis.ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("GambleSiteScreen", () => {
  it("presents three square prize cards and pins Leave to the HUD edge", () => {
    const onChooseGate = vi.fn();
    const onLeave = vi.fn();
    const { container, root } = mount(
      <GambleSiteScreen
        view={VIEW}
        onChooseGate={onChooseGate}
        onLeave={onLeave}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onReplaceDreamsign={() => undefined}
      />,
    );

    expect(container.querySelector("[data-playing-card]")).toBeNull();
    expect(container.querySelectorAll("[data-gamble-gate]")).toHaveLength(3);
    expect(
      [...container.querySelectorAll<HTMLElement>("[data-gamble-gate]")].map(
        (gate) => [gate.style.gridColumn, gate.style.gridRow],
      ),
    ).toEqual([
      ["1", "1"],
      ["2", "1"],
      ["3", "1"],
    ]);
    expect(container.querySelectorAll("[data-wager-prize-card]")).toHaveLength(
      3,
    );
    expect(
      container.querySelector('[data-gamble-gate="six"] [data-wager-prize-card]')
        ?.getAttribute("data-wager-prize-target"),
    ).toBe("6-A");
    expect(
      container.querySelector('[data-gamble-gate="nine"] [data-wager-prize-card]')
        ?.getAttribute("data-wager-prize-essence-reward"),
    ).toBe("150");
    expect(
      container.querySelector('[data-gamble-gate="jack"] [data-wager-prize-dreamsign-name]'),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("chance");
    expect(container.textContent).not.toContain("Gravok’s Casino");
    expect(container.textContent).not.toContain("Three-Gate Wager");
    const dreamsignName = container.querySelector<HTMLElement>(
      "[data-testid=gamble-jackpot-dreamsign-name]",
    );
    expect(dreamsignName).not.toBeNull();
    expect(
      dreamsignName?.parentElement?.hasAttribute(
        "data-wager-prize-description",
      ),
    ).toBe(true);
    const dreamsignSource = container.querySelector<HTMLElement>(
      '[data-gamble-gate="jack"] [data-wager-prize-dreamsign-source]',
    );
    expect(dreamsignSource?.dataset.revealPrimaryVariant).toBe("object");
    expect(
      dreamsignSource?.querySelector("[data-wager-prize-title]"),
    ).not.toBeNull();
    expect(
      dreamsignSource?.querySelector("[data-wager-prize-description]"),
    ).not.toBeNull();
    const leaveSlot = container.querySelector<HTMLElement>(
      "[data-gamble-leave-slot]",
    );
    expect(leaveSlot?.style.position).toBe("absolute");
    expect(leaveSlot?.style.bottom).toBe("0px");

    const chooseSix = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-choose-six"]',
    );
    expect(chooseSix?.textContent).toContain("50");
    expect(chooseSix?.getAttribute("aria-label")?.trim()).not.toBe("");
    act(() => chooseSix?.click());
    expect(onChooseGate).toHaveBeenCalledWith("six");

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="gamble-leave"]')
        ?.click();
    });
    expect(onLeave).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("fades the locked bets immediately, flips a non-selected prize, and keeps the outcome readable", () => {
    vi.useFakeTimers();
    const onPlayAgain = vi.fn();
    const onLeave = vi.fn();
    const onOutcomeShown = vi.fn();
    const resultView: GravokWagerSiteView = {
      ...VIEW,
      card: { rank: "Q", suit: "hearts" },
      result: {
        id: "fixture-result",
        gateId: "nine",
        revealGateId: "jack",
        won: true,
        essenceGained: 150,
        essenceSettled: false,
        rewardDreamsign: null,
        pendingDreamsignReplacement: false,
      },
    };
    const { container, root } = mount(
      <GambleSiteScreen
        view={resultView}
        onChooseGate={() => undefined}
        onLeave={onLeave}
        onOutcomeShown={onOutcomeShown}
        onPlayAgain={onPlayAgain}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onReplaceDreamsign={() => undefined}
      />,
    );

    expect(container.querySelector("[data-playing-card]")).toBeNull();
    expect(
      container
        .querySelector('[data-gamble-gate="nine"]')
        ?.getAttribute("data-gamble-gate-presentation"),
    ).toBe("selected");
    expect(
      container
        .querySelector('[data-gamble-gate="jack"]')
        ?.getAttribute("data-gamble-gate-presentation"),
    ).toBe("revealed");
    expect(container.querySelector('[data-testid="gamble-leave"]')).toBeNull();
    const lockedBet = container.querySelector<HTMLElement>(
      '[data-gamble-bet="nine"]',
    );
    const lockedButton = lockedBet?.querySelector<HTMLButtonElement>("button");
    expect(lockedBet?.getAttribute("aria-hidden")).toBe("true");
    expect(lockedBet?.hasAttribute("inert")).toBe(true);
    expect(lockedBet?.style.pointerEvents).toBe("none");
    expect(lockedButton?.disabled).toBe(false);
    expect(lockedButton?.style.opacity).toBe("1");
    void act(() => vi.advanceTimersByTime(250));
    expect(
      container
        .querySelector('[data-gamble-gate="jack"] [data-playing-card]')
        ?.getAttribute("data-playing-card-face"),
    ).toBe("front");
    expect(
      container
        .querySelector('[data-gamble-gate="six"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      container
        .querySelector('[data-gamble-bet="jack"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      container
        .querySelector('[data-gamble-bet="nine"]')
        ?.getAttribute("aria-hidden"),
    ).toBe("true");
    expect(
      container.querySelectorAll('[data-gamble-bet][aria-hidden="true"]'),
    ).toHaveLength(3);
    void act(() => vi.advanceTimersByTime(719));
    expect(container.querySelector("[data-radial-announcement]")).toBeNull();
    expect(onOutcomeShown).not.toHaveBeenCalled();
    void act(() => vi.advanceTimersByTime(1));
    const announcement = container.querySelector(
      '[data-radial-announcement="fixture-result"]',
    );
    expect(announcement?.textContent).toContain("Won!+150");
    expect(
      announcement?.getAttribute("data-radial-announcement-duration"),
    ).toBe("extended");
    expect(
      announcement?.querySelector<HTMLElement>(
        "[data-radial-announcement-disc]",
      )?.style.width,
    ).toBe("164px");
    expect(onOutcomeShown).toHaveBeenCalledOnce();
    expect(
      announcement?.parentElement?.getAttribute("data-gamble-outcome-slot"),
    ).toBe("six");
    void act(() => vi.advanceTimersByTime(1_000));
    act(() => {
      root.render(
        <CumulusRoot>
          <GambleSiteScreen
            view={{
              ...resultView,
              result: { ...resultView.result!, essenceSettled: true },
            }}
            onChooseGate={() => undefined}
            onLeave={onLeave}
            onOutcomeShown={onOutcomeShown}
            onPlayAgain={onPlayAgain}
            onDrawLadder={() => undefined}
            onLadderOutcomeShown={() => undefined}
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    void act(() => vi.advanceTimersByTime(3_359));
    expect(
      container.querySelector('[data-testid="gamble-play-again"]'),
    ).toBeNull();
    void act(() => vi.advanceTimersByTime(1));
    const playAgain = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-play-again"]',
    );
    const leave = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-leave-after-round"]',
    );
    expect(playAgain?.textContent?.trim()).not.toBe("");
    expect(leave?.textContent?.trim()).not.toBe("");
    const actionGroup = playAgain?.closest<HTMLElement>(
      "[data-gamble-round-action-group]",
    );
    expect(actionGroup).toBe(
      leave?.closest("[data-gamble-round-action-group]"),
    );
    expect(actionGroup?.style.gridColumn).toBe("2 / span 2");
    act(() => leave?.click());
    expect(onLeave).toHaveBeenCalledOnce();
    act(() => playAgain?.click());
    expect(onPlayAgain).toHaveBeenCalledOnce();

    act(() => {
      root.render(
        <CumulusRoot>
          <GambleSiteScreen
            view={{
              ...resultView,
              canPlayAgain: false,
              result: {
                ...resultView.result!,
                gateId: "jack",
                revealGateId: "six",
              },
            }}
            onChooseGate={() => undefined}
            onLeave={onLeave}
            onOutcomeShown={onOutcomeShown}
            onPlayAgain={onPlayAgain}
            onDrawLadder={() => undefined}
            onLadderOutcomeShown={() => undefined}
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    expect(
      container.querySelector('[data-testid="gamble-play-again"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="gamble-leave-after-round"]'),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-gamble-round-action-group]")
        ?.style.gridColumn,
    ).toBe("1 / span 3");

    act(() => root.unmount());
  });

  it("opens the shared Dreamsign replacement flow after an at-cap jackpot", () => {
    vi.useFakeTimers();
    const onReplaceDreamsign = vi.fn();
    const replacementView: GravokWagerSiteView = {
      ...VIEW,
      card: { rank: "A", suit: "clubs" },
      result: {
        id: "fixture-jackpot-result",
        gateId: "jack",
        revealGateId: "six",
        won: true,
        essenceGained: 200,
        essenceSettled: true,
        rewardDreamsign: JACKPOT_DREAMSIGN,
        pendingDreamsignReplacement: true,
      },
      replacement: {
        pendingDreamsign: JACKPOT_DREAMSIGN,
        currentDreamsigns: [
          {
            id: "held-sign",
            name: "Held Sign",
            effectDescription: "A held effect.",
          },
        ],
        maxDreamsigns: 1,
      },
    };
    const { container, root } = mount(
      <GambleSiteScreen
        view={replacementView}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onReplaceDreamsign={onReplaceDreamsign}
      />,
    );

    void act(() => vi.advanceTimersByTime(970));
    void act(() => vi.advanceTimersByTime(3_360));
    expect(
      container.querySelector("[data-dreamsign-replacement-dialog]"),
    ).not.toBeNull();
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="replace-dreamsign-held-sign"]',
        )
        ?.click();
    });
    expect(onReplaceDreamsign).toHaveBeenCalledWith("held-sign");

    act(() => root.unmount());
  });
});

const LADDER_VIEW: LadderClimbSiteView = {
  gameId: "tidemark-ladder-climb",
  siteId: "fixture-gamble-site",
  scene: null,
  isFarpoint: false,
  runtimeReady: true,
  essenceReward: 25,
  rewardDreamsign: JACKPOT_DREAMSIGN,
  nextDraw: {
    attemptNumber: 1,
    targetRank: "Q",
    cost: 0,
    canAfford: true,
    available: true,
  },
  guide: VIEW.guide,
  result: null,
  replacement: null,
};

describe("GambleSiteScreen — Ladder Climb", () => {
  it("uses the full-portrait dialog composition on mobile", () => {
    stubMobileMatchMedia();
    const { container, root } = mount(
      <GambleSiteScreen
        view={LADDER_VIEW}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onReplaceDreamsign={() => undefined}
      />,
    );

    expect(
      container
        .querySelector("[data-guide-gallery-mobile-guide]")
        ?.getAttribute("data-guide-gallery-mobile-guide"),
    ).toBe("dialog");

    act(() => root.unmount());
  });

  it("shows the first draw target and locked Dreamsign on the shared prize face", () => {
    const onDraw = vi.fn();
    const { container, root } = mount(
      <GambleSiteScreen
        view={LADDER_VIEW}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={onDraw}
        onLadderOutcomeShown={() => undefined}
        onReplaceDreamsign={() => undefined}
      />,
    );

    expect(
      container
        .querySelector("[data-wager-prize-card]")
        ?.getAttribute("data-wager-prize-card-state"),
    ).toBe("prize");
    expect(container.querySelectorAll("[data-gamble-gate]")).toHaveLength(0);
    expect(container.querySelector("[data-wager-prize-title]")).not.toBeNull();
    expect(
      container.querySelector('[data-testid="gamble-ladder-dreamsign-name"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-wager-prize-dreamsign-source]"),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-wager-prize-card]")
        ?.getAttribute("data-wager-prize-essence-reward"),
    ).toBe("25");
    const draw = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-ladder-climb"]',
    );
    expect(draw?.disabled).toBe(false);
    const actionGroup = container.querySelector(
      "[data-ladder-round-action-group]",
    );
    expect(
      actionGroup?.querySelector('[data-testid="gamble-ladder-leave"]'),
    ).not.toBeNull();
    act(() => draw?.click());
    expect(onDraw).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("preserves the wager stage and action footprint while a draw resolves", () => {
    const { container, root } = mount(
      <GambleSiteScreen
        view={LADDER_VIEW}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onReplaceDreamsign={() => undefined}
      />,
    );
    const cardSlot = container.querySelector("[data-ladder-climb-card]");
    const actionSlot = container.querySelector("[data-ladder-actions]");
    const actionGroup = container.querySelector(
      "[data-ladder-round-action-group]",
    );

    act(() => {
      root.render(
        <CumulusRoot>
          <GambleSiteScreen
            view={{
              ...LADDER_VIEW,
              nextDraw: null,
              result: {
                id: "ladder-continuity",
                attemptNumber: 1,
                targetRank: "Q",
                card: { rank: "J", suit: "clubs" },
                won: false,
                resultSettled: false,
                terminal: false,
                pendingDreamsignReplacement: false,
              },
            }}
            onChooseGate={() => undefined}
            onLeave={() => undefined}
            onOutcomeShown={() => undefined}
            onPlayAgain={() => undefined}
            onDrawLadder={() => undefined}
            onLadderOutcomeShown={() => undefined}
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });

    expect(container.querySelector("[data-ladder-climb-card]")).toBe(cardSlot);
    expect(container.querySelector("[data-ladder-actions]")).toBe(actionSlot);
    expect(container.querySelector("[data-ladder-round-action-group]")).toBe(
      actionGroup,
    );
    expect(actionSlot?.getAttribute("data-ladder-actions")).toBe("hidden");

    act(() => root.unmount());
  });

  it("reveals the next paid draw only after a miss settles", () => {
    vi.useFakeTimers();
    const onDraw = vi.fn();
    const onOutcomeShown = vi.fn();
    const resultView: LadderClimbSiteView = {
      ...LADDER_VIEW,
      nextDraw: null,
      result: {
        id: "ladder-attempt-1",
        attemptNumber: 1,
        targetRank: "Q",
        card: { rank: "J", suit: "clubs" },
        won: false,
        resultSettled: false,
        terminal: false,
        pendingDreamsignReplacement: false,
      },
    };
    const { container, root } = mount(
      <GambleSiteScreen
        view={resultView}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={onDraw}
        onLadderOutcomeShown={onOutcomeShown}
        onReplaceDreamsign={() => undefined}
      />,
    );

    expect(
      container.querySelector('[data-testid="gamble-ladder-climb-again"]'),
    ).toBeNull();
    void act(() => vi.advanceTimersByTime(970));
    expect(onOutcomeShown).toHaveBeenCalledOnce();
    expect(
      container
        .querySelector("[data-radial-announcement]")
        ?.getAttribute("data-radial-announcement-tone"),
    ).toBe("danger");
    expect(
      container
        .querySelector("[data-wager-prize-card]")
        ?.getAttribute("data-wager-prize-card-state"),
    ).toBe("drawn");
    act(() => {
      root.render(
        <CumulusRoot>
          <GambleSiteScreen
            view={{
              ...resultView,
              nextDraw: {
                attemptNumber: 2,
                targetRank: "10",
                cost: 5,
                canAfford: true,
                available: true,
              },
              result: { ...resultView.result!, resultSettled: true },
            }}
            onChooseGate={() => undefined}
            onLeave={() => undefined}
            onOutcomeShown={() => undefined}
            onPlayAgain={() => undefined}
            onDrawLadder={onDraw}
            onLadderOutcomeShown={onOutcomeShown}
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    void act(() => vi.advanceTimersByTime(3_360));
    const drawAgain = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-ladder-climb-again"]',
    );
    expect(drawAgain?.disabled).toBe(false);
    expect(
      container
        .querySelector("[data-wager-prize-card]")
        ?.getAttribute("data-wager-prize-card-state"),
    ).toBe("prize");
    expect(
      container.querySelector('[data-testid="gamble-ladder-dreamsign-name"]'),
    ).not.toBeNull();
    act(() => drawAgain?.click());
    expect(onDraw).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("keeps the result inside the same prize object", () => {
    vi.useFakeTimers();
    const resultView: LadderClimbSiteView = {
      ...LADDER_VIEW,
      nextDraw: null,
      result: {
        id: "ladder-win",
        attemptNumber: 1,
        targetRank: "Q",
        card: { rank: "A", suit: "hearts" },
        won: true,
        resultSettled: false,
        terminal: true,
        pendingDreamsignReplacement: false,
      },
    };
    const { container, root } = mount(
      <GambleSiteScreen
        view={resultView}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onReplaceDreamsign={() => undefined}
      />,
    );

    expect(container.querySelectorAll("[data-wager-prize-card]")).toHaveLength(
      1,
    );
    void act(() => vi.advanceTimersByTime(970));
    act(() => {
      root.render(
        <CumulusRoot>
          <GambleSiteScreen
            view={{
              ...resultView,
              result: {
                ...resultView.result!,
                resultSettled: true,
              },
            }}
            onChooseGate={() => undefined}
            onLeave={() => undefined}
            onOutcomeShown={() => undefined}
            onPlayAgain={() => undefined}
            onDrawLadder={() => undefined}
            onLadderOutcomeShown={() => undefined}
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    expect(container.querySelectorAll("[data-wager-prize-card]")).toHaveLength(
      1,
    );
    expect(
      container.querySelector("[data-ladder-dreamsign-reward]"),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("reveals a won Dreamsign at large size before flying it to its HUD dock", () => {
    vi.useFakeTimers();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-ladder-dreamsign-source")) {
          return new DOMRect(900, 250, 240, 240);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const hudTarget = document.createElement("span");
    hudTarget.dataset.dreamsignId = JACKPOT_DREAMSIGN.id;
    hudTarget.getBoundingClientRect = () => new DOMRect(1180, 760, 58, 58);
    document.body.append(hudTarget);
    const resultView: LadderClimbSiteView = {
      ...LADDER_VIEW,
      nextDraw: null,
      result: {
        id: "ladder-reward-flight",
        attemptNumber: 1,
        targetRank: "Q",
        card: { rank: "A", suit: "hearts" },
        won: true,
        resultSettled: true,
        terminal: true,
        pendingDreamsignReplacement: false,
      },
    };
    const { container, root } = mount(
      <GambleSiteScreen
        view={resultView}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onReplaceDreamsign={() => undefined}
      />,
    );

    void act(() => vi.advanceTimersByTime(970));
    const source = container.querySelector<HTMLElement>(
      "[data-ladder-dreamsign-source]",
    );
    expect(source?.style.width).toBe("240px");
    void act(() => vi.advanceTimersByTime(1_680));
    expect(
      container
        .querySelector("[data-ladder-dreamsign-flight]")
        ?.getAttribute("data-ladder-dreamsign-destination"),
    ).toBe("journey-dreamsign");
    expect(hudTarget.style.visibility).toBe("hidden");

    act(() => root.unmount());
    expect(hudTarget.style.visibility).toBe("");
  });
});

describe("GambleSiteScreen — Starway Stairs", () => {
  it("shows three safe-draw range prizes above centered Bet and Leave actions", () => {
    const onDrawStarway = vi.fn();
    const { container, root } = mount(
      <GambleSiteScreen
        view={STARWAY_VIEW}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onDrawStarway={onDrawStarway}
        onStarwayOutcomeShown={() => undefined}
        onCashOutStarway={() => undefined}
        onReplaceDreamsign={() => undefined}
      />,
    );

    expect(container.querySelectorAll("[data-starway-tier]")).toHaveLength(3);
    expect(container.querySelectorAll("[data-wager-prize-card]")).toHaveLength(
      3,
    );
    expect(
      container.querySelectorAll("[data-starway-tier-button]"),
    ).toHaveLength(1);
    expect(container.querySelectorAll("[data-wager-prize-title]")).toHaveLength(
      3,
    );
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-wager-prize-card]"),
        (card) => card.dataset.wagerPrizeTarget,
      ),
    ).toEqual(["3-A", "5-A", "8-A"]);
    expect(container.textContent).not.toContain("%");
    expect(container.textContent).toContain(
      "Starway Stairs is the game. Keep betting to see how high you can go!",
    );

    const bet = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-starway-tier-1"]',
    );
    const leave = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-starway-leave"]',
    );
    const actions = container.querySelector<HTMLElement>(
      "[data-starway-actions]",
    );
    expect(bet?.textContent).not.toContain("·");
    expect(
      bet?.querySelector("[data-glass-button-essence-value]"),
    ).not.toBeNull();
    expect(bet?.querySelector("[data-glass-button-essence-cost]")).toBeNull();
    expect(leave?.textContent?.trim()).not.toBe("");
    expect(bet?.parentElement?.parentElement).toBe(actions);
    expect(leave?.parentElement).toBe(actions);
    expect(actions?.style.justifyContent).toBe("center");
    expect(actions?.style.flexWrap).toBe("nowrap");
    expect(actions?.textContent).not.toContain("Essence");
    expect(
      container.querySelector(
        '[data-starway-tier="1"] [data-wager-prize-card-emphasis="current"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll('[data-wager-prize-card-emphasis="muted"]'),
    ).toHaveLength(2);
    act(() => bet?.click());
    expect(onDrawStarway).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("reveals a safe card, then advances the tier and offers cash-out", () => {
    vi.useFakeTimers();
    const onOutcomeShown = vi.fn();
    const onCashOut = vi.fn();
    const safeView: StarwayStairsSiteView = {
      ...STARWAY_VIEW,
      canAffordWager: false,
      tiers: STARWAY_VIEW.tiers.map((tier) =>
        tier.tierNumber === 1
          ? {
              ...tier,
              state: "safe" as const,
              card: { rank: "3" as const, suit: "clubs" as const },
            }
          : tier.tierNumber === 2
            ? { ...tier, state: "current" as const }
            : tier,
      ),
      currentTierNumber: 2,
      result: {
        id: "starway-tier-1",
        tierNumber: 1,
        busted: false,
        resultSettled: true,
        prizeAtRisk: 60,
      },
      cashOutReward: 60,
    };
    const { container, root } = mount(
      <GambleSiteScreen
        view={safeView}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onDrawStarway={() => undefined}
        onStarwayOutcomeShown={onOutcomeShown}
        onCashOutStarway={onCashOut}
        onReplaceDreamsign={() => undefined}
      />,
    );

    void act(() => vi.advanceTimersByTime(1_000));
    expect(onOutcomeShown).toHaveBeenCalledOnce();
    const outcome = container.querySelector<HTMLElement>(
      "[data-starway-outcome]",
    );
    expect(outcome?.parentElement?.dataset.starwayTier).toBe("1");
    expect(outcome?.style.position).toBe("absolute");
    expect(
      container.querySelector("[data-starway-stairs-tiers]")?.children,
    ).toHaveLength(3);
    expect(
      container.querySelector(
        '[data-starway-tier="1"] [data-playing-card="3-clubs"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-starway-tier="1"] [data-wager-prize-card-emphasis="current"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-starway-tier="2"] [data-wager-prize-card-emphasis="muted"]',
      ),
    ).not.toBeNull();
    void act(() => vi.advanceTimersByTime(4_000));
    expect(
      container.querySelectorAll("[data-starway-tier-button]"),
    ).toHaveLength(1);
    const climb = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-starway-tier-2"]',
    );
    expect(climb).not.toBeNull();
    expect(climb?.textContent).not.toContain("·");
    expect(
      climb?.querySelector("[data-glass-button-essence-value]"),
    ).not.toBeNull();
    expect(climb?.querySelector("[data-glass-button-essence-cost]")).toBeNull();
    expect(climb?.getAttribute("aria-disabled")).toBe("true");
    const cashOut = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-starway-cash-out"]',
    );
    expect(cashOut?.textContent).not.toContain("·");
    expect(cashOut?.textContent).not.toContain("Essence");
    expect(
      cashOut?.querySelector("[data-glass-button-essence-value]"),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-starway-tier="1"] [data-wager-prize-card-emphasis="muted"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-starway-tier="2"] [data-wager-prize-card-emphasis="current"]',
      ),
    ).not.toBeNull();
    act(() => cashOut?.click());
    expect(onCashOut).toHaveBeenCalledOnce();
    expect(cashOut?.getAttribute("aria-disabled")).toBe("true");
    expect(
      container
        .querySelector('[data-testid="gamble-starway-tier-2"]')
        ?.getAttribute("aria-disabled"),
    ).toBe("true");

    act(() => root.unmount());
  });

  it("offers Play Again beside Leave after a terminal bust", () => {
    vi.useFakeTimers();
    const onPlayAgainStarway = vi.fn();
    const bustedView: StarwayStairsSiteView = {
      ...STARWAY_VIEW,
      tiers: STARWAY_VIEW.tiers.map((tier) =>
        tier.tierNumber === 1
          ? {
              ...tier,
              state: "bust" as const,
              card: { rank: "2" as const, suit: "spades" as const },
            }
          : tier,
      ),
      currentTierNumber: null,
      result: {
        id: "starway-tier-1-bust",
        tierNumber: 1,
        busted: true,
        resultSettled: true,
        prizeAtRisk: 60,
      },
      terminalReason: "bust",
    };
    const { container, root } = mount(
      <GambleSiteScreen
        view={bustedView}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onDrawStarway={() => undefined}
        onStarwayOutcomeShown={() => undefined}
        onCashOutStarway={() => undefined}
        onPlayAgainStarway={onPlayAgainStarway}
        onReplaceDreamsign={() => undefined}
      />,
    );

    void act(() => vi.advanceTimersByTime(1_000));
    void act(() => vi.advanceTimersByTime(4_000));
    expect(
      container.querySelectorAll("[data-starway-tier-button]"),
    ).toHaveLength(0);
    expect(
      container.querySelector(
        '[data-testid="gamble-starway-leave-after-result"]',
      ),
    ).toBeInstanceOf(HTMLButtonElement);
    const playAgain = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-starway-play-again"]',
    );
    expect(playAgain).toBeInstanceOf(HTMLButtonElement);
    expect(playAgain?.parentElement).toBe(
      container.querySelector(
        '[data-testid="gamble-starway-leave-after-result"]',
      )?.parentElement,
    );
    act(() => playAgain?.click());
    expect(onPlayAgainStarway).toHaveBeenCalledOnce();
    expect(
      container.querySelector('[data-testid="gamble-starway-cash-out"]'),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("hides Play Again after the third round", () => {
    vi.useFakeTimers();
    const { container, root } = mount(
      <GambleSiteScreen
        view={{
          ...STARWAY_VIEW,
          canPlayAgain: false,
          currentTierNumber: null,
          terminalReason: "bust",
          result: {
            id: "starway-final-round",
            tierNumber: 1,
            busted: true,
            resultSettled: true,
            prizeAtRisk: 60,
          },
        }}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onReplaceDreamsign={() => undefined}
      />,
    );

    void act(() => vi.advanceTimersByTime(1_000));
    void act(() => vi.advanceTimersByTime(4_000));
    expect(
      container.querySelector('[data-testid="gamble-starway-play-again"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="gamble-starway-leave-after-result"]',
      ),
    ).not.toBeNull();

    act(() => root.unmount());
  });
});

describe("GambleSiteScreen — Four-Suit Reprise", () => {
  it("shows the suit outcomes in a glass panel before committing a selected card", () => {
    const onDraw = vi.fn();
    const { container, root } = mount(
      <GambleSiteScreen
        view={FOUR_SUIT_VIEW}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onDrawFourSuit={onDraw}
        onReplaceDreamsign={() => undefined}
      />,
    );

    expect(container.querySelector("[data-four-suit-picker]")).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="gamble-four-suit-card-gallery"]',
      )?.dataset.galleryRole,
    ).toBe("picker");
    expect(container.querySelector("[data-four-suit-prize]")).toBeNull();
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="gamble-four-suit-card-four-suit-entry-1"]',
        )
        ?.click();
    });

    expect(container.querySelector("[data-four-suit-picker]")).toBeNull();
    expect(
      container.querySelector('[data-four-suit-target="four-suit-entry-1"]'),
    ).not.toBeNull();
    const outcomePanel = container.querySelector(
      '[data-testid="gamble-four-suit-outcome-panel"]',
    );
    expect(outcomePanel?.getAttribute("data-glass-panel-frame")).toBe(
      "floating",
    );
    expect(outcomePanel?.querySelector("[data-wager-prize-card]")).toBeNull();
    expect(
      container.querySelector(
        '[data-four-suit-draw-card] [data-playing-card-variant="fourSuit"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        "[data-playing-card-four-suit-face] [data-playing-card-suit-mark]",
      ),
    ).toHaveLength(4);
    expect(container.querySelectorAll("[data-four-suit-outcome]")).toHaveLength(
      4,
    );
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-four-suit-outcome]"),
        (element) => element.dataset.fourSuitOutcome,
      ),
    ).toEqual(["spades", "diamonds", "hearts", "clubs"]);
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-four-suit-outcome]"),
        (element) =>
          element.querySelector<HTMLElement>("[data-playing-card-suit-mark]")
            ?.dataset.playingCardSuitMark,
      ),
    ).toEqual(["spades", "diamonds", "hearts", "clubs"]);
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>(
          "[data-four-suit-outcome] [data-playing-card-suit-glyph]",
        ),
      ).every((element) =>
        element.style.webkitTextStroke.includes(
          PLAYING_CARD_DESIGN.colors.characterOutline,
        ),
      ),
    ).toBe(true);
    expect(container.querySelector("[data-four-suit-chance]")).toBeNull();
    const reselect = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-four-suit-choose-again"]',
    );
    expect(reselect?.querySelector("i.bx-refresh-ccw")).not.toBeNull();
    expect(
      container.querySelector(
        '[data-four-suit-actions] [data-testid="gamble-four-suit-choose-again"]',
      ),
    ).toBe(reselect);
    expect(
      container.querySelector(
        '[data-four-suit-reselect] [data-testid="gamble-four-suit-choose-again"]',
      ),
    ).toBe(reselect);
    expect(
      container.querySelector<HTMLElement>("[data-four-suit-reselect]")?.style
        .gridColumn,
    ).toBe("1");
    expect(
      container.querySelector<HTMLElement>("[data-four-suit-stage]")?.style
        .gridTemplateAreas,
    ).toBe('"target draw rewards"');
    expect(
      container.querySelector<HTMLElement>("[data-four-suit-stage]")?.style
        .columnGap,
    ).toBe("var(--space-4xl)");
    expect(
      container.querySelector<HTMLElement>(
        '[data-gamble-game="four-suit-reprise"]',
      )?.style.gap,
    ).toBe("var(--space-3xl)");
    act(() => reselect?.click());
    expect(container.querySelector("[data-four-suit-picker]")).not.toBeNull();
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="gamble-four-suit-card-four-suit-entry-1"]',
        )
        ?.click();
    });
    const draw = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-four-suit-draw"]',
    );
    expect(
      draw?.querySelector("[data-glass-button-essence-cost]"),
    ).not.toBeNull();
    act(() => draw?.click());
    expect(onDraw).toHaveBeenCalledWith("four-suit-entry-1");

    act(() => root.unmount());
  });

  it("opens the shared free Transfiguration chooser after Spades", () => {
    vi.useFakeTimers();
    const onOutcomeShown = vi.fn();
    const onChooseTransfiguration = vi.fn();
    const initialView = fourSuitResultView();
    const { container, root } = mount(
      <GambleSiteScreen
        view={initialView}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onFourSuitOutcomeShown={onOutcomeShown}
        onChooseFourSuitTransfiguration={onChooseTransfiguration}
        onReplaceDreamsign={() => undefined}
      />,
    );

    void act(() => vi.advanceTimersByTime(1_000));
    expect(onOutcomeShown).toHaveBeenCalledOnce();
    expect(
      container.querySelector(
        '[data-playing-card-variant="fourSuit"][data-playing-card-state="drawn"]',
      ),
    ).not.toBeNull();
    expect(container.querySelectorAll("[data-four-suit-outcome]")).toHaveLength(
      4,
    );
    const revealedView = fourSuitResultView({ resultRevealed: true });
    act(() => {
      root.render(
        <CumulusRoot>
          <GambleSiteScreen
            view={revealedView}
            onChooseGate={() => undefined}
            onLeave={() => undefined}
            onOutcomeShown={() => undefined}
            onPlayAgain={() => undefined}
            onDrawLadder={() => undefined}
            onLadderOutcomeShown={() => undefined}
            onFourSuitOutcomeShown={onOutcomeShown}
            onChooseFourSuitTransfiguration={onChooseTransfiguration}
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    void act(() => vi.advanceTimersByTime(4_000));

    expect(
      container.querySelector('[data-testid="cumulus-transfiguration-detail"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="cumulus-transfiguration-choose-again"]',
      ),
    ).toBeNull();
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-form-Empowered"]',
        )
        ?.click();
    });
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-transfiguration-confirm"]',
    );
    expect(confirm?.getAttribute("aria-disabled")).not.toBe("true");
    expect(
      confirm?.querySelector("[data-glass-button-essence-cost]"),
    ).toBeNull();
    act(() => confirm?.click());
    expect(onChooseTransfiguration).toHaveBeenCalledWith("Empowered");

    const revealedResult = revealedView.result;
    const previewModel =
      revealedResult?.transfigurationCandidate.forms[0]?.previewModel;
    if (previewModel === undefined || revealedResult === null) {
      throw new Error("expected fixture Transfiguration preview");
    }
    act(() => {
      root.render(
        <CumulusRoot>
          <GambleSiteScreen
            view={fourSuitResultView({
              resultRevealed: true,
              resultSettled: true,
              chosenTransfiguration: "Empowered",
              target: {
                ...revealedResult.target,
                model: previewModel,
              },
            })}
            onChooseGate={() => undefined}
            onLeave={() => undefined}
            onOutcomeShown={() => undefined}
            onPlayAgain={() => undefined}
            onDrawLadder={() => undefined}
            onLadderOutcomeShown={() => undefined}
            onFourSuitOutcomeShown={onOutcomeShown}
            onChooseFourSuitTransfiguration={onChooseTransfiguration}
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    expect(
      container.querySelector(
        '[data-four-suit-card-outcome="transfiguration"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelectorAll("[data-four-suit-transfiguration-face]"),
    ).toHaveLength(2);
    void act(() => vi.advanceTimersByTime(2_600));
    expect(container.querySelector("[data-four-suit-target]")).toBeNull();
    expect(
      container.querySelector("[data-four-suit-target-slot]"),
    ).not.toBeNull();
    const replay = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-four-suit-play-again"]',
    );
    expect(replay).not.toBeNull();
    expect(replay?.getAttribute("aria-disabled")).not.toBe("true");

    act(() => root.unmount());
  });

  it.each([
    ["essence", "diamonds", 100],
    ["duplication", "hearts", 0],
    ["purge", "clubs", 0],
  ] as const)(
    "animates the target card away for a %s result",
    (outcome, suit, essenceGained) => {
      vi.useFakeTimers();
      const { container, root } = mount(
        <GambleSiteScreen
          view={fourSuitResultView({
            card: { rank: "7", suit },
            outcome,
            resultRevealed: true,
            resultSettled: true,
            essenceGained,
          })}
          onChooseGate={() => undefined}
          onLeave={() => undefined}
          onOutcomeShown={() => undefined}
          onPlayAgain={() => undefined}
          onDrawLadder={() => undefined}
          onLadderOutcomeShown={() => undefined}
          onReplaceDreamsign={() => undefined}
        />,
      );

      void act(() => vi.advanceTimersByTime(1_000));
      expect(
        container.querySelector(`[data-four-suit-card-outcome="${outcome}"]`),
      ).not.toBeNull();
      if (outcome === "duplication") {
        expect(
          container.querySelectorAll("[data-four-suit-duplicate-card]"),
        ).toHaveLength(2);
      }
      if (outcome === "essence") {
        expect(
          container.querySelector("[data-four-suit-essence-badge]"),
        ).not.toBeNull();
      }
      void act(() => vi.advanceTimersByTime(2_600));
      expect(container.querySelector("[data-four-suit-target]")).toBeNull();
      expect(
        container.querySelector("[data-four-suit-target-slot]"),
      ).not.toBeNull();

      act(() => root.unmount());
    },
  );

  it("offers a shared replay only after a settled result", () => {
    vi.useFakeTimers();
    const onPlayAgain = vi.fn();
    const { container, root } = mount(
      <GambleSiteScreen
        view={fourSuitResultView({
          card: { rank: "7", suit: "hearts" },
          outcome: "duplication",
          resultRevealed: true,
          resultSettled: true,
        })}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onPlayAgainFourSuit={onPlayAgain}
        onReplaceDreamsign={() => undefined}
      />,
    );

    void act(() => vi.advanceTimersByTime(1_000));
    void act(() => vi.advanceTimersByTime(4_000));
    const replay = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-four-suit-play-again"]',
    );
    expect(replay).not.toBeNull();
    act(() => replay?.click());
    expect(onPlayAgain).toHaveBeenCalledOnce();
    expect(
      container.querySelector('[data-testid="gamble-four-suit-play-again"]'),
    ).toBeNull();

    const replayView: FourSuitRepriseSiteView = {
      ...fourSuitResultView({
        card: { rank: "7", suit: "hearts" },
        outcome: "duplication",
        resultRevealed: true,
        resultSettled: true,
      }),
      phase: "choose",
      roundNumber: 2,
      cards: [FOUR_SUIT_VIEW.cards[1]],
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <GambleSiteScreen
            view={replayView}
            onChooseGate={() => undefined}
            onLeave={() => undefined}
            onOutcomeShown={() => undefined}
            onPlayAgain={() => undefined}
            onDrawLadder={() => undefined}
            onLadderOutcomeShown={() => undefined}
            onPlayAgainFourSuit={onPlayAgain}
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="gamble-four-suit-card-four-suit-entry-2"]',
        )
        ?.click();
    });
    expect(
      container.querySelector('[data-four-suit-target="four-suit-entry-2"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-playing-card-variant="fourSuit"][data-playing-card-state="concealed"]',
      ),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("shows the changing Twenty-One Dreamsign before the paid deal", () => {
    const onDeal = vi.fn();
    const { container, root } = mount(
      <GambleSiteScreen
        view={TWENTY_ONE_VIEW}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onDealTwentyOne={onDeal}
        onReplaceDreamsign={() => undefined}
      />,
    );
    expect(container.querySelector("[data-twenty-one-title]")?.textContent).toBe(
      "Twenty-One",
    );
    expect(
      container.querySelector('[data-testid="twenty-one-reward-dreamsign"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="gamble-twenty-one-deal"]')
        ?.textContent,
    ).toContain("55");
    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="gamble-twenty-one-deal"]',
      )?.click();
    });
    expect(onDeal).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("renders every revealed card as a squircle and pairs the total with its reward", () => {
    const onHit = vi.fn();
    const { container, root } = mount(
      <GambleSiteScreen
        view={{
          ...TWENTY_ONE_VIEW,
          cards: [
            { rank: "10", suit: "clubs" },
            { rank: "6", suit: "hearts" },
          ],
          total: 16,
          title: "16 · 55 Essence",
          essenceReward: 55,
          nextCardOdds: {
            remainingCards: 50,
            noReward: 12,
            lowReward: 10,
            highReward: 8,
            dreamsign: 4,
            bust: 16,
          },
        }}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onHitTwentyOne={onHit}
        onReplaceDreamsign={() => undefined}
      />,
    );
    expect(container.querySelector("[data-twenty-one-title]")?.textContent).toBe(
      "16 · 55 Essence",
    );
    expect(container.querySelectorAll('[data-playing-card-variant="rankSuit"]')).toHaveLength(2);
    expect(container.querySelector("[data-twenty-one-odds]")?.textContent).toContain(
      "4 reach 21",
    );
    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="gamble-twenty-one-hit"]',
      )?.click();
    });
    expect(onHit).toHaveBeenCalledOnce();

    act(() => {
      root.render(
        <CumulusRoot>
          <GambleSiteScreen
            view={{
              ...TWENTY_ONE_VIEW,
              cards: [
                { rank: "10", suit: "clubs" },
                { rank: "6", suit: "hearts" },
                { rank: "A", suit: "spades" },
              ],
              total: 17,
              title: "17 · 55 Essence",
              essenceReward: 55,
              nextCardOdds: {
                remainingCards: 49,
                noReward: 8,
                lowReward: 9,
                highReward: 8,
                dreamsign: 4,
                bust: 20,
              },
            }}
            onChooseGate={() => undefined}
            onLeave={() => undefined}
            onOutcomeShown={() => undefined}
            onPlayAgain={() => undefined}
            onDrawLadder={() => undefined}
            onLadderOutcomeShown={() => undefined}
            onHitTwentyOne={onHit}
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="gamble-twenty-one-hit"]',
      )?.disabled,
    ).toBe(false);
    act(() => root.unmount());
  });

  it("offers a second Twenty-One round only after a settled miss", () => {
    vi.useFakeTimers();
    const onPlayAgain = vi.fn();
    const { container, root } = mount(
      <GambleSiteScreen
        view={{
          ...TWENTY_ONE_VIEW,
          cards: [
            { rank: "10", suit: "clubs" },
            { rank: "5", suit: "hearts" },
          ],
          total: 15,
          title: "15 · No Reward",
          essenceReward: 0,
          terminalReason: "stood",
          resultSettled: true,
          resultId: "fixture-twenty-one-result",
          canPlayAgain: true,
        }}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onPlayAgainTwentyOne={onPlayAgain}
        onReplaceDreamsign={() => undefined}
      />,
    );
    void act(() => vi.advanceTimersByTime(4_500));
    const replay = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-twenty-one-play-again"]',
    );
    expect(replay).not.toBeNull();
    act(() => replay?.click());
    expect(onPlayAgain).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("lets the player reopen a canceled Twenty-One replacement choice", () => {
    vi.useFakeTimers();
    const { container, root } = mount(
      <GambleSiteScreen
        view={{
          ...TWENTY_ONE_VIEW,
          cards: [
            { rank: "A", suit: "clubs" },
            { rank: "K", suit: "hearts" },
          ],
          total: 21,
          title: "21 · 150 Essence + Jackpot Sign",
          terminalReason: "twenty-one",
          resultSettled: true,
          resultId: "fixture-twenty-one-jackpot",
          replacement: {
            pendingDreamsign: JACKPOT_DREAMSIGN,
            currentDreamsigns: [{
              id: "held-sign",
              name: "Held Sign",
              effectDescription: "A held effect.",
            }],
            maxDreamsigns: 1,
          },
        }}
        onChooseGate={() => undefined}
        onLeave={() => undefined}
        onOutcomeShown={() => undefined}
        onPlayAgain={() => undefined}
        onDrawLadder={() => undefined}
        onLadderOutcomeShown={() => undefined}
        onReplaceDreamsign={() => undefined}
      />,
    );

    void act(() => vi.advanceTimersByTime(970));
    void act(() => vi.advanceTimersByTime(3_360));
    expect(container.querySelector("[data-dreamsign-replacement-dialog]"))
      .not.toBeNull();
    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="dreamsign-replacement-cancel"]',
      )?.click();
    });
    expect(container.querySelector("[data-dreamsign-replacement-dialog]"))
      .toBeNull();
    const reopen = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-open-replacement"]',
    );
    expect(reopen).not.toBeNull();
    act(() => reopen?.click());
    expect(container.querySelector("[data-dreamsign-replacement-dialog]"))
      .not.toBeNull();

    act(() => root.unmount());
  });
});
