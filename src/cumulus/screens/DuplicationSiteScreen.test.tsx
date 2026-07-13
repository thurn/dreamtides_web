// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { CumulusRoot } from "../CumulusRoot";
import { artRef } from "../primitives/art";
import {
  DuplicationSiteScreen,
  type DuplicationSiteView,
} from "./DuplicationSiteScreen";

function makeCard(index: number): CardData {
  return {
    name: asCardName(`Copy Fixture ${String(index)}`),
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

function view(cardCount = 3, isEnhanced = false): DuplicationSiteView {
  return {
    siteId: "duplication-site",
    scene: null,
    guide: {
      id: "deacon_holt",
      name: "Deacon Holt",
      line: "Pick one, and I'll make another.",
      art: artRef.dreamGuide("deacon_holt"),
    },
    ready: true,
    alreadyAccepted: false,
    isEnhanced,
    cards: Array.from({ length: cardCount }, (_, offset) => {
      const index = offset + 1;
      const card = makeCard(index);
      return {
        entryId: `entry-${String(index)}`,
        model: { cardId: card.id, displaySnapshot: card },
      };
    }),
  };
}

function stubMatchMedia(desktop = true): void {
  window.matchMedia = ((query: string) => ({
    matches: query.includes("prefers-reduced-motion") ? false : desktop,
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
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("DuplicationSiteScreen", () => {
  it("keeps card selection in the gallery and enables the accent confirmation", () => {
    const onDuplicate = vi.fn();
    const { container, root } = mount(
      <DuplicationSiteScreen
        view={view()}
        onClose={vi.fn()}
        onDuplicate={onDuplicate}
      />,
    );

    expect(container.querySelector("h2")?.textContent).toBe("Duplication");
    expect(
      container.querySelectorAll('[data-testid^="cumulus-duplication-card-entry-"]'),
    ).toHaveLength(3);
    const gallery = container.querySelector<HTMLElement>(
      '[data-testid="cumulus-duplication-card-gallery"]',
    );
    expect(gallery?.dataset.galleryColumns).toBe("3");
    expect(gallery?.dataset.galleryWidthMode).toBe("content");

    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-duplication-confirm"]',
    );
    expect(confirm?.dataset.glassVariant).toBe("accent");
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");

    const first = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-duplication-card-entry-1"]',
    );
    act(() => first?.click());
    expect(confirm?.getAttribute("aria-disabled")).toBeNull();
    expect(
      container.querySelector('[data-testid="cumulus-duplication-detail"]'),
    ).toBeNull();

    act(() => confirm?.click());
    expect(onDuplicate).toHaveBeenCalledWith("entry-1");
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");
    expect(confirm?.textContent).toContain("Duplicating…");

    act(() => root.unmount());
  });

  it("toggles a selected card off without committing", () => {
    const onDuplicate = vi.fn();
    const { container, root } = mount(
      <DuplicationSiteScreen
        view={view()}
        onClose={vi.fn()}
        onDuplicate={onDuplicate}
      />,
    );
    const first = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-duplication-card-entry-1"]',
    );
    const confirm = container.querySelector<HTMLButtonElement>(
      '[data-testid="cumulus-duplication-confirm"]',
    );

    act(() => first?.click());
    act(() => first?.click());
    expect(confirm?.getAttribute("aria-disabled")).toBe("true");
    act(() => confirm?.click());
    expect(onDuplicate).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("fits the enhanced whole-deck offer into the responsive gallery", () => {
    stubMatchMedia(false);
    const { container, root } = mount(
      <DuplicationSiteScreen
        view={view(9, true)}
        onClose={vi.fn()}
        onDuplicate={vi.fn()}
      />,
    );

    expect(container.textContent).toContain("Choose any card to copy");
    expect(
      container.querySelector<HTMLElement>(
        '[data-testid="cumulus-duplication-card-gallery"]',
      )?.dataset.galleryColumns,
    ).toBe("4");
    expect(
      container.querySelector<HTMLElement>("[data-duplication-card-grid]")
        ?.dataset.duplicationLayout,
    ).toBe("mobile");
    expect(
      container.querySelector('[data-testid="cumulus-duplication-decline"]')
        ?.textContent,
    ).toBe("Decline");

    act(() => root.unmount());
  });
});
