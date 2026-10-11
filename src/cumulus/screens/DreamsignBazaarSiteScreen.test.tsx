// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DreamsignView } from "../components/hud/Dreamsign";
import {
  DreamsignBazaarSiteScreen,
  type DreamsignBazaarSiteView,
} from "./DreamsignBazaarSiteScreen";
import { DREAMSIGN_MARKET_PRESENTATION } from "../test-helpers/presentation-fixtures";
import { dreamsignViewFixture } from "../test-helpers/dreamsign-fixture";
import { parseDeckEntryId, parseSiteId } from "../../types/identifiers";
import { testDreamsignId } from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";
import { click, guide, q, stubMatchMedia } from "./essence-sites.fixtures";

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
