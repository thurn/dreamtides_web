// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { TRANSFIGURATION_TINT_COLORS } from "../../runtime/transfiguration-display";
import { artRef } from "../primitives/art";
import { CumulusRoot } from "../CumulusRoot";
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
    availability: "available",
    reforgedType: null,
    forms: [
      {
        type: "Empowered",
        description: "Reduce this card's energy cost.",
        effectDetails: { fixture: true },
        essenceCost: 40,
        affordable: true,
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
    isEnhanced: false,
    alreadyAccepted: false,
    candidates: [candidate(1), candidate(2), candidate(3)],
  };
}

function enhancedView(): TransfigurationSiteView {
  const reforgedCard = makeCard(5);
  return {
    ...view(),
    isEnhanced: true,
    candidates: [
      candidate(1),
      candidate(2),
      candidate(3),
      candidate(4),
      {
        entryId: "entry-5",
        model: {
          cardId: reforgedCard.id,
          displaySnapshot: reforgedCard,
          transfiguration: {
            type: "Kindled",
            color: TRANSFIGURATION_TINT_COLORS.Kindled,
            markedText: reforgedCard.renderedText,
            energyChanged: false,
            sparkChanged: true,
            fastChanged: false,
          },
        },
        availability: "reforged",
        reforgedType: "Kindled",
        forms: [],
      },
      candidate(6),
    ],
  };
}

function stubMatchMedia(
  reducedMotion: boolean,
  desktop = true,
  compactShowcase = false,
): void {
  window.matchMedia = (query: string) => ({
    matches: query.includes("prefers-reduced-motion")
      ? reducedMotion
      : query.includes("max-width")
        ? compactShowcase
        : desktop,
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

    expect(
      container.querySelector("[data-guide-gallery-desktop-composition]"),
    ).not.toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Transfiguration");
    expect(
      container.querySelectorAll(
        '[data-testid^="cumulus-transfiguration-card-"]',
      ),
    ).toHaveLength(3);
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-picker"]',
      )?.dataset.galleryColumns,
    ).toBe("3");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-picker"]',
      )?.dataset.gallerySpacing,
    ).toBe("medium");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-picker"]',
      )?.dataset.galleryCardSize,
    ).toBe("showcase");
    expect(
      container.querySelector<HTMLElement>(
        "[data-guide-gallery-desktop-layout]",
      )?.dataset.guideGalleryDesktopLayoutMode,
    ).toBe("showcase");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-picker"]',
      )?.dataset.galleryWidthMode,
    ).toBe("content");
    expect(
      container.querySelector('[data-testid="cumulus-transfiguration-decline"]')
        ?.textContent,
    ).toBe("Decline Offer");
    expect(
      container.querySelector('[data-testid="cumulus-transfiguration-leave"]'),
    ).toBeNull();
    expect(container.textContent).not.toContain("Essence 500");

    act(() => root.unmount());
  });

  it("shows the enhanced whole-deck picker in the shared purge-gallery geometry", () => {
    const onClose = vi.fn();
    const { container, root } = mount(
      <TransfigurationSiteScreen
        view={enhancedView()}
        onClose={onClose}
        onTransfigure={vi.fn()}
      />,
    );

    const picker = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-transfiguration-picker"]',
    );
    expect(picker?.dataset.galleryColumns).toBe("5");
    expect(picker?.dataset.gallerySpacing).toBe("regular");
    expect(picker?.dataset.galleryWidthMode).toBe("fill");
    expect(container.textContent).toContain("Pick any card to reforge");
    expect(
      container.querySelectorAll(
        '[data-testid^="cumulus-transfiguration-card-"]',
      ),
    ).toHaveLength(6);
    expect(
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-card-entry-5"]',
        )
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(container.textContent).toContain("Kindled · Reforged");
    expect(
      container.querySelector('[data-testid="cumulus-transfiguration-decline"]')
        ?.textContent,
    ).toBe("Decline");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-decline"]',
        )
        ?.click();
    });
    expect(onClose).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("uses four columns for the enhanced whole-deck picker on mobile", () => {
    stubMatchMedia(true, false);
    const { container, root } = mount(
      <TransfigurationSiteScreen
        view={enhancedView()}
        onClose={vi.fn()}
        onTransfigure={vi.fn()}
      />,
    );

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-picker"]',
      )?.dataset.galleryColumns,
    ).toBe("4");

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
          '[data-testid="cumulus-transfiguration-card-entry-1"]',
        )
        ?.click();
    });

    expect(
      container.querySelector('[data-testid="cumulus-transfiguration-detail"]'),
    ).not.toBeNull();
    const panelViewport = container.querySelector<HTMLElement>(
      "[data-transfiguration-panel-viewport]",
    );
    expect(panelViewport?.style.width).toBe("100%");
    expect(panelViewport?.style.minWidth).toBe("0px");
    expect(panelViewport?.style.maxWidth).toBe("640px");
    expect(panelViewport?.style.justifySelf).toBe("end");
    expect(
      container.querySelector(
        '[data-testid="cumulus-transfiguration-choose-again"]',
      ),
    ).not.toBeNull();
    const actions = container.querySelector<HTMLElement>(
      "[data-transfiguration-actions]",
    );
    expect(actions?.style.justifyContent).toBe("flex-end");
    expect(actions?.style.gap).toBe("var(--space-s)");
    expect(
      container.querySelector('[data-testid="cumulus-transfiguration-back"]'),
    ).toBeNull();
    expect(container.querySelector("h2")?.style.font).toBe(pickerTitleFont);
    expect(container.textContent).not.toContain("TRANSFIGURATION");
    expect(
      container.querySelector("[data-transfiguration-detail-card-target]"),
    ).not.toBeNull();
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(2);
    const detailBody = container.querySelector<HTMLElement>(
      "[data-transfiguration-detail-body]",
    );
    expect(detailBody?.style.gridTemplateColumns).toBe(
      "minmax(220px, 278px) minmax(240px, 288px)",
    );
    expect(detailBody?.style.gap).toBe("var(--space-2xl)");
    expect(detailBody?.style.alignItems).toBe("start");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.style.overflowY,
    ).toBe("auto");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.style.paddingBlockStart,
    ).toBe("0px");
    expect(
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-form-Kindled"]',
        )
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(container.textContent).not.toContain("How much essence");

    const commit = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-transfiguration-confirm"]',
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
    expect(
      container.querySelector('[role="radio"][aria-checked="true"]'),
    ).toBeNull();

    const empowered = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-transfiguration-form-Empowered"]',
    );
    expect(empowered?.textContent).toBe("Empowered40");
    expect(empowered?.dataset.transfigurationButtonVariant).toBe("priced");
    expect(empowered?.getAttribute("aria-description")).toBe(
      "Reduce this card's energy cost.",
    );
    expect(empowered?.style.padding).toBe("var(--space-xs)");
    expect(empowered?.style.background).toBe("transparent");
    expect(empowered?.style.boxShadow).toBe("none");
    act(() => empowered?.click());
    expect(empowered?.getAttribute("aria-checked")).toBe("true");
    expect(commit?.getAttribute("aria-disabled")).toBeNull();
    expect(commit?.style.opacity).toBe("1");
    expect(
      commit?.querySelector("[data-glass-button-essence-cost]"),
    ).not.toBeNull();
    act(() => commit?.click());
    expect(onTransfigure).toHaveBeenCalledWith(
      "entry-1",
      "Empowered",
      "Reduce this card's energy cost.",
      { fixture: true },
      40,
    );

    act(() => empowered?.click());
    expect(empowered?.getAttribute("aria-checked")).toBe("true");
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
      '[data-testid="cumulus-transfiguration-card-entry-2"]',
    );
    source?.setAttribute("data-reveal-active", "true");
    const target = container.querySelector<HTMLElement>(
      "[data-transfiguration-detail-card-target]",
    );
    if (target === null) throw new Error("Missing detail target");
    target.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 100, y: 120, width: 180, height: 260 });
    const revealCard = document.createElement("div");
    revealCard.dataset.cumulusRevealCard = "primary";
    revealCard.getBoundingClientRect = () =>
      DOMRect.fromRect({ x: 420, y: 80, width: 340, height: 500 });
    document.body.append(revealCard);
    act(() => source?.click());

    expect(animate).toHaveBeenCalledTimes(2);
    const traveling = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-transfiguration-card-travel"]',
    );
    expect(traveling).not.toBeNull();
    expect(traveling?.style.left).toBe("420px");
    expect(traveling?.style.top).toBe("80px");
    expect(revealCard.style.visibility).toBe("hidden");
    expect(
      container.querySelector<HTMLElement>('[data-gallery-entry-id="entry-2"]')
        ?.style.visibility,
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
          '[data-testid="cumulus-transfiguration-card-entry-1"]',
        )
        ?.click();
    });

    const options = container.querySelector<HTMLElement>(
      "[data-transfiguration-options]",
    );
    expect(options?.style.padding).toBe("var(--space-xs)");
    expect(options?.style.overflowY).toBe("auto");

    act(() => root.unmount());
  });

  it("uses the compact mobile gallery and a card-first icon detail surface", () => {
    stubMatchMedia(true, false);
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

    const picker = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-transfiguration-picker"]',
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
        '[data-testid="cumulus-transfiguration-guide-art"]',
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
      container.querySelector('[data-testid="cumulus-transfiguration-decline"]')
        ?.textContent,
    ).toBe("Decline");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-card-entry-1"]',
        )
        ?.click();
    });

    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-detail"]',
      )?.dataset.transfigurationDetailLayout,
    ).toBe("mobile");
    expect(
      container.querySelector("[data-transfiguration-detail-card-target]"),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-detail-card-target]",
      )?.style.alignSelf,
    ).toBe("start");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.dataset.transfigurationOptionLayout,
    ).toBe("compact");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-detail-body]")
        ?.dataset.transfigurationDetailBodyLayout,
    ).toBe("side-by-side");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-detail-body]")
        ?.style.padding,
    ).toBe("var(--space-l) var(--space-s)");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-detail-body]")
        ?.style.containerType,
    ).toBe("inline-size");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-detail-body]")
        ?.style.gridTemplateRows,
    ).toBe("auto");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-detail-body]")
        ?.style.gridTemplateColumns,
    ).toBe("minmax(0, 1fr) minmax(0, 1fr)");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.style.flexDirection,
    ).toBe("column");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.style.alignItems,
    ).toBe("stretch");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.style.justifyContent,
    ).toBe("flex-start");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-panel-viewport]",
      )?.style.overflow,
    ).toBe("visible");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-panel-viewport]",
      )?.style.height,
    ).toBe("100%");
    expect(
      container.querySelector(
        '[data-testid="cumulus-transfiguration-card-travel"]',
      ),
    ).toBeNull();
    expect(animate).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="cumulus-transfiguration-form-Empowered"]',
      )?.textContent,
    ).toBe("Empowered");
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="cumulus-transfiguration-form-Empowered"]',
      )?.dataset.transfigurationButtonVariant,
    ).toBe("compact");
    expect(
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-form-Empowered"]',
        )
        ?.getAttribute("aria-label"),
    ).toBe("Empowered, 40 essence");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-form-Empowered"]',
      )?.dataset.revealPrimaryVariant,
    ).toBeUndefined();
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-form-Empowered"]',
      )?.style.width,
    ).toBe("100%");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-form-Empowered"]',
      )?.style.justifyContent,
    ).toBe("center");
    expect(container.textContent).not.toContain(
      "Reduce this card's energy cost.",
    );
    expect(
      container.querySelector('[data-testid="cumulus-transfiguration-back"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-testid="cumulus-transfiguration-choose-again"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-actions]")
        ?.style.justifyContent,
    ).toBe("center");

    act(() => root.unmount());
  });

  it("reserves the expanded mobile region before choosing a dense form offer", () => {
    stubMatchMedia(true, false);
    const denseView = view();
    const first = denseView.candidates[0];
    if (first === undefined) throw new Error("Missing candidate fixture");
    const inspired = {
      ...first.forms[0],
      type: "Inspired" as const,
    };
    const enduring = {
      ...first.forms[0],
      type: "Enduring" as const,
    };
    const amplified = {
      ...first.forms[0],
      type: "Amplified" as const,
    };
    const { container, root } = mount(
      <TransfigurationSiteScreen
        view={{
          ...denseView,
          candidates: [
            {
              ...first,
              forms: [...first.forms, inspired, enduring, amplified],
            },
            ...denseView.candidates.slice(1),
          ],
        }}
        onClose={vi.fn()}
        onTransfigure={vi.fn()}
      />,
    );

    expect(
      container.querySelector<HTMLElement>("[data-guide-gallery-mobile-region]")
        ?.dataset.guideGalleryMobileRegionSize,
    ).toBe("expanded");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-transfiguration-card-entry-1"]',
        )
        ?.click();
    });

    expect(
      container.querySelector<HTMLElement>("[data-guide-gallery-mobile-region]")
        ?.dataset.guideGalleryMobileRegionSize,
    ).toBe("expanded");
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(5);
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-detail"]',
      )?.style.height,
    ).toBe("auto");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-transfiguration-detail"]',
      )?.style.minHeight,
    ).toBe("100%");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.style.height,
    ).toBe("auto");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.style.overflowY,
    ).toBe("visible");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-panel-viewport]",
      )?.style.overflow,
    ).toBe("visible");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-panel-viewport]",
      )?.style.minHeight,
    ).toBe("0px");
    expect(
      container.querySelector<HTMLElement>(
        "[data-transfiguration-panel-viewport]",
      )?.style.alignContent,
    ).toBe("end");

    act(() => root.unmount());
  });
});
