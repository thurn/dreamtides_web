// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../types/cards";
import type { ResolvedDreamcallerPackage } from "../types/content";
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
  mtgName?: string,
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
    mtgName,
  };
}

const cards = [
  makeCard(1, "Alpha Seer", "Character", 1, "Mystic", "Serra Angel"),
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

function makeResolvedPackage(
  overrides: Partial<{
    starterDecklistCardNumbers: number[];
    signatureCards: string[];
  }> = {},
): ResolvedDreamcallerPackage {
  return {
    dreamcaller: {
      id: "dc-test",
      name: "Test Caller",
      title: "The Tester",
      renderedText: "",
      imageNumber: "1",
      startingEssence: 250,
      signatureCards: overrides.signatureCards ?? ["Alpha Seer", "Quick Spark"],
    },
    draftPoolCopiesByCard: {},
    dreamsignPoolIds: [],
    mandatoryOnlyPoolSize: 0,
    draftPoolSize: 0,
    doubledCardCount: 0,
    legalSubsetCount: 1,
    preferredSubsetCount: 1,
    starterDecklistCardNumbers: overrides.starterDecklistCardNumbers ?? [2, 3],
  };
}

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

function renderPool(
  overrides: Partial<{
    draftState: DraftState | null;
    onPoolCardDragStart: (card: CardData) => void;
    resolvedPackage: ResolvedDreamcallerPackage | null;
  }> = {},
) {
  return mount(
    <PoolViewer
      cardDatabase={cardDatabase}
      draftState={
        Object.prototype.hasOwnProperty.call(overrides, "draftState")
          ? overrides.draftState!
          : draftState
      }
      resolvedPackage={overrides.resolvedPackage ?? null}
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

function setSelectValue(select: HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set?.call(select, value);
  select.dispatchEvent(new Event("change", { bubbles: true }));
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
    expect(
      container.querySelector(
        '[data-pool-card-number="1"] [data-pool-copy-badge]',
      )?.textContent,
    ).toBe("x2");

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')
        ?.click();
    });

    expect(container.textContent).toContain("Beta Guard");
    expect(container.textContent).toContain("Quick Spark");
    expect(
      container.querySelector(
        '[data-pool-card-number="1"] [data-pool-copy-badge]',
      ),
    ).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("filters by name, cost, type, and character subtype with the shared toolbar", () => {
    const { container, root } = renderPool();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')
        ?.click();
    });
    act(() => {
      setInputValue(
        container.querySelector<HTMLInputElement>(
          '[aria-label="Search cards"]',
        )!,
        "spark",
      );
    });
    expect(
      container.querySelector('[data-pool-card-number="4"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="1"]')).toBeNull();

    act(() => {
      setInputValue(
        container.querySelector<HTMLInputElement>(
          '[aria-label="Search cards"]',
        )!,
        "",
      );
    });
    act(() => {
      setSelectValue(
        container.querySelector<HTMLSelectElement>(
          '[aria-label="Cost filter"]',
        )!,
        "5plus",
      );
    });
    expect(
      container.querySelector('[data-pool-card-number="2"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="4"]')).toBeNull();

    act(() => {
      setSelectValue(
        container.querySelector<HTMLSelectElement>(
          '[aria-label="Cost filter"]',
        )!,
        "all",
      );
      setSelectValue(
        container.querySelector<HTMLSelectElement>(
          '[aria-label="Type filter"]',
        )!,
        "character",
      );
    });
    expect(
      container.querySelector('[data-pool-card-number="1"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="3"]')).toBeNull();

    act(() => {
      setSelectValue(
        container.querySelector<HTMLSelectElement>(
          '[aria-label="Subtype filter"]',
        )!,
        "Soldier",
      );
    });
    expect(
      container.querySelector('[data-pool-card-number="2"]'),
    ).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="1"]')).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows the source MTG name as a hover tooltip when a card carries one", () => {
    const { container, root } = renderPool();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')
        ?.click();
    });

    expect(container.querySelector("[data-card-browser-mtg-tooltip]")).toBeNull();

    const cardArticle = container.querySelector<HTMLElement>(
      '[data-pool-card-number="1"] article',
    );
    if (cardArticle === null) {
      throw new Error("Missing pool card article");
    }

    act(() => {
      cardArticle.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });

    expect(
      container.querySelector("[data-card-browser-mtg-tooltip]")?.textContent,
    ).toBe("MTG: Serra Angel");

    act(() => {
      root.unmount();
    });
  });

  it("omits the IDF3 and signature toggles when no resolved package is supplied", () => {
    const { container, root } = renderPool();

    expect(container.querySelector('[data-pool-source="idf3"]')).toBeNull();
    expect(
      container.querySelector('[data-pool-source="signature"]'),
    ).toBeNull();
    expect(container.querySelector('[data-pool-source="run"]')).not.toBeNull();
    expect(
      container.querySelector('[data-pool-source="catalog"]'),
    ).not.toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("shows the IDF3 starting decklist and the signature cards from the resolved package", () => {
    const { container, root } = renderPool({
      resolvedPackage: makeResolvedPackage({
        starterDecklistCardNumbers: [2, 3],
        signatureCards: ["Alpha Seer", "Quick Spark"],
      }),
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="idf3"]')
        ?.click();
    });

    expect(container.querySelector('[data-pool-card-number="2"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="3"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="1"]')).toBeNull();
    // Decklist entries carry no remaining-copy badge.
    expect(container.querySelector("[data-pool-copy-badge]")).toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="signature"]')
        ?.click();
    });

    expect(container.querySelector('[data-pool-card-number="1"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="4"]')).not.toBeNull();
    expect(container.querySelector('[data-pool-card-number="2"]')).toBeNull();
    expect(container.querySelector("[data-pool-copy-badge]")).toBeNull();

    act(() => {
      root.unmount();
    });
  });

  it("hides the signature toggle when the Dreamcaller has no signature cards", () => {
    const { container, root } = renderPool({
      resolvedPackage: makeResolvedPackage({
        starterDecklistCardNumbers: [2],
        signatureCards: [],
      }),
    });

    expect(container.querySelector('[data-pool-source="idf3"]')).not.toBeNull();
    expect(
      container.querySelector('[data-pool-source="signature"]'),
    ).toBeNull();

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
      container
        .querySelector<HTMLButtonElement>('[data-pool-source="catalog"]')
        ?.click();
    });
    act(() => {
      container
        .querySelector<HTMLElement>(
          '[data-pool-card-number="1"] [role="button"]',
        )
        ?.click();
    });

    expect(logEvent).toHaveBeenCalledWith("card_preview", { cardNumber: 1 });

    act(() => {
      root.unmount();
    });
  });
});
