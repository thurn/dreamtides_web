// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCardName } from "../../../types/card-identity";
import { parseDeckEntryId } from "../../../types/identifiers";
import { testCardId } from "../../../types/test-identities";
import { GLYPHS } from "../../primitives/glyph";
import { DOUBLE_TAP_WINDOW_MS } from "../../primitives/pointer-gesture";
import { renderInCumulus } from "../../testing/render";
import type { DomTestId } from "../../types/dom";
import { CardBrowserPanel } from "./CardBrowserPanel";
import { CardChoiceGrid } from "./CardChoiceGrid";
import { CardPickerPanel } from "./CardPickerPanel";
import type { GameCardModel } from "./CardView";

vi.mock("./CardView", () => ({
  CardView: () => <div />,
  GameCard: ({
    model,
    onPress,
    selection,
    testId,
    unavailable,
  }: {
    model: { displaySnapshot: { name: string } };
    onPress?: () => void;
    selection?: string;
    testId?: DomTestId;
    unavailable?: boolean;
  }) => (
    <button
      data-testid={testId}
      data-selection={selection}
      aria-disabled={unavailable || undefined}
      onClick={unavailable === true ? undefined : onPress}
    >
      {model.displaySnapshot.name}
    </button>
  ),
}));

function model(name: string): GameCardModel {
  const cardId = testCardId("11111111-1111-4111-8111-111111111111");
  return {
    cardId,
    displaySnapshot: {
      id: cardId,
      name: parseCardName(name),
      cardNumber: 1,
      cardType: "Event" as const,
      subtype: "",
      isStarter: false,
      energyCost: 1,
      spark: null,
      isFast: false,
      renderedText: "Draw a card.",
      imageNumber: 1,
      artOwned: true,
    },
  };
}

function click(container: HTMLElement, marker: string): void {
  act(() =>
    container
      .querySelector<HTMLButtonElement>(`[data-testid="${marker}"]`)
      ?.click(),
  );
}

const originalMatchMedia = window.matchMedia.bind(window);
let desktop = false;

beforeEach(() => {
  desktop = false;
  window.matchMedia = (query) => ({
    matches: query.includes("min-width") && desktop,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
});

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.useRealTimers();
});

describe("CardBrowserPanel", () => {
  it("renders its cards inside the browser gallery", () => {
    const { container } = renderInCumulus(
      <CardBrowserPanel
        presentation="overlay"
        title={"Starting Deck"}
        cards={[
          {
            entryId: parseDeckEntryId("entry-a"),
            model: model("Archive Sentry"),
            testId: "card-a",
          },
        ]}
      />,
    );
    expect(
      container.querySelector("[data-gallery-role=browser]"),
    ).not.toBeNull();
    expect(container.querySelector('[data-testid="card-a"]')).not.toBeNull();
  });

  it("prioritizes an enabled card double-tap over its delayed primary press", () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const doubleTap = vi.fn();
    const { container } = renderInCumulus(
      <CardBrowserPanel
        title={"Your Void"}
        cards={[
          {
            entryId: parseDeckEntryId("physical-card"),
            model: model("Physical"),
            testId: "physical-card",
          },
        ]}
        onCardPress={activate}
        onCardDoubleTap={doubleTap}
      />,
    );
    const card = container.querySelector<HTMLButtonElement>(
      '[data-testid="physical-card"]',
    );
    act(() => {
      card?.click();
      card?.click();
    });
    expect(activate).not.toHaveBeenCalled();
    expect(doubleTap).toHaveBeenCalledWith("physical-card");
    act(() => {
      card?.click();
      vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS);
    });
    expect(activate).toHaveBeenCalledWith("physical-card");
  });

  it("routes toolbar tabs and physical card gestures by entry id", () => {
    const dragStart = vi.fn();
    const contextMenu = vi.fn();
    const ownerChange = vi.fn();
    const { container } = renderInCumulus(
      <CardBrowserPanel
        title={"Your Deck"}
        cards={[
          {
            entryId: parseDeckEntryId("physical-card"),
            model: model("Physical"),
            draggable: true,
          },
        ]}
        toolbar={{
          segmented: {
            options: [
              { value: "viewer", label: "Viewer" },
              { value: "opponent", label: "Opponent" },
            ],
            value: "viewer",
            onChange: ownerChange,
          },
          search: {
            label: "Search",
            value: "",
            onChange: vi.fn(),
            testId: "search",
          },
        }}
        onCardDragStart={dragStart}
        onCardContextMenu={contextMenu}
      />,
    );
    expect(container.querySelector('[data-testid="search"]')).not.toBeNull();
    const entry = container.querySelector<HTMLElement>(
      '[data-gallery-entry-id="physical-card"]',
    );
    act(() => {
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]')[1]?.click();
      entry?.dispatchEvent(
        new Event("dragstart", { bubbles: true, cancelable: true }),
      );
      entry?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    expect(ownerChange).toHaveBeenCalledWith("opponent");
    expect(dragStart).toHaveBeenCalledWith("physical-card", expect.any(Object));
    expect(contextMenu).toHaveBeenCalledWith(
      "physical-card",
      expect.any(Object),
    );
  });
});

describe("CardPickerPanel", () => {
  it("fits a whole-deck picker into complete rows through a display-contents wrapper", () => {
    desktop = true;
    const clientWidthSpy = vi
      .spyOn(HTMLElement.prototype, "clientWidth", "get")
      .mockImplementation(function (this: HTMLElement) {
        if (this.matches('[data-testid="gallery-host"]')) return 690;
        if (this.matches('[data-gallery-role="picker"]')) return 484;
        return 0;
      });
    const { container } = renderInCumulus(
      <div data-testid="gallery-host">
        <div style={{ display: "contents" }}>
          <CardPickerPanel
            title={"Transfiguration"}
            cards={Array.from({ length: 10 }, (_, index) => ({
              entryId: parseDeckEntryId(`entry-${String(index)}`),
              model: model(`Card ${String(index)}`),
            }))}
          />
        </div>
      </div>,
    );

    const grid = container.querySelector<HTMLElement>(
      "[data-card-choice-grid]",
    );
    expect(grid?.style.gridTemplateColumns).toContain("138px");
    expect(grid?.children).toHaveLength(10);
    clientWidthSpy.mockRestore();
  });

  it("derives count-aware columns and routes only enabled card activation", () => {
    desktop = true;
    const activate = vi.fn();
    const { container } = renderInCumulus(
      <CardPickerPanel
        title={"Shop"}
        cards={[
          {
            entryId: parseDeckEntryId("available"),
            model: model("Available"),
            testId: "available",
          },
          {
            entryId: parseDeckEntryId("locked"),
            model: model("Locked"),
            testId: "locked",
            disabled: true,
          },
          { entryId: parseDeckEntryId("third"), model: model("Third") },
        ]}
        onCardPress={activate}
      />,
    );
    expect(
      container.querySelector<HTMLElement>("[data-gallery-role=picker]")
        ?.dataset.galleryColumns,
    ).toBe("3");
    click(container, "available");
    click(container, "locked");
    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith("available");
  });

  it("keeps reserved entries in the grid as hidden slots", () => {
    const { container } = renderInCumulus(
      <CardPickerPanel
        title={"Shop"}
        cards={[
          {
            entryId: parseDeckEntryId("reserved"),
            model: model("Purchased"),
            reserved: true,
          },
        ]}
      />,
    );
    const slot = container.querySelector<HTMLElement>(
      '[data-gallery-entry-id="reserved"]',
    );
    expect(slot?.dataset.galleryReserved).toBe("true");
    expect(slot?.style.visibility).toBe("hidden");
  });

  it("routes header, trailing choice, and footer actions", () => {
    const close = vi.fn();
    const restock = vi.fn();
    const decline = vi.fn();
    const { container } = renderInCumulus(
      <CardPickerPanel
        title={"Card Shop"}
        cards={[]}
        rightAccessory={{
          kind: "iconButton",
          button: {
            glyph: GLYPHS.close,
            label: "Close",
            onPress: close,
            testId: "close",
          },
        }}
        endAction={{
          entryId: parseDeckEntryId("restock"),
          glyph: GLYPHS.refresh,
          label: "Restock",
          caption: { kind: "essence", amount: 50 },
          testId: "restock",
        }}
        onEndActionPress={restock}
        footerActions={[
          { label: "Decline", onPress: decline, testId: "decline" },
        ]}
      />,
    );
    click(container, "close");
    click(container, "restock");
    click(container, "decline");
    expect(close).toHaveBeenCalledOnce();
    expect(restock).toHaveBeenCalledWith("restock");
    expect(decline).toHaveBeenCalledOnce();
  });

  it("reserves the stacked-copy footprint before showing the copy", () => {
    desktop = true;
    const picker = (shown: boolean) => (
      <CardPickerPanel
        title={"Duplication"}
        cards={[
          {
            entryId: parseDeckEntryId("selected"),
            model: model("Selected"),
            stackedCopy: { shown, direction: "left" },
          },
        ]}
      />
    );
    const { container, rerender } = renderInCumulus(picker(false));
    expect(
      container.querySelector<HTMLElement>("[data-gallery-role=picker]")
        ?.dataset.galleryReservesStackedCopy,
    ).toBe("true");
    expect(container.querySelector("[data-gallery-stacked-copy]")).toBeNull();
    rerender(picker(true));
    expect(
      container.querySelector("[data-gallery-stacked-copy]"),
    ).not.toBeNull();
  });
});

describe("CardChoiceGrid", () => {
  it("renders entries in order and routes stable entry ids", () => {
    const choose = vi.fn();
    const { container } = renderInCumulus(
      <CardChoiceGrid
        cards={[
          {
            entryId: parseDeckEntryId("choice-a"),
            model: model("A"),
            testId: "choice-a",
          },
          {
            entryId: parseDeckEntryId("choice-b"),
            model: model("B"),
            testId: "choice-b",
            selection: "highlighted",
            quantityBadge: { count: 2 },
            operation: "copy",
          },
        ]}
        columns="two"
        layout={{ kind: "site", viewport: "desktop", fit: "choice" }}
        onCardPress={choose}
      />,
    );

    expect(
      container
        .querySelector("[data-card-choice-grid-columns]")
        ?.getAttribute("data-card-choice-grid-columns"),
    ).toBe("2");
    expect(
      Array.from(
        container.querySelectorAll<HTMLElement>("[data-entry-id]"),
      ).map((entry) => entry.dataset.entryId),
    ).toEqual(["choice-a", "choice-b"]);
    expect(
      container
        .querySelector('[data-card-choice-operation="copy"]')
        ?.getAttribute("aria-label"),
    ).not.toBe("");
    click(container, "choice-b");
    expect(choose).toHaveBeenCalledWith("choice-b");
  });

  it("blocks activation and physical gestures on a disabled entry", () => {
    const choose = vi.fn();
    const dragStart = vi.fn();
    const dragEnd = vi.fn();
    const contextMenu = vi.fn();
    const { container } = renderInCumulus(
      <CardChoiceGrid
        cards={[
          {
            entryId: parseDeckEntryId("disabled-card"),
            model: model("Disabled"),
            testId: "disabled-card",
            disabled: true,
            draggable: true,
          },
        ]}
        columns="one"
        layout={{ kind: "site", viewport: "desktop", fit: "choice" }}
        onCardPress={choose}
        onCardDragStart={dragStart}
        onCardDragEnd={dragEnd}
        onCardContextMenu={contextMenu}
      />,
    );

    const entry = container.querySelector<HTMLElement>(
      '[data-gallery-entry-id="disabled-card"]',
    );
    click(container, "disabled-card");
    act(() => {
      for (const type of ["dragstart", "dragend"]) {
        entry?.dispatchEvent(
          new Event(type, { bubbles: true, cancelable: true }),
        );
      }
      entry?.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });

    expect(choose).not.toHaveBeenCalled();
    expect(dragStart).not.toHaveBeenCalled();
    expect(dragEnd).not.toHaveBeenCalled();
    expect(contextMenu).not.toHaveBeenCalled();
    expect(entry?.draggable).toBe(false);
  });
});
