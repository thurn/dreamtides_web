import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { artRef } from "../primitives/art";
import { JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE } from "../components/hud/JourneyStatusBar";
import {
  PurgeSiteScreen,
  purgeActionWidthReservations,
  type PurgeSiteView,
} from "./PurgeSiteScreen";
import { CumulusRoot } from "../CumulusRoot";
import { PURGE_PRESENTATION } from "../test-helpers/presentation-fixtures";
import { parseSiteId } from "../../types/identifiers";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId, testGuideId } from "../../types/test-identities";
import { testPresentationId } from "../../types/test-identities";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: parseCardName("Test Card"),
    id: testCardId("test-card"),
    cardNumber: 1,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: 1,
    artOwned: true,
    ...overrides,
  };
}

function view(cardCount = 2): PurgeSiteView {
  return {
    presentation: PURGE_PRESENTATION,
    siteId: parseSiteId("purge-site"),
    scene: null,
    guide: {
      id: testGuideId("takeshi"),
      name: assertLocalized("Master Takeshi"),
      line: assertLocalized("Cut only what the dream can spare."),
      art: artRef.dreamGuide(testGuideId("takeshi")),
    },
    cards: Array.from({ length: cardCount }, (_, index) => {
      const cardNumber = index + 1;
      const suffix =
        cardNumber === 1 ? "a" : cardNumber === 2 ? "b" : String(cardNumber);
      return {
        entryId: parseDeckEntryId(`entry-${suffix}`),
        model: (() => {
          const displaySnapshot = makeCard({
            name: parseCardName(`Test Card ${String(cardNumber)}`),
            id: testCardId(`card-${suffix}`),
            cardNumber,
          });
          return { cardId: displaySnapshot.id, displaySnapshot };
        })(),
        isBane: false,
        purgeCostKind: "paid",
      };
    }),
    visitCosts: [0, 40, 100],
    maxPaidSelections: 2,
  };
}

function stubMatchMedia(matches = false): void {
  window.matchMedia = (query: string) => ({
    matches,
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
  act(() => {
    root.render(<CumulusRoot>{element}</CumulusRoot>);
  });
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
  document.body.innerHTML = "";
});

describe("PurgeSiteScreen", () => {
  it("derives every reachable action-label footprint from selection limits", () => {
    expect(purgeActionWidthReservations(1, 2, [0, 40, 100])).toEqual([
      { label: { kind: "decline" }, essenceCost: null },
      { label: { kind: "purge", count: 1 }, essenceCost: 100 },
      { label: { kind: "purge", count: 2 }, essenceCost: 100 },
      { label: { kind: "purge", count: 3 }, essenceCost: 100 },
    ]);
  });

  it("starts with a Decline header action, no close disc, and no sprite purge button", () => {
    const { container, root } = mount(
      <PurgeSiteScreen view={view()} onClose={vi.fn()} onPurge={vi.fn()} />,
    );

    expect(
      container.querySelector('[data-testid="cumulus-purge-close"]'),
    ).toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe("Purge Cards");
    expect(container.textContent).toContain(
      "Choose any number of cards to remove from your deck for an essence cost",
    );
    expect(
      container.querySelector('[data-testid="cumulus-purge-header-action"]')
        ?.textContent,
    ).toContain("Decline");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-purge-header-action"]',
      )?.style.borderColor,
    ).toBe("");
    expect(
      container.querySelector('[data-testid="cumulus-purge-commit-bar"]'),
    ).toBeNull();
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("changes the header action after selection and sends the updated total cost", () => {
    const onPurge = vi.fn();
    const { container, root } = mount(
      <PurgeSiteScreen view={view()} onClose={vi.fn()} onPurge={onPurge} />,
    );

    const first = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-purge-card-entry-a"]',
    );
    const second = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-purge-card-entry-b"]',
    );
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    const initialReservations = Array.from(
      container.querySelectorAll("[data-glass-button-width-reservation]"),
      (candidate) => candidate.textContent,
    );

    act(() => {
      first?.click();
    });
    expect(
      container
        .querySelector('[data-testid="cumulus-purge-header-action"]')
        ?.querySelector("[data-glass-button-essence-cost]"),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-purge-header-action"]',
      )?.style.border,
    ).toContain("--danger");
    const selectedAction = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-purge-header-action"]',
    );
    expect(selectedAction?.dataset.glassVariant).toBe("danger");
    expect(selectedAction?.style.background).toContain("var(--danger) 18%");
    expect(selectedAction?.style.background).toContain("--glass-on-glass-fill");
    expect(
      container.querySelector('[data-testid="cumulus-purge-commit-bar"]'),
    ).toBeNull();
    expect(
      Array.from(
        container.querySelectorAll("[data-glass-button-width-reservation]"),
        (candidate) => candidate.textContent,
      ),
    ).toEqual(initialReservations);

    act(() => {
      second?.click();
    });

    const button = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-purge-header-action"]',
    );
    act(() => {
      button?.click();
    });

    expect(onPurge).toHaveBeenCalledWith(["entry-a", "entry-b"], 100);

    act(() => {
      root.unmount();
    });
  });

  it("renders and reports authored first-visit guidance with the essence Boxicon", () => {
    const onTutorialShown = vi.fn();
    const tutorial = {
      id: testPresentationId("run-a:first-visit:purge-site:Purge"),
      model: {
        portrait: artRef.characterPortrait("mira"),
        portraitAlt: assertLocalized("Mira"),
        speakerName: assertLocalized("Mira"),
        text: assertLocalized(
          "You can [yellow]purge[/yellow] cards here for an ◆ essence cost.",
        ),
      },
      delaySeconds: 0,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 600,
    } as const;
    const { container, root } = mount(
      <PurgeSiteScreen
        view={{ ...view(), tutorial }}
        onClose={vi.fn()}
        onPurge={vi.fn()}
        onTutorialShown={onTutorialShown}
      />,
    );

    const dialogue = container.querySelector<HTMLElement>(
      '[data-testid="site-tutorial-dialogue"]',
    );
    expect(dialogue?.textContent).toContain(
      "You can purge cards here for an  essence cost.",
    );
    expect(
      dialogue?.querySelector('[data-tutorial-instruction-highlight="yellow"]')
        ?.textContent,
    ).toBe("purge");
    expect(
      dialogue?.querySelector('[aria-label="essence"] i')?.className,
    ).toContain("bxf bx-crypto");
    expect(onTutorialShown).toHaveBeenCalledWith(tutorial);

    act(() => {
      root.unmount();
    });
  });

  it("renders the mobile card grid on the shared rounded glass panel", () => {
    const { container, root } = mount(
      <PurgeSiteScreen view={view()} onClose={vi.fn()} onPurge={vi.fn()} />,
    );

    const cardRegion = container.querySelector<HTMLElement>(
      "[data-purge-card-grid]",
    );
    const gallery = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-purge-card-gallery"]',
    );
    const surface = gallery?.querySelector<HTMLElement>(
      '[data-glass-panel-frame="floating"]',
    );
    expect(cardRegion?.dataset.purgeLayout).toBe("mobile");
    expect(
      container.querySelector<HTMLElement>("[data-site-layout-stage]")?.style
        .bottom,
    ).toBe(JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE);
    expect(cardRegion?.style.height).toBe("100%");
    expect(cardRegion?.style.width).toBe("calc(100vw - (var(--space-s) * 2))");
    expect(cardRegion?.style.minHeight).toBe("0px");
    expect(surface?.style.background).toContain("var(--glass-fill-popover)");
    expect(surface?.style.borderRadius).toBe("var(--radius-compact)");
    expect(gallery?.dataset.galleryRole).toBe("picker");
    expect(gallery?.dataset.galleryFrame).toBe("floating");
    expect(gallery?.dataset.galleryColumns).toBe("2");
    expect(gallery?.dataset.gallerySpacing).toBe("compact");
    expect(gallery?.querySelector<HTMLElement>("header")?.style.padding).toBe(
      "var(--space-m)",
    );
    const galleryBody = gallery?.querySelector<HTMLElement>(
      "[data-glass-panel-content] > div",
    );
    expect(galleryBody?.style.padding).toBe("var(--space-s)");
    expect(galleryBody?.firstElementChild?.getAttribute("style")).toContain(
      "gap: var(--space-xs)",
    );
    expect(surface?.style.borderLeft).not.toContain("var(--border-soft)");

    act(() => {
      root.unmount();
    });
  });

  it("leaves persistent journey chrome to the router-owned wrapper", () => {
    const { container, root } = mount(
      <PurgeSiteScreen view={view()} onClose={vi.fn()} onPurge={vi.fn()} />,
    );
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("anchors the mobile guide art beyond the shared menu corner inset", () => {
    const { container, root } = mount(
      <PurgeSiteScreen view={view()} onClose={vi.fn()} onPurge={vi.fn()} />,
    );

    const guideArt = container.querySelector<HTMLElement>(
      "[data-site-layout-guide]",
    );
    expect(guideArt?.style.left).toBe("0px");
    expect(guideArt?.style.width).toBe("46vw");

    act(() => {
      root.unmount();
    });
  });

  it("anchors the mobile speech tail beside the guide's head", () => {
    const { container, root } = mount(
      <PurgeSiteScreen view={view()} onClose={vi.fn()} onPurge={vi.fn()} />,
    );

    const speechAnchor = container.querySelector<HTMLElement>(
      "[data-site-layout-speech-anchor]",
    );
    expect(speechAnchor?.style.left).toBe("86%");
    expect(speechAnchor?.style.top).toBe("var(--space-m)");
    expect(speechAnchor?.style.bottom).toBe("");

    act(() => {
      root.unmount();
    });
  });

  it("renders the desktop composition with cards on the shared rounded glass panel", () => {
    stubMatchMedia(true);
    const { container, root } = mount(
      <PurgeSiteScreen view={view()} onClose={vi.fn()} onPurge={vi.fn()} />,
    );

    const desktopComposition = container.querySelector<HTMLElement>(
      '[data-site-layout-viewport="desktop"]',
    );
    expect(desktopComposition).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-site-layout-stage]")?.style
        .bottom,
    ).toContain("var(--space-3xl)");
    const desktopLayout = container.querySelector<HTMLElement>(
      "[data-site-layout-content-region]",
    );
    expect(desktopLayout?.style.minHeight).toBe("0px");
    expect(desktopLayout?.style.display).toBe("grid");
    expect(
      container.querySelector("[data-site-layout-guide] img"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-site-layout-speech-anchor]"),
    ).not.toBeNull();

    const cardRegion = container.querySelector<HTMLElement>(
      "[data-purge-card-grid]",
    );
    const gallery = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-purge-card-gallery"]',
    );
    const surface = gallery?.querySelector<HTMLElement>(
      '[data-glass-panel-frame="floating"]',
    );
    expect(cardRegion?.dataset.purgeLayout).toBe("desktop");
    expect(cardRegion?.style.height).toBe("100%");
    expect(cardRegion?.style.minHeight).toBe("0px");
    expect(cardRegion?.style.display).toBe("grid");
    expect(cardRegion?.style.alignItems).toBe("center");
    expect(surface?.style.background).toContain("var(--glass-fill-popover)");
    expect(surface?.style.borderRadius).toBe("var(--radius-compact)");
    expect(gallery?.dataset.galleryRole).toBe("picker");
    expect(gallery?.dataset.galleryFrame).toBe("floating");
    expect(gallery?.dataset.galleryColumns).toBe("2");
    expect(surface?.style.borderLeft).not.toContain("var(--border-soft)");

    act(() => {
      root.unmount();
    });
  });

  it("keeps the desktop purge card window fixed-height with a 20-card deck", () => {
    stubMatchMedia(true);
    const { container, root } = mount(
      <PurgeSiteScreen view={view(20)} onClose={vi.fn()} onPurge={vi.fn()} />,
    );

    const cardRegion = container.querySelector<HTMLElement>(
      "[data-purge-card-grid]",
    );
    const gallery = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-purge-card-gallery"]',
    );
    const scroll = gallery?.querySelector<HTMLElement>(
      "[data-glass-panel-content] > div",
    );
    expect(cardRegion?.dataset.purgeLayout).toBe("desktop");
    expect(cardRegion?.style.height).toBe("100%");
    expect(gallery?.dataset.galleryVisibleRows).toBe("2.5");
    expect(scroll?.style.overflowY).toBe("auto");
    expect(
      container.querySelectorAll("[data-testid^='cumulus-purge-card-entry-']"),
    ).toHaveLength(20);

    act(() => {
      root.unmount();
    });
  });
});
