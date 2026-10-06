// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { parseCardName } from "../../types/card-identity";
import { artRef } from "../primitives/art";
import { JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE } from "../components/hud/JourneyStatusBar";
import type { DreamsignView } from "../components/hud/Dreamsign";
import {
  PurgeSiteScreen,
  purgeActionWidthReservations,
  type PurgeSiteView,
} from "./PurgeSiteScreen";
import {
  CardShopSiteScreen,
  type CardShopSiteView,
} from "./CardShopSiteScreen";
import {
  DreamsignBazaarSiteScreen,
  type DreamsignBazaarSiteView,
} from "./DreamsignBazaarSiteScreen";
import {
  DREAMSIGN_MARKET_PRESENTATION,
  PURGE_PRESENTATION,
  SHOP_PRESENTATION,
} from "../test-helpers/presentation-fixtures";
import { dreamsignViewFixture } from "../test-helpers/dreamsign-fixture";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import {
  testCardId,
  testDreamsignId,
  testExplorationActionId,
  testGuideArtKey,
  testGuideId,
  testPresentationId,
} from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";

function stubMatchMedia(matches: boolean): void {
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

function makeCard(index: number): CardData {
  return {
    name: parseCardName(`Fixture ${String(index)}`),
    id: testCardId(
      `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ),
    cardNumber: index,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
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

describe("CardShopSiteScreen", () => {
  function view(): CardShopSiteView {
    return {
      presentation: SHOP_PRESENTATION,
      siteId: parseSiteId("shop-site"),
      scene: null,
      guide: guide("fixture-shop-guide"),
      offers: Array.from({ length: 5 }, (_, index) => {
        const displaySnapshot = makeCard(index + 1);
        return {
          entryId: parseDeckEntryId(`shop-offer-${String(index)}`),
          slotIndex: index,
          model: { cardId: displaySnapshot.id, displaySnapshot },
          price: 100 + index * 10,
          state:
            index === 4 ? ("unaffordable" as const) : ("available" as const),
        };
      }),
      restock: {
        entryId: parseDeckEntryId("shop-restock-shop-site"),
        price: 50,
        state: "available",
      },
      freePurchaseStatus: {
        freeNextShopSource: null,
        freePurchasesRemaining: 0,
      },
    };
  }

  function mount(
    siteView: CardShopSiteView,
    props: Partial<Parameters<typeof CardShopSiteScreen>[0]> = {},
  ): HTMLDivElement {
    return renderInCumulus(
      <CardShopSiteScreen
        view={siteView}
        onBuy={vi.fn()}
        onRestock={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />,
    ).container;
  }

  const gallery = (container: HTMLElement): DOMStringMap | undefined =>
    q(container, "cumulus-card-shop-gallery")?.dataset;

  it("shows five directly priced offers and the restock action in the mobile picker", () => {
    const container = mount(view());

    expect(gallery(container)?.galleryRole).toBe("picker");
    expect(gallery(container)?.galleryColumns).toBe("4");
    expect(gallery(container)?.galleryVisibleRows).toBe("2");
    expect(
      container.querySelectorAll('[data-testid^="cumulus-card-shop-offer-"]'),
    ).toHaveLength(5);
    expect(
      container.querySelectorAll('[data-gallery-caption="essence"]'),
    ).toHaveLength(6);
    expect(q(container, "cumulus-card-shop-restock")).not.toBeNull();
  });

  it("uses the shared desktop guide-and-picker composition", () => {
    stubMatchMedia(true);
    const container = mount(view());

    expect(
      container.querySelector('[data-site-layout-viewport="desktop"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-site-layout-guide] img"),
    ).not.toBeNull();
    expect(
      container.querySelector<HTMLElement>("[data-card-shop-gallery-region]")
        ?.dataset.cardShopLayout,
    ).toBe("desktop");
    expect(gallery(container)?.galleryColumns).toBe("5");
    expect(gallery(container)?.galleryVisibleRows).toBe("2");
  });

  it("purchases an affordable card immediately and refreshes from the restock action", () => {
    const onBuy = vi.fn();
    const onRestock = vi.fn();
    const deckTarget = document.createElement("div");
    deckTarget.dataset.journeyDeckTarget = "";
    document.body.append(deckTarget);
    const container = mount(view(), { onBuy, onRestock });

    click(q(container, "cumulus-card-shop-offer-shop-offer-0"));
    expect(onBuy).toHaveBeenCalledWith(0);
    expect(
      container
        .querySelector('[data-gallery-entry-id="shop-offer-0"]')
        ?.getAttribute("data-gallery-reserved"),
    ).toBe("true");
    expect(q(container, "cumulus-card-shop-purchase-travel")).not.toBeNull();

    click(q(container, "cumulus-card-shop-offer-shop-offer-4"));
    click(q(container, "cumulus-card-shop-restock"));
    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(onRestock).toHaveBeenCalledTimes(1);
  });

  it("announces overlapping free-purchase benefits with semantic provenance", () => {
    const benefitView = view();
    const source = {
      sourceSiteId: parseSiteId("exploration-site"),
      sourceActionId: testExplorationActionId("exploration-action"),
    };
    benefitView.freePurchaseStatus = {
      freeNextShopSource: source,
      freePurchasesRemaining: 2,
    };
    benefitView.offers = benefitView.offers.map((offer) => ({
      ...offer,
      price: 0,
      state: "available",
    }));
    const container = mount(benefitView);

    const region = container.querySelector<HTMLElement>(
      "[data-card-shop-gallery-region]",
    );
    const status = container.querySelector<HTMLElement>(
      "[data-shop-free-purchase-status]",
    );
    expect(region?.dataset.shopFreeSource).toBe("next-shop");
    expect(region?.dataset.shopFreePurchasesRemaining).toBe("2");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.dataset.shopFreeSourceSiteId).toBe(source.sourceSiteId);
    expect(status?.dataset.shopFreeSourceActionId).toBe(source.sourceActionId);
  });
});

describe("DreamsignBazaarSiteScreen", () => {
  function sign(index: number): DreamsignView {
    return dreamsignViewFixture({
      id: testDreamsignId(`dreamsign-uuid-${String(index)}`),
      name: `Dreamsign Fixture ${String(index)}`,
      imageName: `fixture-${String(index)}.png`,
      imageAlt: `Dreamsign fixture ${String(index)}`,
      effectDescription: "Fixture effect.",
    });
  }

  function view(): DreamsignBazaarSiteView {
    return {
      presentation: DREAMSIGN_MARKET_PRESENTATION,
      siteId: parseSiteId("dreamsign-bazaar-site"),
      scene: null,
      guide: guide("fixture-bazaar-guide"),
      offers: Array.from({ length: 3 }, (_, index) => ({
        entryId: parseDeckEntryId(`dreamsign-offer-${String(index)}`),
        slotIndex: index,
        dreamsign: sign(index + 1),
        price: 100 + index * 25,
        state: index === 2 ? ("unaffordable" as const) : ("available" as const),
        requiresReplacement: false,
      })),
      restock: {
        entryId: parseDeckEntryId("restock-dreamsign-bazaar-site"),
        price: 50,
        state: "available",
      },
      purge: null,
      freePurchaseStatus: {
        freeNextShopSource: null,
        freePurchasesRemaining: 0,
      },
    };
  }

  function mount(
    siteView: DreamsignBazaarSiteView,
    props: Partial<Parameters<typeof DreamsignBazaarSiteScreen>[0]> = {},
  ): HTMLDivElement {
    return renderInCumulus(
      <DreamsignBazaarSiteScreen
        view={siteView}
        onBuy={vi.fn()}
        onRestock={vi.fn()}
        onClose={vi.fn()}
        onPurge={vi.fn()}
        onCancelPurge={vi.fn()}
        {...props}
      />,
    ).container;
  }

  const gallerySize = (container: HTMLElement): string | undefined =>
    q(container, "cumulus-dreamsign-bazaar-gallery")?.dataset
      .dreamsignGallerySize;

  it("shows a compact priced shelf with a labelled icon restock action on mobile", () => {
    const container = mount(view());

    expect(gallerySize(container)).toBe("compact");
    expect(
      container.querySelectorAll(
        '[data-testid^="cumulus-dreamsign-bazaar-offer-"]',
      ),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll('[data-dreamsign-gallery-caption="essence"]'),
    ).toHaveLength(4);
    const restock = q(container, "cumulus-dreamsign-bazaar-restock");
    expect(restock?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(
      document.getElementById(restock?.getAttribute("aria-describedby") ?? ""),
    ).not.toBeNull();
  });

  it("uses the desktop guide/gallery frame and purchases only an affordable offer", () => {
    stubMatchMedia(true);
    const onBuy = vi.fn();
    const onRestock = vi.fn();
    const hudTarget = document.createElement("div");
    hudTarget.dataset.journeyStatusBarAnchor = "";
    document.body.append(hudTarget);
    const container = mount(view(), { onBuy, onRestock });

    expect(
      container.querySelector('[data-site-layout-viewport="desktop"]'),
    ).not.toBeNull();
    expect(gallerySize(container)).toBe("standard");

    click(q(container, "cumulus-dreamsign-bazaar-offer-dreamsign-offer-0"));
    click(q(container, "cumulus-dreamsign-bazaar-offer-dreamsign-offer-2"));
    click(q(container, "cumulus-dreamsign-bazaar-restock"));
    expect(onBuy).toHaveBeenCalledWith(0);
    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(onRestock).toHaveBeenCalledTimes(1);
    expect(
      container
        .querySelector('[data-dreamsign-gallery-entry-id="dreamsign-offer-0"]')
        ?.getAttribute("data-dreamsign-gallery-reserved"),
    ).toBe("true");
    expect(
      q(container, "cumulus-dreamsign-bazaar-purchase-travel"),
    ).not.toBeNull();
  });

  it("renders cap replacement choices and reports the replaced dreamsign id", () => {
    const cappedView = view();
    cappedView.purge = {
      pendingDreamsign: sign(9),
      currentDreamsigns: [sign(10), sign(11)],
      maxDreamsigns: 2,
    };
    const replacementId = cappedView.purge.currentDreamsigns[1]?.id;
    const onPurge = vi.fn();
    const container = mount(cappedView, { onPurge });

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    click(
      container.querySelector<HTMLElement>(
        `[data-replace-dreamsign-id="${String(replacementId)}"] button`,
      ),
    );
    expect(onPurge).toHaveBeenCalledWith(replacementId);
  });
});
