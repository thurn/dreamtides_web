// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import { LoadingScreen, type LoadingView } from "./LoadingScreen";
import { testCardId } from "../../types/test-identities";

vi.mock("framer-motion", () => ({
  motion: {
    main: ({
      animate,
      children,
      initial,
      transition,
      ...props
    }: {
      readonly animate?: unknown;
      readonly children?: ReactNode;
      readonly initial?: unknown;
      readonly transition?: unknown;
    }) =>
      createElement(
        "main",
        {
          ...props,
          "data-motion-animate": JSON.stringify(animate),
          "data-motion-initial": JSON.stringify(initial),
          "data-motion-transition": JSON.stringify(transition),
        },
        children,
      ),
    rect: ({
      animate,
      initial,
      transition,
      ...props
    }: {
      readonly animate?: unknown;
      readonly initial?: unknown;
      readonly transition?: unknown;
    }) =>
      createElement("rect", {
        ...props,
        "data-motion-animate": JSON.stringify(animate),
        "data-motion-initial": JSON.stringify(initial),
        "data-motion-transition": JSON.stringify(transition),
      }),
    div: ({
      animate,
      children,
      initial,
      transition,
      ...props
    }: {
      readonly animate?: unknown;
      readonly children?: ReactNode;
      readonly initial?: unknown;
      readonly transition?: unknown;
    }) =>
      createElement(
        "div",
        {
          ...props,
          "data-motion-animate": JSON.stringify(animate),
          "data-motion-initial": JSON.stringify(initial),
          "data-motion-transition": JSON.stringify(transition),
        },
        children,
      ),
  },
  useReducedMotion: () => false,
}));

function card(
  idSeed: string,
  cardNumber: number,
  cardType: CardData["cardType"],
): CardData {
  return {
    id: testCardId(idSeed),
    name: parseCardName(`Fixture ${String(cardNumber)}`),
    cardNumber,
    cardType,
    subtype: cardType === "Character" ? "Warrior" : "",
    isStarter: true,
    energyCost: cardNumber,
    spark: cardType === "Character" ? 3 : null,
    isFast: false,
    renderedText: "Fixture ability.",
    imageNumber: cardNumber,
    artOwned: true,
  };
}

const CHAMPION = card("11111111-1111-4111-8111-111111111111", 1, "Character");
const WORLDS = card("22222222-2222-4222-8222-222222222222", 2, "Event");
const VIEW: LoadingView = {
  loadingCharacter: {
    cardId: CHAMPION.id,
    displaySnapshot: CHAMPION,
  },
  loadingEvent: { cardId: WORLDS.id, displaySnapshot: WORLDS },
};

let root: Root | null = null;

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === "(min-width: 900px)",
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  vi.spyOn(window, "requestAnimationFrame").mockReturnValue(1);
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
});

afterEach(() => {
  if (root !== null) act(() => root?.unmount());
  root = null;
  document.body.innerHTML = "";
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete (globalThis as { ResizeObserver?: typeof ResizeObserver })
    .ResizeObserver;
});

function renderLoadingScreen(
  playbackSpeed = 1,
  onBegin: () => void = vi.fn(),
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <CumulusRoot>
        <LoadingScreen
          view={VIEW}
          playbackSpeed={playbackSpeed}
          onBegin={onBegin}
        />
      </CumulusRoot>,
    ),
  );
  return container;
}

describe("LoadingScreen", () => {
  it("renders both large cards with all four semantic callouts", () => {
    const container = renderLoadingScreen();
    const screen = container.querySelector<HTMLElement>(
      "[data-loading-screen]",
    );

    expect(screen?.style.background).toBe("var(--bg-loading)");
    expect(JSON.parse(screen?.dataset.motionTransition ?? "{}")).toMatchObject({
      duration: 1.2,
    });
    expect(
      container.querySelector(`[data-card-id="${CHAMPION.id}"]`),
    ).not.toBeNull();
    expect(
      container.querySelector(`[data-card-id="${WORLDS.id}"]`),
    ).not.toBeNull();
    expect(
      [
        ...container.querySelectorAll<HTMLElement>("[data-loading-callout]"),
      ].map((callout) => callout.dataset.loadingCallout),
    ).toEqual(["cost", "spark", "ability", "cardType"]);
    expect(container.querySelector("[data-loading-quote]")).toBeNull();
    expect(
      container.querySelector("[data-loading-indicator]")?.textContent,
    ).toBe("Loading");
    expect(
      container.querySelector("[data-loading-card-types-label]")?.textContent,
    ).toBe("Dreamtides Cards:");
    expect(
      container.querySelector(
        '[data-loading-card-type-label="loadingCharacter"]',
      )?.textContent,
    ).toBe("Character");
    expect(
      container.querySelector('[data-loading-card-type-label="loadingEvent"]')
        ?.textContent,
    ).toBe("Event");
  });

  it("keeps the mobile footer inside the dynamic viewport and bottom safe area", () => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));

    const container = renderLoadingScreen();
    const screen = container.querySelector<HTMLElement>(
      "[data-loading-screen]",
    );
    const footer = container.querySelector<HTMLElement>(
      "[data-loading-footer]",
    );
    const stage = container.querySelector<HTMLElement>(
      "[data-loading-card-stage]",
    );
    const cards = [
      ...container.querySelectorAll<HTMLElement>("[data-loading-card]"),
    ];

    expect(screen?.style.height).toBe("100dvh");
    expect(screen?.style.minHeight).toBe("");
    expect(stage?.style.gap).toBe("var(--space-6xl)");
    expect(cards).toHaveLength(2);
    expect(
      cards.every((card) =>
        card.style.width.startsWith("min(47vw, 200px,"),
      ),
    ).toBe(true);
    expect(footer?.style.bottom).toBe(
      "max(var(--safe-area-inset-bottom), var(--space-xs))",
    );
  });

  it("fills every spinner segment across the five-second loading interval", () => {
    const container = renderLoadingScreen();
    const segments = [
      ...container.querySelectorAll<SVGRectElement>(
        "[data-loading-spinner-segment]",
      ),
    ];

    expect(segments).toHaveLength(12);
    expect(
      JSON.parse(segments[0]?.dataset.motionTransition ?? "{}"),
    ).toMatchObject({ delay: 0, duration: 5 / 12 });
    const lastTransition = JSON.parse(
      segments[segments.length - 1]?.dataset.motionTransition ?? "{}",
    ) as { delay?: number; duration?: number };
    expect(
      (lastTransition.delay ?? 0) + (lastTransition.duration ?? 0),
    ).toBeCloseTo(5);
  });

  it("replaces Loading with Begin after five seconds and reports the action", () => {
    vi.useFakeTimers();
    const onBegin = vi.fn();
    const container = renderLoadingScreen(1, onBegin);

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(container.querySelector("[data-loading-indicator]")).not.toBeNull();
    expect(container.querySelector('[data-testid="loading-begin"]')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector("[data-loading-indicator]")).toBeNull();
    const begin = container.querySelector<HTMLButtonElement>(
      '[data-testid="loading-begin"]',
    );
    expect(begin).not.toBeNull();
    expect(begin?.style.height).toBe("56px");
    expect(begin?.style.font).toBe("var(--t-button-lg)");
    const entry = container.querySelector<HTMLElement>(
      "[data-loading-begin-entry]",
    );
    expect(JSON.parse(entry?.dataset.motionInitial ?? "{}")).toMatchObject({
      opacity: 0,
      scale: 0.84,
    });
    expect(JSON.parse(entry?.dataset.motionAnimate ?? "{}")).toMatchObject({
      opacity: 1,
      scale: 1,
    });
    expect(JSON.parse(entry?.dataset.motionTransition ?? "{}")).toMatchObject({
      duration: 0.42,
    });

    act(() => begin?.click());
    expect(onBegin).toHaveBeenCalledTimes(1);
  });

  it("anchors every callout to the intended rendered card region", () => {
    const container = renderLoadingScreen();
    const champion = container.querySelector<HTMLElement>(
      '[data-loading-card-group="loadingCharacter"]',
    );
    const worlds = container.querySelector<HTMLElement>(
      '[data-loading-card-group="loadingEvent"]',
    );

    expect(champion?.querySelector('[data-card-stat="energy"]')).not.toBeNull();
    expect(champion?.querySelector('[data-card-stat="spark"]')).not.toBeNull();
    expect(champion?.querySelector("[data-card-rules-text]")).not.toBeNull();
    expect(worlds?.querySelector("[data-card-type-line]")).not.toBeNull();
    expect(worlds?.querySelector('[data-card-stat="spark"]')).toBeNull();
  });

  it("scales the loading-screen fade by the tutorial playback multiplier", () => {
    const container = renderLoadingScreen(4);
    const screen = container.querySelector<HTMLElement>(
      "[data-loading-screen]",
    );
    expect(JSON.parse(screen?.dataset.motionTransition ?? "{}")).toMatchObject({
      duration: 0.3,
    });
    const segments = [
      ...container.querySelectorAll<SVGRectElement>(
        "[data-loading-spinner-segment]",
      ),
    ];
    const lastTransition = JSON.parse(
      segments[segments.length - 1]?.dataset.motionTransition ?? "{}",
    ) as { delay?: number; duration?: number };
    expect(
      (lastTransition.delay ?? 0) + (lastTransition.duration ?? 0),
    ).toBeCloseTo(1.25);
  });
});
