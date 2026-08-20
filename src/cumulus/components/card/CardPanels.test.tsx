// @vitest-environment jsdom

import { assertLocalized } from "@trox/runtime";
import { act, isValidElement, type ReactNode } from "react";
import { createRoot as createReactRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseCardName } from "../../../types/card-identity";
import { GLYPHS } from "../../primitives/glyph";
import { DOUBLE_TAP_WINDOW_MS } from "../../primitives/pointer-gesture";
import { CumulusRoot } from "../../CumulusRoot";
import { CardBrowserPanel } from "./CardBrowserPanel";
import { CardPickerPanel } from "./CardPickerPanel";
import { parseDeckEntryId } from "../../../types/identifiers";
import { testCardId } from "../../../types/test-identities";
import type { DomTestId } from "../../types/dom";
import type { GameCardModel } from "./CardView";

function createRoot(container: Element) {
  const root = createReactRoot(container);
  return {
    render: (node: ReactNode) =>
      root.render(
        isValidElement(node) && node.type === CumulusRoot ? (
          node
        ) : (
          <CumulusRoot>{node}</CumulusRoot>
        ),
      ),
    unmount: () => root.unmount(),
  };
}

vi.mock("./CardView", () => ({
  CardView: ({ card }: { card: { name: string } }) => (
    <div data-testid="card-view-copy">{card.name}</div>
  ),
  GameCard: ({
    model,
    onPress,
    testId,
    unavailable,
  }: {
    model: { displaySnapshot: { name: string } };
    onPress?: () => void;
    testId?: DomTestId;
    unavailable?: boolean;
  }) => (
    <button
      data-testid={testId}
      data-unavailable={String(unavailable)}
      onClick={unavailable ? undefined : onPress}
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

let desktop = false;

beforeEach(() => {
  desktop = false;
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
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

describe("CardBrowserPanel", () => {
  it("owns the canonical mobile overlay recipe", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CardBrowserPanel
          presentation="overlay"
          title={assertLocalized("Starting Deck")}
          subtitle={assertLocalized("Your cards")}
          cards={[
            {
              entryId: parseDeckEntryId("entry-a"),
              model: model("Archive Sentry"),
              testId: "card-a",
            },
          ]}
        />,
      ),
    );
    const panel = container.querySelector<HTMLElement>(
      "[data-gallery-role=browser]",
    );
    expect(panel?.dataset.galleryColumns).toBe("4");
    expect(panel?.dataset.galleryCardSize).toBe("compact");
    expect(panel?.dataset.gallerySpacing).toBe("compact");
    expect(panel?.dataset.galleryFrame).toBe("fullBleed");
    expect(panel?.style.width).toBe("100%");
    expect(panel?.style.height).toBe("100%");
    expect(container.querySelector('[data-testid="card-a"]')?.textContent).toBe(
      "Archive Sentry",
    );
    act(() => root.unmount());
    container.remove();
  });

  it("owns the canonical desktop collection recipe even in a full-screen host", () => {
    desktop = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CardBrowserPanel
          presentation="fullScreen"
          title={assertLocalized("Pool")}
          cards={[]}
        />,
      ),
    );
    const panel = container.querySelector<HTMLElement>(
      "[data-gallery-role=browser]",
    );
    expect(panel?.dataset.galleryColumns).toBe("5");
    expect(panel?.dataset.galleryCardSize).toBe("standard");
    expect(panel?.dataset.gallerySpacing).toBe("regular");
    expect(panel?.dataset.galleryFrame).toBe("fullBleed");
    act(() => root.unmount());
    container.remove();
  });

  it("prioritizes an enabled card double-tap over its delayed primary press", () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const doubleTap = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CardBrowserPanel
          title={assertLocalized("Your Void")}
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
      ),
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
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it("renders browser controls and physical card gestures", () => {
    const dragStart = vi.fn();
    const contextMenu = vi.fn();
    const ownerChange = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <CardBrowserPanel
            title={assertLocalized("Your Deck")}
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
                  { value: "viewer", label: assertLocalized("Your Cards · 1") },
                  {
                    value: "opponent",
                    label: assertLocalized("Opponent Cards · 2"),
                  },
                ],
                value: "viewer",
                onChange: ownerChange,
              },
              search: {
                label: assertLocalized("Search Cards"),
                value: "",
                onChange: vi.fn(),
                testId: "search",
              },
              sort: {
                ariaLabel: assertLocalized("Sort cards"),
                value: "current",
                options: [
                  { value: "current", label: assertLocalized("Current Order") },
                ],
                onChange: vi.fn(),
              },
              filter: {
                ariaLabel: assertLocalized("Filter cards"),
                value: "all",
                options: [
                  { value: "all", label: assertLocalized("All Types") },
                ],
                onChange: vi.fn(),
              },
            }}
            onCardDragStart={dragStart}
            onCardContextMenu={contextMenu}
          />
        </CumulusRoot>,
      ),
    );
    expect(container.querySelector("[data-gallery-toolbar]")).not.toBeNull();
    expect(container.querySelector('[data-testid="search"]')).not.toBeNull();
    const opponentTab = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ).find((button) => button.textContent === "Opponent Cards · 2");
    const entry = container.querySelector<HTMLElement>(
      '[data-gallery-entry-id="physical-card"]',
    );
    act(() => {
      opponentTab?.click();
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
    act(() => root.unmount());
    container.remove();
  });

  it("supports a sort-only browser toolbar", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <CardBrowserPanel
            title={assertLocalized("Your Void")}
            cards={[]}
            toolbar={{
              sort: {
                ariaLabel: assertLocalized("Sort cards"),
                value: "current",
                options: [
                  { value: "current", label: assertLocalized("Current Order") },
                ],
                onChange: vi.fn(),
              },
            }}
          />
        </CumulusRoot>,
      ),
    );
    expect(container.querySelector("input[type=search]")).toBeNull();
    expect(
      container.querySelector('button[aria-label="Sort cards"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('button[aria-label="Filter cards"]'),
    ).toBeNull();
    act(() => root.unmount());
    container.remove();
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
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <div data-testid="gallery-host">
          <div style={{ display: "contents" }}>
            <CardPickerPanel
              title={assertLocalized("Transfiguration")}
              cards={Array.from({ length: 10 }, (_, index) => ({
                entryId: parseDeckEntryId(`entry-${String(index)}`),
                model: model(`Card ${String(index)}`),
              }))}
            />
          </div>
        </div>,
      ),
    );

    const grid = container.querySelector<HTMLElement>(
      "[data-card-choice-grid]",
    );
    expect(grid?.style.gridTemplateColumns).toContain("138px");
    expect(grid?.children).toHaveLength(10);

    clientWidthSpy.mockRestore();
    act(() => root.unmount());
    container.remove();
  });

  it("derives count-aware columns and routes enabled card activation", () => {
    desktop = true;
    const activate = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CardPickerPanel
          title={assertLocalized("Shop")}
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
      ),
    );
    const panel = container.querySelector<HTMLElement>(
      "[data-gallery-role=picker]",
    );
    expect(panel?.dataset.galleryColumns).toBe("3");
    expect(panel?.dataset.galleryCardSize).toBe("reading");
    expect(panel?.style.width).toContain("min(");
    expect(panel?.style.maxWidth).toBe("100%");
    expect(panel?.style.minWidth).toBe("0px");
    expect(
      panel?.querySelector<HTMLElement>("[data-card-choice-grid]")?.style
        .gridTemplateColumns,
    ).toContain("240px");
    act(() =>
      (
        container.querySelector(
          '[data-testid="available"]',
        ) as HTMLButtonElement
      ).click(),
    );
    act(() =>
      (
        container.querySelector('[data-testid="locked"]') as HTMLButtonElement
      ).click(),
    );
    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith("available");
    act(() => root.unmount());
    container.remove();
  });

  it("keeps reserved entries in the count-aware grid", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CardPickerPanel
          title={assertLocalized("Shop")}
          cards={[
            {
              entryId: parseDeckEntryId("reserved"),
              model: model("Purchased"),
              reserved: true,
            },
          ]}
        />,
      ),
    );
    const slot = container.querySelector<HTMLElement>(
      '[data-gallery-entry-id="reserved"]',
    );
    expect(slot?.dataset.galleryReserved).toBe("true");
    expect(slot?.style.visibility).toBe("hidden");
    act(() => root.unmount());
    container.remove();
  });

  it("preserves header and trailing choice actions", () => {
    const close = vi.fn();
    const restock = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <CardPickerPanel
            title={assertLocalized("Card Shop")}
            cards={[]}
            rightAccessory={{
              kind: "iconButton",
              button: {
                glyph: GLYPHS.close,
                label: assertLocalized("Close"),
                onPress: close,
                testId: "close",
              },
            }}
            endAction={{
              entryId: parseDeckEntryId("restock"),
              glyph: GLYPHS.refresh,
              label: assertLocalized("Restock"),
              caption: { kind: "essence", amount: 50 },
              testId: "restock",
            }}
            onEndActionPress={restock}
          />
        </CumulusRoot>,
      ),
    );
    act(() =>
      (
        container.querySelector('[data-testid="close"]') as HTMLButtonElement
      ).click(),
    );
    act(() =>
      (
        container.querySelector('[data-testid="restock"]') as HTMLButtonElement
      ).click(),
    );
    expect(close).toHaveBeenCalledOnce();
    expect(restock).toHaveBeenCalledWith("restock");
    expect(
      container.querySelector<HTMLElement>("[data-gallery-action-surface]")
        ?.style.background,
    ).toContain("var(--gallery-action-fill)");
    expect(
      container.querySelector<HTMLElement>('[data-testid="restock"]')?.dataset
        .revealPrimaryVariant,
    ).toBe("galleryAction");
    act(() => root.unmount());
    container.remove();
  });

  it("renders one centered footer action without paired-action layout", () => {
    const decline = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <CardPickerPanel
            title={assertLocalized("Transfiguration")}
            cards={[]}
            footerActions={[
              {
                label: assertLocalized("Decline Offer"),
                onPress: decline,
                testId: "decline",
              },
            ]}
          />
        </CumulusRoot>,
      ),
    );
    expect(container.querySelector("[data-gallery-footer-actions]")).toBeNull();
    act(() =>
      (
        container.querySelector('[data-testid="decline"]') as HTMLButtonElement
      ).click(),
    );
    expect(decline).toHaveBeenCalledOnce();
    act(() => root.unmount());
    container.remove();
  });

  it("reserves a decorative stacked-copy footprint before showing the copy", () => {
    desktop = true;
    const decline = vi.fn();
    const confirm = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (shown: boolean) => (
      <CumulusRoot>
        <CardPickerPanel
          title={assertLocalized("Duplication")}
          cards={[
            {
              entryId: parseDeckEntryId("selected"),
              model: model("Selected"),
              stackedCopy: { shown, direction: "left" },
            },
          ]}
          footerActions={[
            {
              label: assertLocalized("Decline Offer"),
              onPress: decline,
              testId: "decline",
            },
            {
              label: assertLocalized("Duplicate"),
              onPress: confirm,
              variant: "accent",
              testId: "confirm",
            },
          ]}
        />
      </CumulusRoot>
    );
    act(() => root.render(render(false)));
    expect(
      container.querySelector<HTMLElement>("[data-gallery-role=picker]")
        ?.dataset.galleryReservesStackedCopy,
    ).toBe("true");
    expect(container.querySelector("[data-gallery-stacked-copy]")).toBeNull();
    act(() => root.render(render(true)));
    expect(
      container.querySelector<HTMLElement>("[data-gallery-stacked-copy]")?.style
        .transform,
    ).toContain("rotate(-3deg)");
    expect(
      container.querySelector<HTMLElement>("[data-gallery-footer-actions]")
        ?.parentElement?.style.paddingTop,
    ).toBe("var(--space-2xl)");
    act(() => root.unmount());
    container.remove();
  });

  it("uses the two-column compact recipe for mobile overlay choices", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CardPickerPanel
          presentation="overlay"
          title={assertLocalized("Choose")}
          cards={Array.from({ length: 5 }, (_, index) => ({
            entryId: parseDeckEntryId(String(index)),
            model: model(String(index)),
          }))}
        />,
      ),
    );
    const panel = container.querySelector<HTMLElement>(
      "[data-gallery-role=picker]",
    );
    expect(panel?.dataset.galleryColumns).toBe("2");
    expect(panel?.dataset.galleryCardSize).toBe("compact");
    expect(panel?.dataset.galleryFrame).toBe("fullBleed");
    act(() => root.unmount());
    container.remove();
  });

  it("keeps desktop overlays height-bounded while floating glass hugs content width", () => {
    desktop = true;
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CardBrowserPanel
          presentation="overlay"
          title={assertLocalized("Your Void")}
          cards={[]}
        />,
      ),
    );
    const panel = container.querySelector<HTMLElement>(
      "[data-gallery-role=browser]",
    );
    expect(panel?.dataset.galleryFrame).toBe("floating");
    expect(panel?.dataset.galleryHeightMode).toBe("fill");
    expect(panel?.style.width).not.toBe("100%");
    expect(panel?.style.width).toMatch(/^min\(calc\(/);
    act(() => root.unmount());
    container.remove();
  });
});
