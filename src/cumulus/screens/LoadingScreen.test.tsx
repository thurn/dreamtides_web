// @vitest-environment jsdom

import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import { LoadingScreen, type LoadingView } from "./LoadingScreen";

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
  },
  useReducedMotion: () => false,
}));

function card(
  id: string,
  cardNumber: number,
  cardType: CardData["cardType"],
): CardData {
  return {
    id: asCardId(id),
    name: asCardName(`Fixture ${String(cardNumber)}`),
    cardNumber,
    cardType,
    subtype: cardType === "Character" ? "Fixture" : "",
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
  runeboundChampion: {
    cardId: CHAMPION.id,
    displaySnapshot: CHAMPION,
  },
  worldsAwait: { cardId: WORLDS.id, displaySnapshot: WORLDS },
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
  vi.restoreAllMocks();
  delete (globalThis as { ResizeObserver?: typeof ResizeObserver })
    .ResizeObserver;
});

function renderLoadingScreen(playbackSpeed = 1): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <CumulusRoot>
        <LoadingScreen view={VIEW} playbackSpeed={playbackSpeed} />
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
    expect(container.querySelector("[data-loading-indicator]")?.textContent).toBe(
      "Loading",
    );
    expect(
      container.querySelector("[data-loading-card-types-label]")?.textContent,
    ).toBe("Card Types");
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

  it("anchors every callout to the intended rendered card region", () => {
    const container = renderLoadingScreen();
    const champion = container.querySelector<HTMLElement>(
      '[data-loading-card-group="runeboundChampion"]',
    );
    const worlds = container.querySelector<HTMLElement>(
      '[data-loading-card-group="worldsAwait"]',
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
