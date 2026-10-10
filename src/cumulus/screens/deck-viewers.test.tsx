// @vitest-environment jsdom

import { act } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { parseDeckEntryId } from "../../types/identifiers";
import { testCardId, testTideId } from "../../types/test-identities";
import { renderInCumulus } from "../testing/render";
import { DECK_TYPE_TOGGLE_OPTIONS } from "./desktop-deck-filter";
import { DesktopDeckViewer } from "./DesktopDeckViewer";
import { MobileDeckViewer, type DeckCardView } from "./MobileDeckViewer";
import { PoolViewerScreen, type PoolViewerView } from "./PoolViewerScreen";

beforeEach(() => {
  window.matchMedia = (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
});

function fixtureCard(index: number): CardData {
  return {
    name: parseCardName(`Deck Fixture ${String(index)}`),
    id: testCardId(
      `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    ),
    cardNumber: index,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: index,
    spark: 1,
    isFast: false,
    renderedText: "Draw a card.",
    imageNumber: index,
    artOwned: false,
  };
}

function deckCard(index: number): DeckCardView {
  const card = fixtureCard(index);
  return {
    entryId: parseDeckEntryId(`entry-${String(index)}`),
    model: { cardId: card.id, displaySnapshot: card },
    isBane: false,
  };
}

function click(element: Element | null | undefined): void {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("MobileDeckViewer", () => {
  it("renders UUID-backed deck entries and closes from the shared control", () => {
    const onClose = vi.fn();
    const entry = deckCard(1);
    const { container } = renderInCumulus(
      <MobileDeckViewer view={{ cards: [entry] }} onClose={onClose} />,
    );

    expect(
      container
        .querySelector(`[data-deck-entry-id="${entry.entryId}"]`)
        ?.getAttribute("data-card-id"),
    ).toBe(entry.model.cardId);
    click(container.querySelector('[data-testid="mobile-deck-close"]'));
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("DesktopDeckViewer", () => {
  it("renders the deck grid and current journey tides with the shared tide reveal", () => {
    const { container } = renderInCumulus(
      <DesktopDeckViewer
        view={{
          cards: [deckCard(1), deckCard(2), deckCard(3)],
          avatar: null,
          dreamsigns: [],
          tides: [
            {
              id: testTideId("tide-a"),
              label: "First Tide",
              description: "First path.",
              tide: "ember",
            },
            {
              id: testTideId("tide-b"),
              label: "Second Tide",
              description: "Second path.",
              tide: "vision",
            },
          ],
        }}
        onClose={vi.fn()}
      />,
    );

    expect(
      container.querySelector('[data-testid="deck-viewer-backdrop"]'),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-deck-card-grid]")?.children,
    ).toHaveLength(3);
    const discs = container.querySelectorAll<HTMLElement>(
      "[data-deck-tides] [data-tide-disc]",
    );
    expect(discs).toHaveLength(2);
    expect(discs[0]?.dataset.revealPrimaryVariant).toBe("tide");
  });

  it("omits the tide section when the run has no selected tides", () => {
    const { container } = renderInCumulus(
      <DesktopDeckViewer
        view={{ cards: [], avatar: null, dreamsigns: [], tides: [] }}
        onClose={vi.fn()}
      />,
    );
    expect(container.querySelector("[data-deck-tides]")).toBeNull();
  });

  it("filters by card type and reverses the order from the toolbar controls", () => {
    const event = deckCard(4);
    const view = {
      cards: [
        deckCard(1),
        deckCard(2),
        {
          ...event,
          model: {
            ...event.model,
            displaySnapshot: {
              ...event.model.displaySnapshot,
              cardType: "Event" as const,
            },
          },
        },
      ],
      avatar: null,
      dreamsigns: [],
      tides: [],
    };
    const { container } = renderInCumulus(
      <DesktopDeckViewer view={view} onClose={vi.fn()} />,
    );
    const gridCardIds = () =>
      Array.from(
        container.querySelectorAll("[data-deck-card-grid] > *"),
        (cell) =>
          cell.querySelector("[data-card-id]")?.getAttribute("data-card-id"),
      );
    // Toolbar order: card-type toggle, then sort direction, then card size.
    const [typeControl, directionControl] =
      container.querySelectorAll('[role="tablist"]');
    const tab = (control: Element | undefined, index: number) =>
      control?.querySelectorAll('[role="tab"]')[index];

    expect(gridCardIds()).toEqual(view.cards.map((card) => card.model.cardId));
    click(tab(directionControl, 1));
    expect(gridCardIds()).toEqual(
      view.cards.map((card) => card.model.cardId).reverse(),
    );
    click(
      tab(
        typeControl,
        DECK_TYPE_TOGGLE_OPTIONS.findIndex(
          (option) => option.value === "Event",
        ),
      ),
    );
    expect(gridCardIds()).toEqual([event.model.cardId]);
  });
});

describe("PoolViewerScreen", () => {
  it("reports stable source and card ids", () => {
    const card = fixtureCard(1);
    const view: PoolViewerView = {
      source: "run",
      sourceOptions: ["run", "catalog"],
      filters: {
        query: "",
        sort: "name",
        direction: "asc",
        type: "all",
        subtype: "",
        cost: "all",
      },
      cards: [
        {
          entryId: parseDeckEntryId("run:pool-card"),
          model: { cardId: card.id, displaySnapshot: card },
        },
      ],
      totalCount: 1,
      visibleCount: 1,
      sortOptions: ["name"],
      subtypeOptions: [{ value: "Fixture", label: "Fixture" }],
      disclosures: [{ id: "algorithm", variant: "fixture" }],
    };
    const onSourceChange = vi.fn();
    const onCardPress = vi.fn();
    const { container } = renderInCumulus(
      <PoolViewerScreen
        view={view}
        onClose={vi.fn()}
        onSourceChange={onSourceChange}
        onFiltersChange={vi.fn()}
        onCardPress={onCardPress}
      />,
    );

    expect(
      container.querySelector('[data-pool-viewer="overlay"]'),
    ).not.toBeNull();
    click(container.querySelector('[role="tab"][aria-selected="false"]'));
    expect(onSourceChange).toHaveBeenCalledWith("catalog");
    click(
      container.querySelector(
        '[data-gallery-entry-id="run:pool-card"] .card-view',
      ),
    );
    expect(onCardPress).toHaveBeenCalledWith("run:pool-card");
  });
});
