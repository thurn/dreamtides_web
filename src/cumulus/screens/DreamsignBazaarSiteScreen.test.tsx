// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dreamsign } from "../../types/quest";
import { CumulusRoot } from "../CumulusRoot";
import { artRef } from "../primitives/art";
import {
  DreamsignBazaarSiteScreen,
  type DreamsignBazaarSiteView,
} from "./DreamsignBazaarSiteScreen";

function sign(index: number): Dreamsign {
  return {
    id: `dreamsign-uuid-${String(index)}`,
    name: `Dreamsign Fixture ${String(index)}`,
    imageName: `fixture-${String(index)}.png`,
    imageAlt: `Dreamsign fixture ${String(index)}`,
    effectDescription: index === 1 ? "Foresee 1." : "Draw a card.",
    isBane: index === 3,
  };
}

function view(): DreamsignBazaarSiteView {
  return {
    siteId: "dreamsign-bazaar-site",
    scene: null,
    guide: {
      id: "amunet_the_tomb_keeper",
      name: "Amunet, the Tomb-Keeper",
      line: "The sands remember all dreams.",
      art: artRef.dreamGuide("amunet_the_tomb_keeper"),
    },
    offers: Array.from({ length: 3 }, (_, index) => ({
      entryId: `dreamsign-offer-${String(index)}`,
      slotIndex: index,
      dreamsign: sign(index + 1),
      price: 100 + index * 25,
      state: index === 2 ? ("unaffordable" as const) : ("available" as const),
      requiresReplacement: false,
    })),
    restock: {
      entryId: "restock-dreamsign-bazaar-site",
      price: 50,
      state: "available",
    },
    purge: null,
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

function mount(element: ReactElement): { container: HTMLDivElement; root: Root } {
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
  document.body.innerHTML = "";
});

describe("DreamsignBazaarSiteScreen", () => {
  it("shows Amunet, a compact two-column shelf, prices, and the restock action on mobile", () => {
    const { container, root } = mount(
      <DreamsignBazaarSiteScreen
        view={view()}
        onBuy={vi.fn()}
        onRestock={vi.fn()}
        onClose={vi.fn()}
        onPurge={vi.fn()}
        onCancelPurge={vi.fn()}
      />,
    );

    expect(
      container.querySelector('[data-testid="cumulus-dreamsign-bazaar-speech-bubble"]')
        ?.textContent,
    ).toContain("Amunet, the Tomb-Keeper");
    const gallery = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-dreamsign-bazaar-gallery"]',
    );
    expect(gallery?.dataset.dreamsignGallerySize).toBe("compact");
    expect(container.querySelector("h2")?.textContent).toBe("Dreamsign Bazaar");
    expect(
      container.querySelectorAll('[data-testid^="cumulus-dreamsign-bazaar-offer-"]'),
    ).toHaveLength(3);
    expect(
      container.querySelectorAll('[data-dreamsign-gallery-caption="essence"]'),
    ).toHaveLength(4);
    const restock = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-dreamsign-bazaar-restock"]',
    );
    expect(restock?.getAttribute("aria-label")).toBe("Restock");
    expect(restock?.dataset.pressFeedback).toBe("responsive");
    expect(restock?.textContent).toBe("");
    expect(restock?.style.background).toBe("transparent");
    expect(restock?.dataset.revealPrimaryVariant).toBe("icon");
    const restockDescription = document.getElementById(
      restock?.getAttribute("aria-describedby") ?? "",
    );
    expect(restockDescription?.textContent).toContain(
      "Replace the current offers with three new Dreamsigns.",
    );
    const restockGlyph = container.querySelector<HTMLElement>(
      "[data-dreamsign-gallery-action-glyph]",
    );
    expect(Number.parseFloat(restockGlyph?.style.fontSize ?? "0")).toBeGreaterThan(70);
    expect(restockGlyph?.style.color).toBe("var(--text-on-accent)");
    expect(restockGlyph?.style.textShadow).toBe("var(--text-outline-media)");
    expect(restockGlyph?.parentElement?.style.background).toBe("");

    act(() => root.unmount());
  });

  it("uses the shared desktop guide/gallery frame and purchases only an affordable offer", () => {
    stubMatchMedia(true);
    const onBuy = vi.fn();
    const onRestock = vi.fn();
    const hudTarget = document.createElement("div");
    hudTarget.dataset.questStatusBarAnchor = "";
    document.body.append(hudTarget);
    const { container, root } = mount(
      <DreamsignBazaarSiteScreen
        view={view()}
        onBuy={onBuy}
        onRestock={onRestock}
        onClose={vi.fn()}
        onPurge={vi.fn()}
        onCancelPurge={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-guide-gallery-desktop-composition]"))
      .not.toBeNull();
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-dreamsign-bazaar-gallery"]',
      )?.dataset.dreamsignGallerySize,
    ).toBe("standard");
    const galleryRegion = container.querySelector<HTMLElement>(
      "[data-dreamsign-bazaar-gallery-region]",
    );
    expect(galleryRegion?.style.maxWidth).toBe("680px");
    expect(galleryRegion?.style.justifySelf).toBe("center");

    act(() => {
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-dreamsign-bazaar-offer-dreamsign-offer-0"]',
        )
        ?.click();
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-dreamsign-bazaar-offer-dreamsign-offer-2"]',
        )
        ?.click();
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="cumulus-dreamsign-bazaar-restock"]',
        )
        ?.click();
    });
    expect(onBuy).toHaveBeenCalledWith(0);
    expect(onBuy).toHaveBeenCalledTimes(1);
    expect(onRestock).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector(
        '[data-dreamsign-gallery-entry-id="dreamsign-offer-0"]',
      )?.getAttribute("data-dreamsign-gallery-reserved"),
    ).toBe("true");
    expect(
      container.querySelector(
        '[data-testid="cumulus-dreamsign-bazaar-purchase-travel"]',
      ),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("renders cap replacement choices above the shared screen", () => {
    const cappedView = view();
    cappedView.purge = {
      pendingDreamsign: sign(9),
      currentDreamsigns: [sign(10), sign(11)],
      maxDreamsigns: 2,
    };
    const onPurge = vi.fn();
    const { container, root } = mount(
      <DreamsignBazaarSiteScreen
        view={cappedView}
        onBuy={vi.fn()}
        onRestock={vi.fn()}
        onClose={vi.fn()}
        onPurge={onPurge}
        onCancelPurge={vi.fn()}
      />,
    );

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.textContent).toContain("Choose a Dreamsign to Replace");
    act(() => {
      container
        .querySelector<HTMLElement>(
          '[data-testid="cumulus-dreamsign-bazaar-purge-1"]',
        )
        ?.click();
    });
    expect(onPurge).toHaveBeenCalledWith(1);

    act(() => root.unmount());
  });
});
