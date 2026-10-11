// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { artRef } from "../primitives/art";
import { JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE } from "../components/hud/JourneyStatusBar";
import {
  PurgeSiteScreen,
  purgeActionWidthReservations,
  type PurgeSiteView,
} from "./PurgeSiteScreen";
import { PURGE_PRESENTATION } from "../test-helpers/presentation-fixtures";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import { testPresentationId } from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";
import {
  click,
  guide,
  makeCard,
  q,
  stubMatchMedia,
} from "./essence-sites.fixtures";

beforeEach(() => {
  stubMatchMedia(false);
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("PurgeSiteScreen", () => {
  function view(cardCount = 2): PurgeSiteView {
    return {
      presentation: PURGE_PRESENTATION,
      siteId: parseSiteId("purge-site"),
      scene: null,
      guide: guide("fixture-purge-guide"),
      cards: Array.from({ length: cardCount }, (_, index) => {
        const card = makeCard(index + 1);
        return {
          entryId: parseDeckEntryId(`entry-${String(index + 1)}`),
          model: { cardId: card.id, displaySnapshot: card },
          isBane: false,
          purgeCostKind: "paid",
        };
      }),
      visitCosts: [0, 40, 100],
      maxPaidSelections: 2,
    };
  }

  function mount(
    siteView: PurgeSiteView,
    props: Partial<Parameters<typeof PurgeSiteScreen>[0]> = {},
  ): HTMLDivElement {
    return renderInCumulus(
      <PurgeSiteScreen
        view={siteView}
        onClose={vi.fn()}
        onPurge={vi.fn()}
        {...props}
      />,
    ).container;
  }

  const gallery = (container: HTMLElement): HTMLElement | null =>
    q(container, "cumulus-purge-card-gallery");
  const cardRegion = (container: HTMLElement): HTMLElement | null =>
    container.querySelector("[data-purge-card-grid]");
  const reservations = (container: HTMLElement): (string | null)[] =>
    Array.from(
      container.querySelectorAll("[data-glass-button-width-reservation]"),
      (candidate) => candidate.textContent,
    );

  it("derives every reachable action-label footprint from selection limits", () => {
    expect(purgeActionWidthReservations(1, 2, [0, 40, 100])).toEqual([
      { label: { kind: "decline" }, essenceCost: null },
      { label: { kind: "purge", count: 1 }, essenceCost: 100 },
      { label: { kind: "purge", count: 2 }, essenceCost: 100 },
      { label: { kind: "purge", count: 3 }, essenceCost: 100 },
    ]);
  });

  it("renders the mobile picker above the status bar with only a header action", () => {
    const container = mount(view());

    expect(q(container, "cumulus-purge-close")).toBeNull();
    expect(q(container, "cumulus-purge-header-action")).not.toBeNull();
    expect(q(container, "cumulus-purge-commit-bar")).toBeNull();
    expect(
      container.querySelector("[data-journey-status-bar-anchor]"),
    ).toBeNull();
    expect(cardRegion(container)?.dataset.purgeLayout).toBe("mobile");
    expect(
      container.querySelector<HTMLElement>("[data-site-layout-stage]")?.style
        .bottom,
    ).toBe(JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE);
    expect(gallery(container)?.dataset.galleryRole).toBe("picker");
    expect(gallery(container)?.dataset.galleryColumns).toBe("2");
    expect(gallery(container)?.dataset.gallerySpacing).toBe("compact");
  });

  it("switches the header action to purge on selection and sends the total cost", () => {
    const onPurge = vi.fn();
    const container = mount(view(), { onPurge });
    const initialReservations = reservations(container);

    click(q(container, "cumulus-purge-card-entry-1"));
    const action = q(container, "cumulus-purge-header-action");
    expect(action?.dataset.glassVariant).toBe("danger");
    expect(
      action?.querySelector("[data-glass-button-essence-cost]"),
    ).not.toBeNull();
    expect(reservations(container)).toEqual(initialReservations);

    click(q(container, "cumulus-purge-card-entry-2"));
    click(q(container, "cumulus-purge-header-action"));
    expect(onPurge).toHaveBeenCalledWith(["entry-1", "entry-2"], 100);
  });

  it("renders and reports authored first-visit guidance", () => {
    const onTutorialShown = vi.fn();
    const tutorial = {
      id: testPresentationId("run-a:first-visit:purge-site:Purge"),
      model: {
        portrait: artRef.characterPortrait("mira"),
        portraitAlt: "Mira",
        speakerName: "Mira",
        text: "Fixture [yellow]guidance[/yellow].",
      },
      delaySeconds: 0,
      horizontalOffset: 0,
      verticalOffset: 0,
      bubbleWidth: 600,
    } as const;
    const container = mount({ ...view(), tutorial }, { onTutorialShown });

    expect(
      q(container, "site-tutorial-dialogue")?.querySelector(
        '[data-tutorial-instruction-highlight="yellow"]',
      ),
    ).not.toBeNull();
    expect(onTutorialShown).toHaveBeenCalledWith(tutorial);
  });

  it("keeps a 20-card desktop picker at a fixed-height scrolling window", () => {
    stubMatchMedia(true);
    const container = mount(view(20));

    expect(
      container.querySelector('[data-site-layout-viewport="desktop"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-site-layout-guide] img"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-site-layout-speech-anchor]"),
    ).not.toBeNull();
    expect(cardRegion(container)?.dataset.purgeLayout).toBe("desktop");
    expect(gallery(container)?.dataset.galleryColumns).toBe("5");
    expect(gallery(container)?.dataset.galleryVisibleRows).toBe("2.5");
    expect(
      gallery(container)?.querySelector<HTMLElement>(
        "[data-glass-panel-content] > div",
      )?.style.overflowY,
    ).toBe("auto");
    expect(
      container.querySelectorAll("[data-testid^='cumulus-purge-card-entry-']"),
    ).toHaveLength(20);
  });
});
