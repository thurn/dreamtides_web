// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import {
  TRANSFIGURATION_COLORS,
  TRANSFIGURATION_TINT_COLORS,
} from "../../runtime/transfiguration-display";
import { artRef } from "../primitives/art";
import { TangoRoot } from "../TangoRoot";
import {
  TransfigurationSiteScreen,
  type TransfigurationCandidateView,
  type TransfigurationSiteView,
} from "./TransfigurationSiteScreen";

function makeCard(index: number): CardData {
  return {
    name: asCardName(`Forge Fixture ${String(index)}`),
    id: asCardId(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "Materialized: Gain 1 essence.",
    imageNumber: index,
    artOwned: true,
  };
}

function candidate(index: number): TransfigurationCandidateView {
  const card = makeCard(index);
  return {
    entryId: `entry-${String(index)}`,
    model: { cardId: card.id, displaySnapshot: card },
    forms: [
      {
        type: "Empowered",
        description: "Reduce this card's energy cost.",
        effectDetails: { fixture: true },
        essenceCost: 40,
        affordable: true,
        accent: TRANSFIGURATION_COLORS.Empowered,
        previewModel: {
          cardId: card.id,
          displaySnapshot: { ...card, energyCost: 1 },
          transfiguration: {
            type: "Empowered",
            color: TRANSFIGURATION_TINT_COLORS.Empowered,
            markedText: card.renderedText,
            energyChanged: true,
            sparkChanged: false,
            fastChanged: false,
          },
        },
      },
      {
        type: "Kindled",
        description: "Double this character's spark.",
        effectDetails: { fixture: true },
        essenceCost: 80,
        affordable: false,
        accent: TRANSFIGURATION_COLORS.Kindled,
        previewModel: {
          cardId: card.id,
          displaySnapshot: { ...card, spark: 4 },
          transfiguration: {
            type: "Kindled",
            color: TRANSFIGURATION_TINT_COLORS.Kindled,
            markedText: card.renderedText,
            energyChanged: false,
            sparkChanged: true,
            fastChanged: false,
          },
        },
      },
    ],
  };
}

function view(): TransfigurationSiteView {
  return {
    siteId: "transfiguration-site",
    scene: null,
    guide: {
      id: "durgan_forgehammer",
      name: "Durgan Forgehammer",
      line: "Any card, any temper you like.",
      art: artRef.dreamGuide("durgan_forgehammer"),
    },
    ready: true,
    alreadyAccepted: false,
    candidates: [candidate(1), candidate(2), candidate(3)],
  };
}

function stubMatchMedia(reducedMotion: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? reducedMotion : true,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
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
  act(() => root.render(<TangoRoot>{element}</TangoRoot>));
  return { container, root };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  stubMatchMedia(true);
  globalThis.ResizeObserver = ResizeObserverStub;
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TransfigurationSiteScreen", () => {
  it("shows exactly three standard candidates inside the shared desktop glass gallery", () => {
    const { container, root } = mount(
      <TransfigurationSiteScreen
        view={view()}
        onClose={vi.fn()}
        onTransfigure={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-guide-gallery-desktop-composition]"))
      .not.toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Transfiguration");
    expect(
      container.querySelectorAll('[data-testid^="tango-transfiguration-card-"]'),
    ).toHaveLength(3);
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="tango-transfiguration-picker"]',
      )?.dataset.galleryColumns,
    ).toBe("3");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="tango-transfiguration-picker"]',
      )?.dataset.gallerySpacing,
    ).toBe("spacious");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="tango-transfiguration-picker"]',
      )?.dataset.galleryWidthMode,
    ).toBe("content");
    expect(
      container.querySelector('[data-testid="tango-transfiguration-decline"]')
        ?.textContent,
    ).toBe("Decline Offer");
    expect(
      container.querySelector('[data-testid="tango-transfiguration-leave"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("Essence 500");

    act(() => root.unmount());
  });

  it("opens the detail panel with title-bar Back, left card, right options, and one commit action", () => {
    const onTransfigure = vi.fn();
    const { container, root } = mount(
      <TransfigurationSiteScreen
        view={view()}
        onClose={vi.fn()}
        onTransfigure={onTransfigure}
      />,
    );

    const pickerTitleFont = container.querySelector("h2")?.style.font;
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="tango-transfiguration-card-entry-1"]',
        )
        ?.click();
    });

    expect(
      container.querySelector('[data-testid="tango-transfiguration-detail"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-testid="tango-transfiguration-choose-again"]',
      ),
    ).not.toBeNull();
    const actions = container.querySelector<HTMLElement>(
      "[data-transfiguration-actions]",
    );
    expect(actions?.style.justifyContent).toBe("flex-end");
    expect(actions?.style.gap).toBe("var(--space-4)");
    expect(
      container.querySelector('[data-testid="tango-transfiguration-back"]'),
    ).toBeNull();
    expect(container.querySelector("h2")?.style.font).toBe(pickerTitleFont);
    expect(container.textContent).not.toContain("TRANSFIGURATION");
    expect(
      container.querySelector("[data-transfiguration-detail-card-target]"),
    ).not.toBeNull();
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.style.overflowY,
    ).toBe("auto");
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="tango-transfiguration-form-Kindled"]',
      )?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(container.textContent).not.toContain("How much essence");

    const commit = container.querySelector<HTMLButtonElement>(
      '[data-testid="tango-transfiguration-confirm"]',
    );
    expect(commit?.textContent).toContain("Transfigure ·");
    expect(commit?.textContent).not.toContain("Card");
    act(() => commit?.click());
    expect(onTransfigure).toHaveBeenCalledWith(
      "entry-1",
      "Empowered",
      "Reduce this card's energy cost.",
      { fixture: true },
      40,
    );

    act(() => root.unmount());
  });

  it("collapses the two unchosen cards and creates a traveling selected card", () => {
    stubMatchMedia(false);
    const animate = vi.fn(() => ({}) as Animation);
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 100,
      top: 120,
      right: 280,
      bottom: 380,
      width: 180,
      height: 260,
      toJSON: () => ({}),
    });
    const { container, root } = mount(
      <TransfigurationSiteScreen
        view={view()}
        onClose={vi.fn()}
        onTransfigure={vi.fn()}
      />,
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="tango-transfiguration-card-entry-2"]',
        )
        ?.click();
    });

    expect(animate).toHaveBeenCalledTimes(2);
    expect(
      container.querySelector(
        '[data-testid="tango-transfiguration-card-travel"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>(
        '[data-gallery-entry-id="entry-2"]',
      )?.style.visibility,
    ).toBe("hidden");

    act(() => root.unmount());
  });
});
