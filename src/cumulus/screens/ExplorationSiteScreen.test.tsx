// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import { artRef } from "../primitives/art";
import {
  ExplorationSiteScreen,
  type ExplorationSiteView,
} from "./ExplorationSiteScreen";

const reducedMotionPreference = vi.hoisted(() => ({ value: true }));

vi.mock("framer-motion", async () => {
  const React = await import("react");
  const MotionElement = React.forwardRef<
    HTMLElement,
    React.HTMLAttributes<HTMLElement> & {
      initial?: unknown;
      animate?: unknown;
      exit?: unknown;
      transition?: unknown;
      layout?: unknown;
      onAnimationComplete?: () => void;
    }
  >(function MotionElement(
    {
      initial: _initial,
      animate: _animate,
      exit: _exit,
      transition: _transition,
      layout: _layout,
      onAnimationComplete,
      ...props
    },
    ref,
  ) {
    return React.createElement("div", {
      ...props,
      ref,
      onContextMenu: onAnimationComplete,
    });
  });
  return {
    motion: {
      div: MotionElement,
      img: MotionElement,
      main: MotionElement,
    },
    useReducedMotion: () => reducedMotionPreference.value,
  };
});

function makeCard(): CardData {
  return {
    id: asCardId("00000000-0000-4000-8000-000000000017"),
    name: asCardName("Temporal Fixture"),
    cardNumber: 17,
    cardType: "Character",
    subtype: "Fixture",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "A synthetic observable rule.",
    imageNumber: 17,
    artOwned: true,
  };
}

function view(): ExplorationSiteView {
  const selected = makeCard();
  return {
    siteId: "exploration-site",
    scene: null,
    isEnhanced: true,
    guide: {
      id: "layaway",
      name: '"Layaway"',
      line: "Every card dreams, choom. Draw one, and we'll delve inside.",
      art: artRef.dreamGuide("layaway"),
    },
    card: {
      cardId: selected.id,
      displaySnapshot: selected,
    },
    fullArt: artRef.explorationCard(selected.imageNumber),
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
  reducedMotionPreference.value = true;
  stubMatchMedia();
  globalThis.ResizeObserver = ResizeObserverStub;
  window.requestAnimationFrame = (callback) => {
    callback(0);
    return 1;
  };
  window.cancelAnimationFrame = () => undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("ExplorationSiteScreen", () => {
  it("breaks the selected card's licensed art into a dismissible fullscreen layer", () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const onChannel = vi.fn();
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={onChannel}
        onExit={onExit}
      />,
    );

    const cardSlot = container.querySelector<HTMLElement>(
      "[data-exploration-card-slot]",
    );
    const channel = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-channel"]',
    );
    expect(container.querySelector("h1")?.textContent).toBe(
      "Channel A Possibility",
    );
    expect(cardSlot?.dataset.cardId).toBe(view().card.cardId);
    expect(
      container
        .querySelector('[data-testid="cumulus-exploration-revealed-card"]')
        ?.getAttribute("data-card-id"),
    ).toBe(view().card.cardId);
    expect(channel?.textContent).toContain("Channel");
    expect(channel?.dataset.glassVariant).toBe("accent");
    expect(channel?.dataset.glassPlacement).toBe("onGlass");

    act(() => channel?.click());
    expect(onChannel).toHaveBeenCalledOnce();
    const frameBreak = container.querySelector<HTMLElement>(
      "[data-exploration-frame-break]",
    );
    expect(frameBreak?.dataset.explorationFrameBreakPhase).toBe("open");
    expect(frameBreak?.dataset.explorationFullArtImageNumber).toBe("17");
    expect(
      frameBreak
        ?.querySelector("[data-exploration-full-art]")
        ?.getAttribute("src"),
    ).toContain("/exploration/17.jpg");
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-exit"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();

    const returnButton = container.querySelector<HTMLButtonElement>(
      'button[aria-label="Return to Exploration"]',
    );
    act(() => returnButton?.click());
    expect(onExit).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-exploration-frame-break]"),
    ).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).not.toBeNull();
    act(() => root.unmount());
  });

  it("collapses the art and returns the card to the deck before leaving", () => {
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        if (this instanceof HTMLImageElement && this.alt !== "") {
          return new DOMRect(780, 150, 480, 291);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);
    const onExit = vi.fn();
    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onExit={onExit}
      />,
    );

    act(() => {
      container
        .querySelector("[data-exploration-card-travel]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-exploration-channel"]',
        )
        ?.click(),
    );
    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    const exitButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-exploration-exit"]',
    );
    expect(exitButton?.getAttribute("aria-label")).toBe("Leave Exploration");

    act(() => exitButton?.click());
    expect(onExit).not.toHaveBeenCalled();
    expect(
      container
        .querySelector("[data-exploration-frame-break]")
        ?.getAttribute("data-exploration-frame-break-phase"),
    ).toBe("collapsing");

    act(() => {
      container
        .querySelector("[data-exploration-frame-break]")
        ?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true }));
    });
    expect(
      container.querySelector("[data-exploration-frame-break]"),
    ).toBeNull();
    const cardReturn = container.querySelector(
      "[data-exploration-card-return]",
    );
    expect(cardReturn?.getAttribute("data-exploration-destination")).toBe(
      "journey-deck",
    );
    expect(
      cardReturn?.querySelector('[data-card-back=""]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-exploration-channel"]'),
    ).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    act(() => {
      cardReturn?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true }),
      );
    });
    expect(onExit).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("stages a face-down-to-face-up travel from the bottom-right deck anchor", () => {
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-exploration-card-slot")) {
          return new DOMRect(900, 180, 240, 336);
        }
        return new DOMRect(0, 0, 100, 100);
      },
    );
    const deckTarget = document.createElement("button");
    deckTarget.dataset.journeyDeckTarget = "";
    deckTarget.getBoundingClientRect = () => new DOMRect(1210, 720, 50, 70);
    document.body.append(deckTarget);

    const { container, root } = mount(
      <ExplorationSiteScreen
        view={view()}
        onChannel={vi.fn()}
        onExit={vi.fn()}
      />,
    );

    const travel = container.querySelector("[data-exploration-card-travel]");
    expect(travel?.getAttribute("data-exploration-source")).toBe(
      "journey-deck",
    );
    expect(travel?.querySelector("[data-card-back]")).not.toBeNull();
    expect(
      travel?.querySelector(`[data-card-id="${view().card.cardId}"]`),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-exploration-channel-state]")
        ?.getAttribute("data-exploration-channel-state"),
    ).toBe("waiting");

    act(() => root.unmount());
  });
});
