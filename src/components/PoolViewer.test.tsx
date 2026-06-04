// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import type { DraftState } from "../types/draft";
import { logEvent } from "../logging";
import { PoolViewer } from "./PoolViewer";

vi.mock("../logging", () => ({
  logEvent: vi.fn(),
}));

function makeCard(
  cardNumber: number,
  name: string,
  cardType: CardData["cardType"],
  energyCost: number | null,
  subtype: string,
): CardData {
  return {
    name,
    id: `card-${String(cardNumber)}`,
    cardNumber,
    cardType,
    subtype,
    isStarter: false,
    energyCost,
    spark: cardType === "Character" ? 2 : null,
    isFast: false,
    renderedText: `${name} text`,
    imageNumber: cardNumber,
    artOwned: true,
  };
}

const cards = [
  makeCard(1, "Alpha Seer", "Character", 1, "Mystic"),
  makeCard(2, "Beta Guard", "Character", 5, "Soldier"),
  makeCard(3, "Null Rain", "Event", null, ""),
  makeCard(4, "Quick Spark", "Event", 0, ""),
];

const cardDatabase = new Map(cards.map((card) => [card.cardNumber, card]));

const draftState: DraftState = {
  draftPoolCopiesByCard: { "1": 3, "2": 1, "3": 2 },
  remainingCopiesByCard: { "1": 2, "2": 0, "3": 1 },
  currentOffer: [],
  activeSiteId: null,
  pickNumber: 1,
  sitePicksCompleted: 0,
};

function mount(element: ReactElement): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return { container, root };
}

function renderPool(overrides: Partial<{
  draftState: DraftState | null;
  onPoolCardDragStart: (card: CardData) => void;
}> = {}) {
  return mount(
    <PoolViewer
      cardDatabase={cardDatabase}
      draftState={Object.prototype.hasOwnProperty.call(overrides, "draftState")
        ? overrides.draftState!
        : draftState}
      isOpen
      onClose={vi.fn()}
      onPoolCardDragStart={overrides.onPoolCardDragStart}
    />,
  );
}

function setInputValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(() => {
  vi.clearAllMocks();
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("PoolViewer", () => {
  it("shows remaining run-pool copies by default and switches to the full catalog", () => {
    const { container, root } = renderPool();

    expect(container.textContent).toContain("Alpha Seer");
    expect(container.textContent).toContain("Null Rain");
    expect(container.textContent).not.toContain("Beta Guard");
    expect(container.querySelector('[data-pool-card-number="1"] [data-pool-copy-badge]')?.textContent).toBe("x2");

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')?.click();
    });

    expect(container.textContent).toContain("Beta Guard");
    expect(container.textContent).toContain("Quick Spark");
    expect(container.querySelector('[data-pool-card-number="1"] [data-pool-copy-badge]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("filters by name, cost, type, and character subtype", () => {
    const { container, root } = renderPool();

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')?.click();
    });
    act(() => {
      setInputValue(container.querySelector<HTMLInputElement>("[data-pool-search]")!, "spark");
    });
    expect(container.querySelector('[data-pool-card-number="4"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="1"]')).toBeNull();

    act(() => {
      setInputValue(container.querySelector<HTMLInputElement>("[data-pool-search]")!, "");
    });
    act(() => {
      container.querySelector<HTMLButtonElement>('[data-pool-cost="5+"]')?.click();
    });
    expect(container.querySelector('[data-pool-card-number="2"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="4"]')).toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-pool-cost="all"]')?.click();
      container.querySelector<HTMLButtonElement>('[data-pool-type="characters"]')?.click();
    });
    expect(container.querySelector('[data-pool-card-number="1"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="3"]')).toBeNull();

    act(() => {
      const select = container.querySelector<HTMLSelectElement>("[data-pool-subtype]")!;
      select.value = "Soldier";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.querySelector('[data-pool-card-number="2"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="1"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows empty states and opens the expanded card overlay", () => {
    const { container, root } = renderPool({ draftState: null });

    expect(container.querySelector("[data-pool-empty]")?.textContent).toContain(
      "No run pool cards are available.",
    );

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')?.click();
    });
    act(() => {
      container.querySelector<HTMLElement>('[data-pool-card-number="1"] [role="button"]')?.click();
    });

    expect(logEvent).toHaveBeenCalledWith("card_preview", { cardNumber: 1 });

    act(() => {
      root.unmount();
    });
  });
});
