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

const VIEW: GambleSiteView = {
  siteId: "fixture-gamble-site",
  scene: null,
  isEnhanced: false,
  dealId: "fixture-deal",
  cards: [
    { id: "A-spades", rank: "A", suit: "spades" },
    { id: "10-hearts", rank: "10", suit: "hearts" },
    { id: "K-clubs", rank: "K", suit: "clubs" },
    { id: "2-diamonds", rank: "2", suit: "diamonds" },
    { id: "Q-spades", rank: "Q", suit: "spades" },
    { id: "7-hearts", rank: "7", suit: "hearts" },
  ],
  guide: {
    id: "fixture-guide",
    name: "Fixture Guide",
    line: "A fixture gamble.",
    art: artRef.dreamGuide("fixture-guide"),
  },
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
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("GambleSiteScreen", () => {
  it("renders six cards in a two-by-three hand and rerolls from the corner control", () => {
    const onReroll = vi.fn();
    const { container, root } = mount(
      <GambleSiteScreen view={VIEW} onReroll={onReroll} />,
    );
    const hand = container.querySelector<HTMLElement>("[data-gamble-hand]");

    expect(hand?.style.gridTemplateColumns).toBe("repeat(3, max-content)");
    expect(hand?.style.gridTemplateRows).toBe("repeat(2, max-content)");
    expect(hand?.querySelectorAll("[data-playing-card]")).toHaveLength(6);
    expect(
      hand?.querySelector('[data-playing-card="10-hearts"]')?.textContent,
    ).toBe("10♥");
    const firstCard = hand?.querySelector<HTMLButtonElement>(
      '[data-gamble-playing-card="A-spades"]',
    );
    expect(firstCard?.dataset.gamblePlayingCardFace).toBe("front");
    expect(firstCard?.getAttribute("aria-pressed")).toBe("false");

    act(() => firstCard?.click());
    expect(firstCard?.dataset.gamblePlayingCardFace).toBe("back");
    expect(firstCard?.getAttribute("aria-pressed")).toBe("true");
    expect(
      firstCard?.querySelector("[data-playing-card]")
        ?.getAttribute("data-playing-card-face"),
    ).toBe("back");

    act(() => firstCard?.click());
    expect(firstCard?.dataset.gamblePlayingCardFace).toBe("front");
    expect(firstCard?.getAttribute("aria-pressed")).toBe("false");
    expect(
      container.querySelector('[data-testid="cumulus-gamble-guide-art"]')
        ?.getAttribute("alt"),
    ).toBe("Fixture Guide");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-gamble-reroll"]',
        )
        ?.click();
    });
    expect(onReroll).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });
});
