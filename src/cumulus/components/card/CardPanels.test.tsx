// @vitest-environment jsdom

import { localizationTodo } from "@trox/runtime";
import { act, isValidElement, type ReactNode } from "react";
import { createRoot as createReactRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import { GLYPHS } from "../../primitives/glyph";
import { DOUBLE_TAP_WINDOW_MS } from "../../primitives/pointer-gesture";
import { CumulusRoot } from "../../CumulusRoot";
import { CardBrowserPanel } from "./CardBrowserPanel";
import { CardPickerPanel } from "./CardPickerPanel";

function createRoot(container: Element) {
  const root = createReactRoot(container);
  return {
    render: (node: ReactNode) => root.render(
      isValidElement(node) && node.type === CumulusRoot
        ? node
        : <CumulusRoot>{node}</CumulusRoot>,
    ),
    unmount: () => root.unmount(),
  };
}

vi.mock("./CardView", () => ({
  CardView: ({ card }: { card: { name: string } }) => <div data-testid="card-view-copy">{card.name}</div>,
  GameCard: ({ model, onPress, testId, unavailable }: {
    model: { displaySnapshot: { name: string } }; onPress?: () => void;
    testId?: string; unavailable?: boolean;
  }) => <button data-testid={testId} data-unavailable={String(unavailable)} onClick={unavailable ? undefined : onPress}>{model.displaySnapshot.name}</button>,
}));

function model(name: string) {
  const cardId = asCardId("11111111-1111-4111-8111-111111111111");
  return { cardId, displaySnapshot: { id: cardId, name: asCardName(name), cardNumber: 1,
    cardType: "Event" as const, subtype: "", isStarter: false, energyCost: 1,
    spark: null, isFast: false, renderedText: "Draw a card.", imageNumber: 1, artOwned: true } };
}

let desktop = false;

beforeEach(() => {
  desktop = false;
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = (query) => ({ matches: query.includes("min-width") && desktop, media: query, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
});

describe("CardBrowserPanel", () => {
  it("owns the canonical mobile overlay recipe", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardBrowserPanel presentation="overlay" title={localizationTodo("Starting Deck")} subtitle={localizationTodo("Your cards")} cards={[{ entryId: "entry-a", model: model("Archive Sentry"), testId: "card-a" }]} />));
    const panel = container.querySelector<HTMLElement>("[data-gallery-role=browser]");
    expect(panel?.dataset.galleryColumns).toBe("4");
    expect(panel?.dataset.galleryCardSize).toBe("compact");
    expect(panel?.dataset.gallerySpacing).toBe("compact");
    expect(panel?.dataset.galleryFrame).toBe("fullBleed");
    expect(panel?.style.width).toBe("100%");
    expect(panel?.style.height).toBe("100%");
    expect(container.querySelector('[data-testid="card-a"]')?.textContent).toBe("Archive Sentry");
    act(() => root.unmount()); container.remove();
  });

  it("owns the canonical desktop collection recipe even in a full-screen host", () => {
    desktop = true;
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardBrowserPanel presentation="fullScreen" title={localizationTodo("Pool")} cards={[]} />));
    const panel = container.querySelector<HTMLElement>("[data-gallery-role=browser]");
    expect(panel?.dataset.galleryColumns).toBe("5");
    expect(panel?.dataset.galleryCardSize).toBe("standard");
    expect(panel?.dataset.gallerySpacing).toBe("regular");
    expect(panel?.dataset.galleryFrame).toBe("fullBleed");
    act(() => root.unmount()); container.remove();
  });

  it("prioritizes an enabled card double-tap over its delayed primary press", () => {
    vi.useFakeTimers();
    const activate = vi.fn(); const doubleTap = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardBrowserPanel title={localizationTodo("Your Void")} cards={[{ entryId: "physical-card", model: model("Physical"), testId: "physical-card" }]} onCardPress={activate} onCardDoubleTap={doubleTap} />));
    const card = container.querySelector<HTMLButtonElement>('[data-testid="physical-card"]');
    act(() => { card?.click(); card?.click(); });
    expect(activate).not.toHaveBeenCalled();
    expect(doubleTap).toHaveBeenCalledWith("physical-card");
    act(() => { card?.click(); vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS); });
    expect(activate).toHaveBeenCalledWith("physical-card");
    act(() => root.unmount()); container.remove(); vi.useRealTimers();
  });

  it("renders browser controls and physical card gestures", () => {
    const dragStart = vi.fn(); const contextMenu = vi.fn(); const ownerChange = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><CardBrowserPanel
      title={localizationTodo("Your Deck")}
      cards={[{ entryId: "physical-card", model: model("Physical"), draggable: true }]}
      toolbar={{
        segmented: { options: [{ value: "viewer", label: localizationTodo("Your Cards · 1") }, { value: "opponent", label: localizationTodo("Opponent Cards · 2") }], value: "viewer", onChange: ownerChange },
        search: { label: localizationTodo("Search Cards"), value: "", onChange: vi.fn(), testId: "search" },
        sort: { ariaLabel: localizationTodo("Sort cards"), value: "current", options: [{ value: "current", label: localizationTodo("Current Order") }], onChange: vi.fn() },
        filter: { ariaLabel: localizationTodo("Filter cards"), value: "all", options: [{ value: "all", label: localizationTodo("All Types") }], onChange: vi.fn() },
      }}
      onCardDragStart={dragStart}
      onCardContextMenu={contextMenu}
    /></CumulusRoot>));
    expect(container.querySelector("[data-gallery-toolbar]")).not.toBeNull();
    expect(container.querySelector('[data-testid="search"]')).not.toBeNull();
    const opponentTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find((button) => button.textContent === "Opponent Cards · 2");
    const entry = container.querySelector<HTMLElement>('[data-gallery-entry-id="physical-card"]');
    act(() => {
      opponentTab?.click();
      entry?.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
      entry?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(ownerChange).toHaveBeenCalledWith("opponent");
    expect(dragStart).toHaveBeenCalledWith("physical-card", expect.any(Object));
    expect(contextMenu).toHaveBeenCalledWith("physical-card", expect.any(Object));
    act(() => root.unmount()); container.remove();
  });

  it("supports a sort-only browser toolbar", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><CardBrowserPanel title={localizationTodo("Your Void")} cards={[]} toolbar={{ sort: { ariaLabel: localizationTodo("Sort cards"), value: "current", options: [{ value: "current", label: localizationTodo("Current Order") }], onChange: vi.fn() } }} /></CumulusRoot>));
    expect(container.querySelector("input[type=search]")).toBeNull();
    expect(container.querySelector('button[aria-label="Sort cards"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Filter cards"]')).toBeNull();
    act(() => root.unmount()); container.remove();
  });
});

describe("CardPickerPanel", () => {
  it("derives count-aware columns and routes enabled card activation", () => {
    desktop = true;
    const activate = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardPickerPanel title={localizationTodo("Shop")} cards={[
      { entryId: "available", model: model("Available"), testId: "available" },
      { entryId: "locked", model: model("Locked"), testId: "locked", disabled: true },
      { entryId: "third", model: model("Third") },
    ]} onCardPress={activate} />));
    const panel = container.querySelector<HTMLElement>("[data-gallery-role=picker]");
    expect(panel?.dataset.galleryColumns).toBe("3");
    expect(panel?.dataset.galleryCardSize).toBe("reading");
    expect(
      panel?.querySelector<HTMLElement>("[data-card-choice-grid]")?.style
        .gridTemplateColumns,
    ).toContain("240px");
    act(() => (container.querySelector('[data-testid="available"]') as HTMLButtonElement).click());
    act(() => (container.querySelector('[data-testid="locked"]') as HTMLButtonElement).click());
    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith("available");
    act(() => root.unmount()); container.remove();
  });

  it("keeps reserved entries in the count-aware grid", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardPickerPanel title={localizationTodo("Shop")} cards={[{ entryId: "reserved", model: model("Purchased"), reserved: true }]} />));
    const slot = container.querySelector<HTMLElement>('[data-gallery-entry-id="reserved"]');
    expect(slot?.dataset.galleryReserved).toBe("true");
    expect(slot?.style.visibility).toBe("hidden");
    act(() => root.unmount()); container.remove();
  });

  it("preserves header and trailing choice actions", () => {
    const close = vi.fn(); const restock = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><CardPickerPanel title={localizationTodo("Card Shop")} cards={[]} rightAccessory={{ kind: "iconButton", button: { glyph: GLYPHS.close, label: localizationTodo("Close"), onPress: close, testId: "close" } }} endAction={{ entryId: "restock", glyph: GLYPHS.refresh, label: localizationTodo("Restock"), caption: { kind: "essence", amount: 50 }, testId: "restock" }} onEndActionPress={restock} /></CumulusRoot>));
    act(() => (container.querySelector('[data-testid="close"]') as HTMLButtonElement).click());
    act(() => (container.querySelector('[data-testid="restock"]') as HTMLButtonElement).click());
    expect(close).toHaveBeenCalledOnce(); expect(restock).toHaveBeenCalledWith("restock");
    expect(container.querySelector<HTMLElement>('[data-gallery-action-surface]')?.style.background).toContain("var(--gallery-action-fill)");
    expect(container.querySelector<HTMLElement>('[data-testid="restock"]')?.dataset.revealPrimaryVariant).toBe("galleryAction");
    act(() => root.unmount()); container.remove();
  });

  it("renders one centered footer action without paired-action layout", () => {
    const decline = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><CardPickerPanel
      title={localizationTodo("Transfiguration")}
      cards={[]}
      footerActions={[
        { label: localizationTodo("Decline Offer"), onPress: decline, testId: "decline" },
      ]}
    /></CumulusRoot>));
    expect(container.querySelector("[data-gallery-footer-actions]")).toBeNull();
    act(() => (container.querySelector('[data-testid="decline"]') as HTMLButtonElement).click());
    expect(decline).toHaveBeenCalledOnce();
    act(() => root.unmount()); container.remove();
  });

  it("reserves a decorative stacked-copy footprint before showing the copy", () => {
    desktop = true;
    const decline = vi.fn(); const confirm = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    const render = (shown: boolean) => <CumulusRoot><CardPickerPanel title={localizationTodo("Duplication")} cards={[
      { entryId: "selected", model: model("Selected"), stackedCopy: { shown, direction: "left" } },
    ]} footerActions={[
      { label: localizationTodo("Decline Offer"), onPress: decline, testId: "decline" },
      { label: localizationTodo("Duplicate"), onPress: confirm, variant: "accent", testId: "confirm" },
    ]} /></CumulusRoot>;
    act(() => root.render(render(false)));
    expect(container.querySelector<HTMLElement>("[data-gallery-role=picker]")?.dataset.galleryReservesStackedCopy).toBe("true");
    expect(container.querySelector("[data-gallery-stacked-copy]")).toBeNull();
    act(() => root.render(render(true)));
    expect(container.querySelector<HTMLElement>("[data-gallery-stacked-copy]")?.style.transform).toContain("rotate(-3deg)");
    expect(container.querySelector<HTMLElement>("[data-gallery-footer-actions]")?.parentElement?.style.paddingTop).toBe("var(--space-2xl)");
    act(() => root.unmount()); container.remove();
  });

  it("uses the two-column compact recipe for mobile overlay choices", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardPickerPanel presentation="overlay" title={localizationTodo("Choose")} cards={Array.from({ length: 5 }, (_, index) => ({ entryId: String(index), model: model(String(index)) }))} />));
    const panel = container.querySelector<HTMLElement>("[data-gallery-role=picker]");
    expect(panel?.dataset.galleryColumns).toBe("2");
    expect(panel?.dataset.galleryCardSize).toBe("compact");
    expect(panel?.dataset.galleryFrame).toBe("fullBleed");
    act(() => root.unmount()); container.remove();
  });

  it("keeps desktop overlays height-bounded while floating glass hugs content width", () => {
    desktop = true;
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardBrowserPanel presentation="overlay" title={localizationTodo("Your Void")} cards={[]} />));
    const panel = container.querySelector<HTMLElement>("[data-gallery-role=browser]");
    expect(panel?.dataset.galleryFrame).toBe("floating");
    expect(panel?.dataset.galleryHeightMode).toBe("fill");
    expect(panel?.style.width).not.toBe("100%");
    expect(panel?.style.width).toMatch(/^calc\(/);
    act(() => root.unmount()); container.remove();
  });
});
