// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { artRef } from "../primitives/art";
import {
  TransfigurationSiteScreen,
  type TransfigurationCandidateView,
  type TransfigurationSiteView,
} from "./TransfigurationSiteScreen";
import {
  DuplicationSiteScreen,
  type DuplicationSiteView,
} from "./DuplicationSiteScreen";
import {
  transfigurationPresentationFixture,
  transfigurationFormFixture,
} from "../test-helpers/transfiguration-fixture";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import { testCardId, testGuideArtKey, testGuideId } from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";

function stubMatchMedia(matches: (query: string) => boolean): void {
  window.matchMedia = (query: string) => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
}

function makeCard(index: number): CardData {
  return {
    name: parseCardName(`Fixture ${String(index)}`),
    id: testCardId(
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ),
    cardNumber: index,
    cardType: "Character",
    subtype: "",
    isStarter: false,
    energyCost: 2,
    spark: 2,
    isFast: false,
    renderedText: "Fixture text.",
    imageNumber: index,
    artOwned: true,
  };
}

function guide(seed: string) {
  return {
    id: testGuideId(seed),
    name: "Fixture Guide",
    line: "Fixture line.",
    art: artRef.dreamGuide(testGuideArtKey(seed)),
    headTargetX: 0.6,
  };
}

function q(container: ParentNode, marker: string): HTMLElement | null {
  return container.querySelector<HTMLElement>(`[data-testid="${marker}"]`);
}

function click(element: HTMLElement | null): void {
  act(() => element?.click());
}

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("TransfigurationSiteScreen", () => {
  function candidate(index: number): TransfigurationCandidateView {
    const card = makeCard(index);
    const form = (
      type: "Empowered" | "Kindled",
      amount: number,
      affordable: boolean,
    ) => ({
      type,
      presentation: transfigurationPresentationFixture(type),
      effectDetails: { fixture: true },
      pricing: { kind: "essence" as const, amount, affordable },
      previewModel: {
        cardId: card.id,
        displaySnapshot: card,
        transfiguration: {
          type,
          form: transfigurationFormFixture(type),
          markedText: card.renderedText,
          energyChanged: type === "Empowered",
          energyChangeName: type === "Empowered" ? "Fixture energy" : null,
          sparkChanged: type === "Kindled",
          sparkChangeName: type === "Kindled" ? "Fixture spark" : null,
          fastChanged: false,
        },
      },
    });
    return {
      entryId: parseDeckEntryId(`entry-${String(index)}`),
      model: { cardId: card.id, displaySnapshot: card },
      availability: "available",
      reforgedType: null,
      forms: [form("Empowered", 40, true), form("Kindled", 80, false)],
    };
  }

  function view(): TransfigurationSiteView {
    return {
      siteId: parseSiteId("transfiguration-site"),
      scene: null,
      guide: guide("fixture-transfiguration-guide"),
      ready: true,
      isEnhanced: false,
      candidates: [candidate(1), candidate(2), candidate(3)],
    };
  }

  function enhancedView(): TransfigurationSiteView {
    const reforged = makeCard(5);
    return {
      ...view(),
      isEnhanced: true,
      candidates: [
        candidate(1),
        candidate(2),
        candidate(3),
        candidate(4),
        {
          entryId: parseDeckEntryId("entry-5"),
          model: { cardId: reforged.id, displaySnapshot: reforged },
          availability: "reforged",
          reforgedType: "Kindled",
          forms: [],
        },
        candidate(6),
      ],
    };
  }

  function mount(
    siteView: TransfigurationSiteView,
    props: Partial<Parameters<typeof TransfigurationSiteScreen>[0]> = {},
  ): HTMLDivElement {
    return renderInCumulus(
      <TransfigurationSiteScreen
        view={siteView}
        onClose={vi.fn()}
        onTransfigure={vi.fn()}
        {...props}
      />,
    ).container;
  }

  const picker = (container: HTMLElement): DOMStringMap | undefined =>
    q(container, "cumulus-transfiguration-picker")?.dataset;
  const composition = (container: HTMLElement): string | undefined =>
    container.querySelector<HTMLElement>("[data-site-layout]")?.dataset
      .siteLayoutComposition;
  const desktop = (query: string): boolean => !query.includes("max-width");
  const mobile = (query: string): boolean =>
    query.includes("prefers-reduced-motion") || query.includes("max-width");
  const stubAnimate = () => {
    const animate = vi.fn(() => ({}) as Animation);
    Object.defineProperty(HTMLElement.prototype, "animate", {
      configurable: true,
      value: animate,
    });
    return animate;
  };

  beforeEach(() => stubMatchMedia(desktop));

  it("shows three reading-width candidates in the desktop picker gallery", () => {
    const container = mount(view());

    expect(
      container.querySelector('[data-site-layout-viewport="desktop"]'),
    ).not.toBeNull();
    expect(
      container.querySelectorAll(
        '[data-testid^="cumulus-transfiguration-card-"]',
      ),
    ).toHaveLength(3);
    expect(picker(container)?.galleryColumns).toBe("3");
    expect(picker(container)?.galleryCardSize).toBe("reading");
    expect(picker(container)?.galleryRole).toBe("picker");
    expect(composition(container)).toBe("content-led-revelation");
    expect(q(container, "cumulus-transfiguration-decline")).not.toBeNull();
  });

  it("shows the enhanced whole-deck picker with reforged cards unavailable, and declines", () => {
    const onClose = vi.fn();
    const container = mount(enhancedView(), { onClose });

    expect(picker(container)?.galleryColumns).toBe("5");
    expect(
      container.querySelectorAll(
        '[data-testid^="cumulus-transfiguration-card-"]',
      ),
    ).toHaveLength(6);
    expect(
      q(container, "cumulus-transfiguration-card-entry-5")?.getAttribute(
        "aria-disabled",
      ),
    ).toBe("true");

    click(q(container, "cumulus-transfiguration-decline"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses four columns for the enhanced whole-deck picker on mobile", () => {
    stubMatchMedia(mobile);
    expect(picker(mount(enhancedView()))?.galleryColumns).toBe("4");
  });

  it("toggles forms and only enables commit while an affordable form is selected", () => {
    const onTransfigure = vi.fn();
    const container = mount(view(), { onTransfigure });

    click(q(container, "cumulus-transfiguration-card-entry-1"));

    expect(q(container, "cumulus-transfiguration-detail")).not.toBeNull();
    expect(q(container, "cumulus-transfiguration-choose-again")).not.toBeNull();
    expect(
      container.querySelector("[data-transfiguration-detail-card-target]"),
    ).not.toBeNull();
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(2);
    expect(
      q(container, "cumulus-transfiguration-form-Kindled")?.getAttribute(
        "aria-disabled",
      ),
    ).toBe("true");

    const commit = q(container, "cumulus-transfiguration-confirm");
    expect(commit?.getAttribute("aria-disabled")).toBe("true");
    expect(
      container.querySelector('[role="radio"][aria-checked="true"]'),
    ).toBeNull();

    const empowered = q(container, "cumulus-transfiguration-form-Empowered");
    click(empowered);
    expect(empowered?.getAttribute("aria-checked")).toBe("true");
    expect(commit?.getAttribute("aria-disabled")).toBeNull();
    click(commit);
    const [entryId, formType, description, details, cost] = (onTransfigure.mock
      .calls[0] ?? []) as unknown[];
    expect(entryId).toBe("entry-1");
    expect(formType).toBe("Empowered");
    expect(typeof description).toBe("string");
    expect(details).toEqual({ fixture: true });
    expect(cost).toBe(40);

    click(empowered);
    expect(empowered?.getAttribute("aria-checked")).toBe("true");
    expect(commit?.getAttribute("aria-disabled")).toBe("true");
  });

  it("collapses the two unchosen cards and travels the chosen card from its reveal position", () => {
    stubMatchMedia(
      (query) => desktop(query) && !query.includes("prefers-reduced-motion"),
    );
    const animate = stubAnimate();
    const container = mount(view());

    const source = q(container, "cumulus-transfiguration-card-entry-2");
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
    click(source);

    expect(animate).toHaveBeenCalledTimes(2);
    const traveling = q(container, "cumulus-transfiguration-card-travel");
    expect(traveling?.style.left).toBe("420px");
    expect(traveling?.style.top).toBe("80px");
    expect(revealCard.style.visibility).toBe("hidden");
    expect(
      container.querySelector<HTMLElement>('[data-gallery-entry-id="entry-2"]')
        ?.style.visibility,
    ).toBe("hidden");
  });

  it("uses the compact mobile gallery and icon form buttons without travel animation", () => {
    stubMatchMedia(mobile);
    const animate = stubAnimate();
    const container = mount(view());

    expect(
      container.querySelector('[data-site-layout-viewport="narrow"]'),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-workspace]")
        ?.dataset.transfigurationLayout,
    ).toBe("mobile");
    expect(picker(container)?.galleryColumns).toBe("3");
    expect(picker(container)?.gallerySpacing).toBe("compact");

    click(q(container, "cumulus-transfiguration-card-entry-1"));

    expect(
      q(container, "cumulus-transfiguration-detail")?.dataset
        .transfigurationDetailLayout,
    ).toBe("mobile");
    expect(
      container.querySelector<HTMLElement>("[data-transfiguration-options]")
        ?.dataset.transfigurationOptionLayout,
    ).toBe("compact");
    expect(q(container, "cumulus-transfiguration-card-travel")).toBeNull();
    expect(animate).not.toHaveBeenCalled();
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(2);
    const empowered = q(container, "cumulus-transfiguration-form-Empowered");
    expect(empowered?.dataset.transfigurationButtonLayout).toBe("compact");
    expect(empowered?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(q(container, "cumulus-transfiguration-choose-again")).not.toBeNull();
  });

  it("reserves the expanded mobile region for a dense form offer", () => {
    stubMatchMedia(mobile);
    const denseView = view();
    const first = denseView.candidates[0];
    const base = first?.forms[0];
    if (first === undefined || base === undefined) {
      throw new Error("Missing candidate fixture");
    }
    const container = mount({
      ...denseView,
      candidates: [
        {
          ...first,
          forms: [
            ...first.forms,
            { ...base, type: "Inspired" },
            { ...base, type: "Enduring" },
            { ...base, type: "Amplified" },
          ],
        },
        ...denseView.candidates.slice(1),
      ],
    });

    expect(composition(container)).toContain("expanded-revelation");
    click(q(container, "cumulus-transfiguration-card-entry-1"));
    expect(composition(container)).toContain("expanded-revelation");
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(5);
  });
});

describe("DuplicationSiteScreen", () => {
  function view(cardCount = 3, isEnhanced = false): DuplicationSiteView {
    return {
      siteId: parseSiteId("duplication-site"),
      scene: null,
      guide: guide("fixture-duplication-guide"),
      ready: true,
      alreadyAccepted: false,
      isEnhanced,
      cards: Array.from({ length: cardCount }, (_, offset) => {
        const card = makeCard(offset + 1);
        return {
          entryId: parseDeckEntryId(`entry-${String(offset + 1)}`),
          model: { cardId: card.id, displaySnapshot: card },
        };
      }),
    };
  }

  function mount(
    siteView: DuplicationSiteView,
    onDuplicate = vi.fn(),
  ): HTMLDivElement {
    return renderInCumulus(
      <DuplicationSiteScreen
        view={siteView}
        onClose={vi.fn()}
        onDuplicate={onDuplicate}
      />,
    ).container;
  }

  beforeEach(() =>
    stubMatchMedia(
      (query) =>
        !query.includes("prefers-reduced-motion") &&
        !query.includes("max-width"),
    ),
  );

  it("selects in the gallery without resizing it, then confirms the duplicate", () => {
    const onDuplicate = vi.fn();
    const container = mount(view(), onDuplicate);

    expect(
      container.querySelectorAll(
        '[data-testid^="cumulus-duplication-card-entry-"]',
      ),
    ).toHaveLength(3);
    const gallery = q(container, "cumulus-duplication-card-gallery");
    expect(gallery?.dataset.galleryRole).toBe("picker");
    expect(gallery?.dataset.galleryColumns).toBe("3");
    expect(gallery?.dataset.galleryReservesStackedCopy).toBe("true");
    expect(
      container.querySelector<HTMLElement>("[data-site-layout]")?.dataset
        .siteLayoutComposition,
    ).toBe("content-led-gallery");
    const initialPanelWidth = gallery?.style.width;

    const confirm = q(container, "cumulus-duplication-confirm");
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");

    click(q(container, "cumulus-duplication-card-entry-1"));
    expect(gallery?.style.width).toBe(initialPanelWidth);
    expect(confirm?.getAttribute("aria-disabled")).toBeNull();
    expect(
      container.querySelector("[data-gallery-stacked-copy]"),
    ).not.toBeNull();

    click(confirm);
    expect(onDuplicate).toHaveBeenCalledWith("entry-1");
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");
  });

  it("toggles a selected card off without committing", () => {
    const onDuplicate = vi.fn();
    const container = mount(view(), onDuplicate);
    const first = q(container, "cumulus-duplication-card-entry-1");
    const confirm = q(container, "cumulus-duplication-confirm");

    click(first);
    click(first);
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");
    click(confirm);
    expect(onDuplicate).not.toHaveBeenCalled();
  });

  it("fits the enhanced whole-deck offer into the mobile gallery", () => {
    stubMatchMedia(() => false);
    const container = mount(view(9, true));

    expect(
      q(container, "cumulus-duplication-card-gallery")?.dataset.galleryColumns,
    ).toBe("4");
    expect(
      container.querySelector<HTMLElement>("[data-duplication-card-grid]")
        ?.dataset.duplicationLayout,
    ).toBe("mobile");
  });
});
