// @vitest-environment jsdom

import { act } from "react";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../types/cards";
import { asCardId, asCardName } from "../../types/card-identity";
import { artRef } from "../primitives/art";
import { PurgeSiteScreen, type PurgeSiteView } from "./PurgeSiteScreen";

function makeCard(overrides: Partial<CardData> = {}): CardData {
  return {
    name: asCardName("Test Card"),
    id: asCardId("test-card"),
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

function view(): PurgeSiteView {
  return {
    scene: null,
    guide: {
      id: "takeshi",
      name: "Master Takeshi",
      line: "Cut only what the dream can spare.",
      art: artRef.dreamGuide("takeshi"),
    },
    cards: [
      {
        entryId: "entry-a",
        card: makeCard({ id: asCardId("card-a"), cardNumber: 1 }),
        isBane: false,
        purgeCostKind: "paid",
      },
      {
        entryId: "entry-b",
        card: makeCard({ id: asCardId("card-b"), cardNumber: 2 }),
        isBane: false,
        purgeCostKind: "paid",
      },
    ],
    visitCosts: [0, 30, 75],
    maxPaidSelections: 2,
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
  act(() => {
    root.render(element);
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
  document.body.innerHTML = "";
});

describe("PurgeSiteScreen", () => {
  it("starts with only the close control and no purge button", () => {
    const { container, root } = mount(
      <PurgeSiteScreen view={view()} onClose={vi.fn()} onPurge={vi.fn()} />,
    );

    expect(container.querySelector('[data-testid="tango-purge-close"]')).not.toBeNull();
    expect(
      container.querySelector('[data-testid="tango-purge-title"]')?.textContent,
    ).toBe("Purge Cards:");
    expect(
      container.querySelector('[data-testid="tango-purge-commit-bar"]'),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows one commit button after selection and sends the updated total cost", () => {
    const onPurge = vi.fn();
    const { container, root } = mount(
      <PurgeSiteScreen view={view()} onClose={vi.fn()} onPurge={onPurge} />,
    );

    const first = container.querySelector<HTMLElement>(
      '[data-testid="tango-purge-card-entry-a"]',
    );
    const second = container.querySelector<HTMLElement>(
      '[data-testid="tango-purge-card-entry-b"]',
    );
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();

    act(() => {
      first?.click();
    });
    expect(
      container.querySelectorAll('[data-testid="tango-purge-commit-bar"]'),
    ).toHaveLength(1);

    act(() => {
      second?.click();
    });

    const button = container.querySelector<HTMLElement>(
      '[data-testid="tango-purge-commit-bar"] button',
    );
    act(() => {
      button?.click();
    });

    expect(onPurge).toHaveBeenCalledWith(["entry-a", "entry-b"], 75);

    act(() => {
      root.unmount();
    });
  });

  it("can render the card grid on a bottom sheet for comparison captures", () => {
    const { container, root } = mount(
      <PurgeSiteScreen
        view={view()}
        useBottomSheet
        onClose={vi.fn()}
        onPurge={vi.fn()}
      />,
    );

    const cardRegion = container.querySelector<HTMLElement>(
      "[data-purge-card-grid]",
    );
    expect(cardRegion?.dataset.purgeBottomSheet).toBe("true");
    expect(cardRegion?.style.background).toContain("var(--glass-fill-popover)");
    expect(cardRegion?.style.borderTopLeftRadius).toBe("var(--radius-panel)");

    act(() => {
      root.unmount();
    });
  });

  it("renders the desktop composition with cards on a square-corner glass panel", () => {
    stubMatchMedia(true);
    const { container, root } = mount(
      <PurgeSiteScreen
        view={view()}
        useBottomSheet
        onClose={vi.fn()}
        onPurge={vi.fn()}
      />,
    );

    expect(container.querySelector("[data-purge-desktop-composition]")).not.toBeNull();
    expect(container.querySelector("[data-purge-guide]")).not.toBeNull();

    const cardRegion = container.querySelector<HTMLElement>(
      "[data-purge-card-grid]",
    );
    expect(cardRegion?.dataset.purgeLayout).toBe("desktop");
    expect(cardRegion?.dataset.purgeBottomSheet).toBe("true");
    expect(cardRegion?.style.borderLeft).toContain("var(--border-soft)");
    expect(cardRegion?.style.borderTopLeftRadius).toBe("");

    act(() => {
      root.unmount();
    });
  });
});
