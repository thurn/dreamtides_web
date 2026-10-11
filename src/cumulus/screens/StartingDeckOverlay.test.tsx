// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardId } from "../../types/card-identity";
import {
  StartingDeckOverlay,
  type StartingDeckView,
} from "./StartingDeckOverlay";
import { parseDeckEntryId } from "../../types/identifiers";
import type { CardViewProps } from "../components/card/CardView";
import type { DomTestId } from "../types/dom";
import { renderInCumulus } from "../testing/render";
import { card, stubMatchMedia } from "./augury-and-starting-deck.fixtures";

// GameCard does not expose its selection state in the DOM; this stub surfaces
// it as `data-selection` and keeps the card-art pipeline out of these tests.
vi.mock("../components/card/CardView", async () => {
  const { Pressable } = await import("../primitives/Pressable");
  return {
    CardView: ({ card }: Pick<CardViewProps, "card">) => (
      <div data-card-view-id={card.id} />
    ),
    GameCard: ({
      model,
      onPress,
      selection,
      testId,
    }: {
      model: { cardId: CardId };
      onPress?: () => void;
      selection?: string;
      testId?: DomTestId;
    }) => (
      <Pressable
        as={onPress === undefined ? "div" : "button"}
        data-testid={testId}
        data-card-id={model.cardId}
        data-selection={selection}
        onClick={onPress}
      />
    ),
  };
});

beforeEach(() => {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
});

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("StartingDeckOverlay", () => {
  function makeView(cardCount = 2): StartingDeckView {
    return {
      cards: Array.from({ length: cardCount }, (_, index) => {
        const displaySnapshot = card(index + 1);
        return {
          entryId: parseDeckEntryId(`entry-${String(index + 1)}`),
          model: { cardId: displaySnapshot.id, displaySnapshot },
          testId: `starting-deck-modal-card-entry-${String(index + 1)}`,
        };
      }),
    };
  }

  function mount(
    props: Partial<Parameters<typeof StartingDeckOverlay>[0]> = {},
  ): HTMLDivElement {
    return renderInCumulus(
      <StartingDeckOverlay
        isOpen
        view={makeView()}
        onClose={vi.fn()}
        {...props}
      />,
    ).container;
  }

  const gallery = (container: HTMLElement): HTMLElement | null =>
    container.querySelector("[data-gallery-frame]");
  const cards = (container: HTMLElement): Element[] =>
    Array.from(
      container.querySelectorAll("[data-testid^='starting-deck-modal-card-']"),
    );

  beforeEach(() => stubMatchMedia(() => false));

  it("renders nothing when closed", () => {
    const container = mount({ isOpen: false });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(cards(container)).toHaveLength(0);
  });

  it("renders the starting cards in acquisition order in a full-bleed scrolling mobile gallery", () => {
    const container = mount();

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(cards(container).map((c) => c.getAttribute("data-testid"))).toEqual([
      "starting-deck-modal-card-entry-1",
      "starting-deck-modal-card-entry-2",
    ]);
    expect(gallery(container)?.dataset.galleryFrame).toBe("fullBleed");
    expect(gallery(container)?.dataset.galleryColumns).toBe("4");
    expect(
      container.querySelector<HTMLElement>("[data-glass-panel-content] > div")
        ?.style.overflowY,
    ).toBe("auto");
  });

  it("bounds a large deck in a floating desktop panel with a scrolling peek", () => {
    stubMatchMedia(
      (query) => query.includes("min-width") && !query.includes("min-height"),
    );
    const container = mount({ view: makeView(20) });

    expect(gallery(container)?.parentElement?.style.maxHeight).toContain(
      "100vh",
    );
    expect(gallery(container)?.dataset.galleryFrame).toBe("floating");
    expect(gallery(container)?.dataset.galleryColumns).toBe("5");
    expect(gallery(container)?.dataset.galleryVisibleRows).toBe("2.5");
    expect(cards(container)).toHaveLength(20);
  });

  it("closes from its single action or Escape, never from a panel or backdrop click", () => {
    const onClose = vi.fn();
    const container = mount({ onClose });

    const backdrop = container.querySelector('[role="dialog"]');
    act(() => {
      gallery(container)?.parentElement?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onClose).not.toHaveBeenCalled();

    const buttons = container.querySelectorAll("button");
    expect(buttons).toHaveLength(1);
    act(() => buttons[0]?.click());
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("renders the empty-state placeholder when the deck is empty", () => {
    const container = mount({ view: { cards: [] } });
    expect(
      container.querySelector('[role="dialog"] [data-card-gallery-empty]'),
    ).not.toBeNull();
    expect(cards(container)).toHaveLength(0);
  });
});
