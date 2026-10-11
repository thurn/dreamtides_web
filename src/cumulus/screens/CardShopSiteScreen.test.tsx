// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CardShopSiteScreen,
  type CardShopSiteView,
} from "./CardShopSiteScreen";
import { SHOP_PRESENTATION } from "../test-helpers/presentation-fixtures";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import { testExplorationActionId } from "../../types/test-identities";
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
