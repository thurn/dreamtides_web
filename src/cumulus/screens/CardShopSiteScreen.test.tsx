import { assertLocalized } from "@trox/runtime";
// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { artRef } from "../primitives/art";
import {
  CardShopSiteScreen,
  type CardShopSiteView,
} from "./CardShopSiteScreen";
import { CumulusRoot } from "../CumulusRoot";
import { SHOP_PRESENTATION } from "../test-helpers/presentation-fixtures";
import { asSiteId } from "../../types/identifiers";
import { asGuideId } from "../../types/identifiers";
import { asDeckEntryId } from "../../types/identifiers";
import { asExplorationActionId } from "../../types/identifiers";

function makeCard(index: number): CardData {
  return {
    name: asCardName(`Shop Fixture ${String(index)}`),
    id: asCardId(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`),
    cardNumber: index,
    cardType: "Event",
    subtype: "",
    isStarter: false,
    energyCost: 1,
    spark: null,
    isFast: false,
    renderedText: index === 1 ? "Foresee 1." : "Draw a card.",
    imageNumber: index,
    artOwned: true,
  };
}

function view(): CardShopSiteView {
  return {
    presentation: SHOP_PRESENTATION,
    siteId: asSiteId("shop-site"),
    scene: null,
    guide: {
      id: "tobias_tanglefur",
      name: assertLocalized("Tobias Tanglefur"),
      line: assertLocalized("I've set aside something just for you."),
      art: artRef.dreamGuide(asGuideId("tobias_tanglefur")),
    },
    offers: Array.from({ length: 5 }, (_, index) => ({
      entryId: asDeckEntryId(`shop-offer-${String(index)}`),
      slotIndex: index,
      model: (() => {
        const displaySnapshot = makeCard(index + 1);
        return { cardId: displaySnapshot.id, displaySnapshot };
      })(),
      price: 100 + index * 10,
      state: index === 4 ? ("unaffordable" as const) : ("available" as const),
    })),
    restock: {
      entryId: asDeckEntryId("shop-restock-shop-site"),
      price: 50,
      state: "available",
    },
    freePurchaseStatus: {
      freeNextShopSource: null,
      freePurchasesRemaining: 0,
    },
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
  vi.useRealTimers();
  document.body.innerHTML = "";
});

describe("CardShopSiteScreen", () => {
  it("shows the Dream Market with five directly priced cards and a mobile restock action", () => {
    const { container, root } = mount(
      <CardShopSiteScreen
        view={view()}
        onBuy={vi.fn()}
        onRestock={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      container.querySelector("[data-site-layout-speech-anchor]")?.textContent,
    ).toContain("Tobias Tanglefur");
    const gallery = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-card-shop-gallery"]',
    );
    expect(gallery?.dataset.galleryRole).toBe("picker");
    expect(gallery?.dataset.galleryColumns).toBe("4");
    expect(gallery?.dataset.galleryVisibleRows).toBe("2");
    expect(gallery?.dataset.galleryCardSize).toBe("compact");
    expect(
      container.querySelectorAll('[data-testid^="cumulus-card-shop-offer-"]'),
    ).toHaveLength(5);
    expect(
      container.querySelectorAll('[data-gallery-caption="essence"]'),
    ).toHaveLength(6);
    expect(container.textContent).not.toContain("Buy");

    const restockGlyph = container.querySelector<HTMLElement>(
      "[data-gallery-action-glyph]",
    );
    expect(restockGlyph?.className).toContain("bx-refresh-cw");
    expect(restockGlyph?.style.color).toBe("var(--gallery-action-foreground)");
    expect(restockGlyph?.style.textShadow).toBe("var(--shadow-sm)");
    expect(
      container.querySelector("[data-gallery-action-label]")?.textContent,
    ).toBe("Restock");
    expect(container.querySelector("h2")?.textContent).toBe("Dream Market");
    expect(container.textContent).not.toContain("Tap a card to purchase it");
    expect(restockGlyph?.style.filter).toBe("");
    expect(
      container
        .querySelector('[data-testid="cumulus-card-shop-restock"]')
        ?.getAttribute("data-press-feedback"),
    ).toBe("stationary");
    const price = container.querySelector<HTMLElement>(
      '[data-gallery-caption="essence"]',
    );
    expect(price?.style.color).toBe("var(--text-on-glass)");
    expect(price?.style.background).toBe("");

    act(() => root.unmount());
  });

  it("uses the shared desktop guide-and-picker composition", () => {
    stubMatchMedia(true);
    const { container, root } = mount(
      <CardShopSiteScreen
        view={view()}
        onBuy={vi.fn()}
        onRestock={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(
      container.querySelector('[data-site-layout-viewport="desktop"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-site-layout-guide] img"),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-site-layout-speech-anchor]")?.textContent,
    ).toContain("Tobias Tanglefur");

    const region = container.querySelector<HTMLElement>(
      "[data-card-shop-gallery-region]",
    );
    const gallery = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-card-shop-gallery"]',
    );
    expect(region?.dataset.cardShopLayout).toBe("desktop");
    expect(region?.style.display).toBe("grid");
    expect(region?.style.alignItems).toBe("center");
    expect(gallery?.dataset.galleryRole).toBe("picker");
    expect(gallery?.dataset.galleryColumns).toBe("5");
    expect(gallery?.dataset.galleryVisibleRows).toBe("2");
    expect(gallery?.dataset.galleryCardSize).toBe("standard");
    expect(gallery?.dataset.gallerySpacing).toBe("regular");
    expect(gallery?.style.width).not.toBe("100%");
    expect(gallery?.style.width).toMatch(/^min\(calc\(/);
    expect(
      container.querySelector("[data-gallery-action-label]")?.textContent,
    ).toBe("Restock Offers");

    act(() => root.unmount());
  });

  it("purchases an affordable card immediately and refreshes from the restock icon", () => {
    const onBuy = vi.fn();
    const onRestock = vi.fn();
    const deckTarget = document.createElement("div");
    deckTarget.dataset.journeyDeckTarget = "";
    document.body.append(deckTarget);
    const { container, root } = mount(
      <CardShopSiteScreen
        view={view()}
        onBuy={onBuy}
        onRestock={onRestock}
        onClose={vi.fn()}
      />,
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-card-shop-offer-shop-offer-0"]',
        )
        ?.click();
    });
    expect(onBuy).toHaveBeenCalledWith(0);
    expect(
      container
        .querySelector('[data-gallery-entry-id="shop-offer-0"]')
        ?.getAttribute("data-gallery-reserved"),
    ).toBe("true");
    expect(
      container.querySelector(
        '[data-testid="cumulus-card-shop-purchase-travel"]',
      ),
    ).not.toBeNull();
    expect(container.textContent).not.toContain("Acquired");

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-card-shop-offer-shop-offer-4"]',
        )
        ?.click();
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-card-shop-restock"]',
        )
        ?.click();
    });
    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(onRestock).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("announces overlapping free-purchase benefits with semantic provenance", () => {
    const benefitView = view();
    benefitView.freePurchaseStatus = {
      freeNextShopSource: {
        sourceSiteId: asSiteId("exploration-site"),
        sourceActionId: asExplorationActionId("exploration-action"),
      },
      freePurchasesRemaining: 2,
    };
    benefitView.offers = benefitView.offers.map((offer) => ({
      ...offer,
      price: 0,
      state: offer.state === "purchased" ? offer.state : "available",
    }));
    const { container, root } = mount(
      <CardShopSiteScreen
        view={benefitView}
        onBuy={vi.fn()}
        onRestock={vi.fn()}
        onClose={vi.fn()}
      />,
    );

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
    expect(status?.dataset.shopFreeSourceSiteId).toBe("exploration-site");
    expect(status?.dataset.shopFreeSourceActionId).toBe("exploration-action");
    expect(status?.textContent?.trim()).not.toBe("");
    expect(
      container.querySelectorAll('[data-gallery-caption="essence"]'),
    ).toHaveLength(6);

    act(() => root.unmount());
  });
});
