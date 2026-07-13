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
    siteId: "shop-site",
    scene: null,
    guide: {
      id: "tobias_tanglefur",
      name: "Tobias Tanglefur",
      line: "I've set aside something just for you.",
      art: artRef.dreamGuide("tobias_tanglefur"),
    },
    offers: Array.from({ length: 5 }, (_, index) => ({
      entryId: `shop-offer-${String(index)}`,
      slotIndex: index,
      model: (() => { const displaySnapshot = makeCard(index + 1); return { cardId: displaySnapshot.id, displaySnapshot }; })(),
      price: 100 + index * 10,
      state: index === 4 ? ("unaffordable" as const) : ("available" as const),
    })),
    restock: {
      entryId: "shop-restock-shop-site",
      price: 50,
      state: "available",
    },
  };
}

function stubMatchMedia(matches = false): void {
  window.matchMedia = ((query: string) => ({
    matches,
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
      container.querySelector('[data-testid="cumulus-card-shop-speech-bubble"]')
        ?.textContent,
    ).toContain("Tobias Tanglefur");
    const gallery = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-card-shop-gallery"]',
    );
    expect(gallery?.dataset.galleryColumns).toBe("3");
    expect(gallery?.dataset.galleryVisibleRows).toBe("2");
    expect(gallery?.dataset.galleryCardSize).toBe("compact");
    expect(gallery?.dataset.galleryWidthMode).toBe("fill");
    expect(
      container.querySelectorAll('[data-testid^="cumulus-card-shop-offer-"]'),
    ).toHaveLength(5);
    expect(container.querySelectorAll('[data-gallery-caption="essence"]')).toHaveLength(6);
    expect(container.textContent).not.toContain("Buy");

    const restockGlyph = container.querySelector<HTMLElement>(
      "[data-gallery-action-glyph]",
    );
    expect(restockGlyph?.className).toContain("bx-refresh-cw");
    expect(restockGlyph?.style.color).toBe(
      "var(--gallery-action-foreground)",
    );
    expect(restockGlyph?.style.textShadow).toBe("var(--shadow-sm)");
    expect(
      container.querySelector("[data-gallery-action-label]")?.textContent,
    ).toBe("Restock");
    expect(container.querySelector("h2")?.textContent).toBe("Dream Market");
    expect(container.textContent).not.toContain("Tap a card to purchase it");
    expect(restockGlyph?.style.filter).toBe("");
    expect(
      container.querySelector('[data-testid="cumulus-card-shop-restock"]')
        ?.getAttribute("data-press-feedback"),
    ).toBe("stationary");
    const price = container.querySelector<HTMLElement>(
      '[data-gallery-caption="essence"]',
    );
    expect(price?.style.color).toBe("var(--text-on-glass)");
    expect(price?.style.background).toBe("");

    act(() => root.unmount());
  });

  it("uses the shared desktop guide-and-gallery composition with a full-width panel", () => {
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
      container.querySelector("[data-guide-gallery-desktop-composition]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-card-shop-guide-art"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-card-shop-speech-bubble"]')
        ?.textContent,
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
    expect(gallery?.dataset.galleryColumns).toBe("3");
    expect(gallery?.dataset.galleryVisibleRows).toBe("2");
    expect(gallery?.dataset.galleryCardSize).toBe("standard");
    expect(gallery?.dataset.gallerySpacing).toBe("regular");
    expect(gallery?.dataset.galleryWidthMode).toBe("fill");
    expect(gallery?.style.width).toBe("100%");
    expect(
      container.querySelector("[data-gallery-action-label]")?.textContent,
    ).toBe("Restock Offers");

    act(() => root.unmount());
  });

  it("purchases an affordable card immediately and refreshes from the restock icon", () => {
    const onBuy = vi.fn();
    const onRestock = vi.fn();
    const deckTarget = document.createElement("div");
    deckTarget.dataset.questDeckTarget = "";
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
      container.querySelector('[data-gallery-entry-id="shop-offer-0"]')
        ?.getAttribute("data-gallery-reserved"),
    ).toBe("true");
    expect(
      container.querySelector('[data-testid="cumulus-card-shop-purchase-travel"]'),
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

});
