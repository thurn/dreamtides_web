// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import { artRef } from "../primitives/art";
import {
  TemporalForkSiteScreen,
  type TemporalForkSiteView,
} from "./TemporalForkSiteScreen";

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
      onAnimationComplete: _onAnimationComplete,
      ...props
    },
    ref,
  ) {
    return React.createElement("div", { ...props, ref });
  });
  return {
    motion: {
      div: MotionElement,
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

function view(): TemporalForkSiteView {
  const selected = makeCard();
  return {
    siteId: "temporal-fork-site",
    scene: null,
    isEnhanced: true,
    guide: {
      id: "layaway",
      name: '"Layaway"',
      line: "Time is just another currency.",
      art: artRef.dreamGuide("layaway"),
    },
    card: {
      cardId: selected.id,
      displaySnapshot: selected,
    },
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

describe("TemporalForkSiteScreen", () => {
  it("shows the selected UUID-backed card centered above a purple Channel action", () => {
    const onChannel = vi.fn();
    const { container, root } = mount(
      <TemporalForkSiteScreen view={view()} onChannel={onChannel} />,
    );

    const cardSlot = container.querySelector<HTMLElement>(
      "[data-temporal-fork-card-slot]",
    );
    const channel = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-temporal-fork-channel"]',
    );
    expect(container.querySelector("h1")?.textContent).toBe(
      "Channel A Possibility",
    );
    expect(cardSlot?.dataset.cardId).toBe(view().card.cardId);
    expect(
      container
        .querySelector('[data-testid="cumulus-temporal-fork-revealed-card"]')
        ?.getAttribute("data-card-id"),
    ).toBe(view().card.cardId);
    expect(channel?.textContent).toContain("Channel");
    expect(channel?.dataset.glassVariant).toBe("accent");
    expect(channel?.dataset.glassPlacement).toBe("onGlass");

    act(() => channel?.click());
    expect(onChannel).toHaveBeenCalledOnce();
    act(() => root.unmount());
  });

  it("stages a face-down-to-face-up travel from the bottom-right deck anchor", () => {
    reducedMotionPreference.value = false;
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function getBoundingClientRect(this: HTMLElement) {
        if (this.hasAttribute("data-temporal-fork-card-slot")) {
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
      <TemporalForkSiteScreen view={view()} onChannel={vi.fn()} />,
    );

    const travel = container.querySelector(
      "[data-temporal-fork-card-travel]",
    );
    expect(travel?.getAttribute("data-temporal-fork-source")).toBe(
      "journey-deck",
    );
    expect(travel?.querySelector("[data-card-back]")).not.toBeNull();
    expect(
      travel?.querySelector(`[data-card-id="${view().card.cardId}"]`),
    ).not.toBeNull();
    expect(
      container
        .querySelector("[data-temporal-fork-channel-state]")
        ?.getAttribute("data-temporal-fork-channel-state"),
    ).toBe("waiting");

    act(() => root.unmount());
  });
});
