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

function stubMatchMedia(reducedMotion: boolean, desktop = true): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion")
      ? reducedMotion
      : desktop,
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

  it("opens on the base card, toggles forms, and only enables commit while an affordable form is selected", () => {
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
    const visibleCommitContent = (): string | undefined =>
      commit?.querySelector<HTMLElement>("[data-glass-button-content]")
        ?.textContent ?? undefined;
    expect(commit?.dataset.glassVariant).toBe("accent");
    expect(visibleCommitContent()).toBe("Transfigure");
    expect(visibleCommitContent()).not.toContain("Card");
    expect(commit?.getAttribute("aria-disabled")).toBe("true");
    expect(commit?.style.opacity).toBe("0.5");
    expect(
      commit?.querySelectorAll("[data-glass-button-width-reservation]"),
    ).toHaveLength(5);
    expect(commit?.textContent).toContain("Reforging…·80");
    expect(container.querySelector('[role="radio"][aria-checked="true"]')).toBeNull();

    const empowered = container.querySelector<HTMLButtonElement>(
      '[data-testid="tango-transfiguration-form-Empowered"]',
    );
    expect(empowered?.style.background).toBe("transparent");
    expect(empowered?.style.boxShadow).toBe("none");
    act(() => empowered?.click());
    expect(empowered?.getAttribute("aria-checked")).toBe("true");
    expect(commit?.getAttribute("aria-disabled")).toBeNull();
    expect(commit?.style.opacity).toBe("1");
    expect(visibleCommitContent()).toBe("Transfigure·40");
    act(() => commit?.click());
    expect(onTransfigure).toHaveBeenCalledWith(
      "entry-1",
      "Empowered",
      "Reduce this card's energy cost.",
      { fixture: true },
      40,
    );

    act(() => empowered?.click());
    expect(empowered?.getAttribute("aria-checked")).toBe("false");
    expect(commit?.getAttribute("aria-disabled")).toBe("true");

    act(() => root.unmount());
  });

  it("collapses the two unchosen cards and creates a traveling selected card", () => {
    stubMatchMedia(false);
    const animate = vi.fn(() => ({}) as Animation);
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    const { container, root } = mount(
      <TransfigurationSiteScreen
        view={view()}
        onClose={vi.fn()}
        onTransfigure={vi.fn()}
      />,
    );

    const source = container.querySelector<HTMLElement>(
      '[data-testid="tango-transfiguration-card-entry-2"]',
    );
    source?.setAttribute("data-reveal-active", "true");
    const target = container.querySelector<HTMLElement>(
      "[data-transfiguration-detail-card-target]",
    );
    if (target === null) throw new Error("Missing detail target");
    target.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 100, y: 120, width: 180, height: 260 });
    const revealCard = document.createElement("div");
    revealCard.dataset.tangoRevealCard = "primary";
    revealCard.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 420, y: 80, width: 340, height: 500 });
    document.body.append(revealCard);
    act(() => source?.click());

    expect(animate).toHaveBeenCalledTimes(2);
    const traveling = container.querySelector<HTMLElement>(
      '[data-testid="tango-transfiguration-card-travel"]',
    );
    expect(traveling).not.toBeNull();
    expect(traveling?.style.left).toBe("420px");
    expect(traveling?.style.top).toBe("80px");
    expect(revealCard.style.visibility).toBe("hidden");
    expect(
      container.querySelector<HTMLElement>(
        '[data-gallery-entry-id="entry-2"]',
      )?.style.visibility,
    ).toBe("hidden");

    act(() => root.unmount());
  });

  it("reserves breathing room around the scrolling option list so hover feedback is not clipped", () => {
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
          '[data-testid="tango-transfiguration-card-entry-1"]',
        )
        ?.click();
    });

    const options = container.querySelector<HTMLElement>(
      "[data-transfiguration-options]",
    );
    expect(options?.style.padding).toBe("var(--space-2)");
    expect(options?.style.overflowY).toBe("auto");

    act(() => root.unmount());
  });

  it("uses the compact mobile gallery and a card-first icon detail surface", () => {
    stubMatchMedia(true, false);
    const { container, root } = mount(
      <TransfigurationSiteScreen
        view={view()}
        onClose={vi.fn()}
        onTransfigure={vi.fn()}
      />,
    );

    const picker = container.querySelector<HTMLElement>(
      '[data-testid="tango-transfiguration-picker"]',
    );
    expect(
      container.querySelector("[data-guide-gallery-desktop-composition]"),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-guide-gallery-mobile-composition="revelation"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLImageElement>(
        '[data-testid="tango-transfiguration-guide-art"]',
      )?.style.width,
    ).toBe("62vw");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-workspace]")
        ?.dataset.transfigurationLayout,
    ).toBe("mobile");
    expect(picker?.dataset.galleryColumns).toBe("3");
    expect(picker?.dataset.gallerySpacing).toBe("medium");
    expect(picker?.dataset.galleryWidthMode).toBe("fill");
    expect(
      container.querySelector('[data-testid="tango-transfiguration-decline"]')
        ?.textContent,
    ).toBe("Decline");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="tango-transfiguration-card-entry-1"]',
        )
        ?.click();
    });

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="tango-transfiguration-detail"]',
      )?.dataset.transfigurationDetailLayout,
    ).toBe("mobile");
    expect(
      container.querySelector("[data-transfiguration-detail-card-target]"),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.dataset.transfigurationOptionLayout,
    ).toBe("compact");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-detail-body]",
      )?.dataset.transfigurationDetailBodyLayout,
    ).toBe("side-by-side");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-detail-body]",
      )?.style.padding,
    ).toBe("var(--space-6) var(--space-4)");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-detail-body]",
      )?.style.containerType,
    ).toBe("size");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-detail-body]",
      )?.style.gridTemplateRows,
    ).toBe("minmax(0, 1fr)");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-detail-body]",
      )?.style.gridTemplateColumns,
    ).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.style.flexDirection,
    ).toBe("column");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.style.alignItems,
    ).toBe("center");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-panel-viewport]",
      )?.style.overflow,
    ).toBe("hidden");
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="tango-transfiguration-form-Empowered"]',
      )?.textContent,
    ).toBe("Empowered");
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="tango-transfiguration-form-Empowered"]',
      )?.getAttribute("aria-label"),
    ).toBe("Empowered, 40 essence");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="tango-transfiguration-form-Empowered"]',
      )?.dataset.revealPrimaryVariant,
    ).toBe("text");
    expect(container.textContent).toContain("Reduce this card's energy cost.");
    expect(
      container.querySelector('[data-testid="tango-transfiguration-back"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="tango-transfiguration-choose-again"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-actions]")
        ?.style.justifyContent,
    ).toBe("center");

    act(() => root.unmount());
  });

  it("grows the mobile panel upward for a dense form offer", () => {
    stubMatchMedia(true, false);
    const denseView = view();
    const first = denseView.candidates[0];
    if (first === undefined) throw new Error("Missing candidate fixture");
    const inspired = {
      ...first.forms[0],
      type: "Inspired" as const,
      accent: TRANSFIGURATION_COLORS.Inspired,
    };
    const enduring = {
      ...first.forms[0],
      type: "Enduring" as const,
      accent: TRANSFIGURATION_COLORS.Enduring,
    };
    const { container, root } = mount(
      <TransfigurationSiteScreen
        view={{
          ...denseView,
          candidates: [
            { ...first, forms: [...first.forms, inspired, enduring] },
            ...denseView.candidates.slice(1),
          ],
        }}
        onClose={vi.fn()}
        onTransfigure={vi.fn()}
      />,
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="tango-transfiguration-card-entry-1"]',
        )
        ?.click();
    });

    expect(
      container.querySelector<HTMLElement>(
        "[data-guide-gallery-mobile-region]",
      )?.dataset.guideGalleryMobileRegionSize,
    ).toBe("expanded");
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(4);

    act(() => root.unmount());
  });
});
