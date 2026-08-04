// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CumulusRoot } from "../CumulusRoot";
import { artRef } from "../primitives/art";
import {
  GambleSiteScreen,
  type GambleSiteView,
} from "./GambleSiteScreen";

const JACKPOT_DREAMSIGN = {
  id: "00000000-0000-4000-8000-000000000041",
  name: "Fixture Jackpot",
  imageName: "fixture-jackpot.png",
  effectDescription: "Foresee 1.",
  isNegative: false,
};

const VIEW: GambleSiteView = {
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
        onReplaceDreamsign={() => undefined}
      />,
    );

    expect(
      container.querySelector("[data-playing-card]"),
    ).toBeNull();
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
    expect(container.querySelectorAll("[data-wager-prize-card]"))
      .toHaveLength(3);
    expect(container.querySelector('[data-gamble-gate="six"]')?.textContent)
      .toBe("Draw 6-AWin 100");
    expect(container.querySelector('[data-gamble-gate="nine"]')?.textContent)
      .toBe("Draw 9-AWin 150");
    expect(container.querySelector('[data-gamble-gate="jack"]')?.textContent)
      .toBe("Draw J-AWin 200 and Fixture Jackpot");
    expect(container.textContent).not.toContain("chance");
    expect(container.textContent).not.toContain("Gravok’s Casino");
    expect(container.textContent).not.toContain("Three-Gate Wager");
    const dreamsignName = container.querySelector<HTMLElement>(
      "[data-testid=gamble-jackpot-dreamsign-name]",
    );
    expect(dreamsignName)
      .not.toBeNull();
    expect(dreamsignName?.style.textDecoration).toContain("underline");
    expect(
      dreamsignName?.parentElement?.hasAttribute(
        "data-wager-prize-description",
      ),
    ).toBe(true);
    expect(dreamsignName?.style.font).toBe("inherit");
    const dreamsignSource = container.querySelector<HTMLElement>(
      '[data-gamble-gate="jack"] [data-wager-prize-dreamsign-source]',
    );
    expect(dreamsignSource?.dataset.revealPrimaryVariant).toBe("object");
    expect(dreamsignSource?.querySelector("[data-wager-prize-title]"))
      .not.toBeNull();
    expect(dreamsignSource?.querySelector("[data-wager-prize-description]"))
      .not.toBeNull();
    const leaveSlot = container.querySelector<HTMLElement>(
      "[data-gamble-leave-slot]",
    );
    expect(leaveSlot?.style.position).toBe("absolute");
    expect(leaveSlot?.style.bottom).toBe("0px");

    const chooseSix = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-choose-six"]',
    );
    expect(chooseSix?.textContent).toBe("Bet · 50");
    expect(chooseSix?.getAttribute("aria-label")).toBe(
      "Bet on Six Gate for 50 Essence",
    );
    act(() => chooseSix?.click());
    expect(onChooseGate).toHaveBeenCalledWith("six");

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="gamble-leave"]')
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
    const resultView: GambleSiteView = {
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
        onReplaceDreamsign={() => undefined}
      />,
    );

    expect(container.querySelector("[data-playing-card]")).toBeNull();
    expect(
      container.querySelector('[data-gamble-gate="nine"]')?.getAttribute(
        "data-gamble-gate-presentation",
      ),
    ).toBe("selected");
    expect(
      container.querySelector('[data-gamble-gate="jack"]')?.getAttribute(
        "data-gamble-gate-presentation",
      ),
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
      container.querySelector('[data-gamble-gate="jack"] [data-playing-card]')
        ?.getAttribute("data-playing-card-face"),
    ).toBe("front");
    expect(
      container.querySelector('[data-gamble-gate="six"]')?.getAttribute(
        "aria-hidden",
      ),
    ).toBe("true");
    expect(
      container.querySelector('[data-gamble-bet="jack"]')?.getAttribute(
        "aria-hidden",
      ),
    ).toBe("true");
    expect(
      container.querySelector('[data-gamble-bet="nine"]')?.getAttribute(
        "aria-hidden",
      ),
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
    expect(announcement?.getAttribute("data-radial-announcement-duration"))
      .toBe("extended");
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
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    void act(() => vi.advanceTimersByTime(3_359));
    expect(container.querySelector('[data-testid="gamble-play-again"]'))
      .toBeNull();
    void act(() => vi.advanceTimersByTime(1));
    const playAgain = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-play-again"]',
    );
    const leave = container.querySelector<HTMLButtonElement>(
      '[data-testid="gamble-leave-after-round"]',
    );
    expect(playAgain?.textContent).toBe("Play Again");
    expect(leave?.textContent).toBe("Leave");
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
            onReplaceDreamsign={() => undefined}
          />
        </CumulusRoot>,
      );
    });
    expect(container.querySelector('[data-testid="gamble-play-again"]'))
      .toBeNull();
    expect(container.querySelector('[data-testid="gamble-leave-after-round"]'))
      .not.toBeNull();
    expect(
      container.querySelector<HTMLElement>(
        "[data-gamble-round-action-group]",
      )?.style.gridColumn,
    ).toBe("1 / span 3");

    act(() => root.unmount());
  });

  it("opens the shared Dreamsign replacement flow after an at-cap jackpot", () => {
    vi.useFakeTimers();
    const onReplaceDreamsign = vi.fn();
    const replacementView: GambleSiteView = {
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
            isNegative: false,
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
        onReplaceDreamsign={onReplaceDreamsign}
      />,
    );

    void act(() => vi.advanceTimersByTime(970));
    void act(() => vi.advanceTimersByTime(3_360));
    expect(container.querySelector("[data-dreamsign-replacement-dialog]"))
      .not.toBeNull();
    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="replace-dreamsign-held-sign"]',
      )?.click();
    });
    expect(onReplaceDreamsign).toHaveBeenCalledWith("held-sign");

    act(() => root.unmount());
  });
});
