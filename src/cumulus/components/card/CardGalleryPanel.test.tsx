// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import { GLYPHS } from "../../primitives/glyph";
import { DOUBLE_TAP_WINDOW_MS } from "../../primitives/pointer-gesture";
import { CumulusRoot } from "../../CumulusRoot";
import { CardGalleryPanel } from "./CardGalleryPanel";

vi.mock("./CardView", () => ({
  CardView: ({ card }: { card: { name: string } }) => <div data-testid="card-view-copy">{card.name}</div>,
  GameCard: ({ model, onActivate, testId, unavailable }: {
    model: { displaySnapshot: { name: string } }; onActivate?: () => void;
    testId?: string; unavailable?: boolean;
  }) => <button data-testid={testId} data-unavailable={String(unavailable)} onClick={unavailable ? undefined : onActivate}>{model.displaySnapshot.name}</button>,
}));

function model(name: string) {
  const cardId = asCardId("11111111-1111-4111-8111-111111111111");
  return { cardId, displaySnapshot: { id: cardId, name: asCardName(name), cardNumber: 1,
    cardType: "Event" as const, subtype: "", isStarter: false, energyCost: 1,
    spark: null, isFast: false, renderedText: "Draw a card.", imageNumber: 1, artOwned: true } };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: false, media: "", onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
});

describe("CardGalleryPanel", () => {
  it("renders semantic GameCard models with gallery framing", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardGalleryPanel title="Starting Deck" subtitle="Your cards" cards={[{ entryId: "entry-a", model: model("Archive Sentry"), testId: "card-a" }]} columns="four" frame="fullBleed" />));
    expect(container.querySelector("h2")?.textContent).toBe("Starting Deck");
    expect(container.querySelector("section")?.dataset.galleryColumns).toBe("4");
    expect(container.querySelector('[data-testid="card-a"]')?.textContent).toBe("Archive Sentry");
    act(() => root.unmount()); container.remove();
  });

  it("routes card activation by entry id and keeps unavailable cards informative", () => {
    const activate = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardGalleryPanel title="Shop" cards={[
      { entryId: "available", model: model("Available"), testId: "available" },
      { entryId: "locked", model: model("Locked"), testId: "locked", disabled: true },
    ]} onCardPress={activate} />));
    act(() => (container.querySelector('[data-testid="available"]') as HTMLButtonElement).click());
    act(() => (container.querySelector('[data-testid="locked"]') as HTMLButtonElement).click());
    expect(activate).toHaveBeenCalledOnce();
    expect(activate).toHaveBeenCalledWith("available");
    expect(container.querySelector('[data-testid="locked"]')?.getAttribute("data-unavailable")).toBe("true");
    act(() => root.unmount()); container.remove();
  });

  it("prioritizes an enabled card double-tap over its delayed primary press", () => {
    vi.useFakeTimers();
    const activate = vi.fn();
    const doubleTap = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardGalleryPanel title="Your Void" cards={[
      { entryId: "physical-card", model: model("Physical"), testId: "physical-card" },
    ]} onCardPress={activate} onCardDoubleTap={doubleTap} />));
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

    act(() => root.unmount()); container.remove();
    vi.useRealTimers();
  });

  it("keeps reserved entries in the grid without rendering acquired content", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardGalleryPanel title="Shop" cards={[
      { entryId: "reserved", model: model("Purchased"), reserved: true },
    ]} columns="three" />));
    const slot = container.querySelector<HTMLElement>('[data-gallery-entry-id="reserved"]');
    expect(slot?.dataset.galleryReserved).toBe("true");
    expect(slot?.style.visibility).toBe("hidden");
    act(() => root.unmount()); container.remove();
  });

  it("preserves header and trailing gallery actions", () => {
    const close = vi.fn(); const restock = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><CardGalleryPanel title="Card Shop" cards={[]} rightAccessory={{ kind: "iconButton", glyph: GLYPHS.close, label: "Close", onPress: close, testId: "close" }} endAction={{ entryId: "restock", glyph: GLYPHS.refresh, label: "Restock", caption: { kind: "essence", amount: 50 }, interactionFeedback: "stationary", testId: "restock" }} onEndActionPress={restock} /></CumulusRoot>));
    act(() => (container.querySelector('[data-testid="close"]') as HTMLButtonElement).click());
    act(() => (container.querySelector('[data-testid="restock"]') as HTMLButtonElement).click());
    expect(close).toHaveBeenCalledOnce(); expect(restock).toHaveBeenCalledWith("restock");
    const action = container.querySelector<HTMLButtonElement>('[data-testid="restock"]');
    const actionSurface = container.querySelector<HTMLElement>('[data-gallery-action-surface]');
    expect(actionSurface?.style.boxSizing).toBe("border-box");
    expect(actionSurface?.style.height).toContain("+ 2px");
    expect(actionSurface?.style.borderRadius).toBe("3.6% / 2.57%");
    expect(actionSurface?.style.background).toContain("var(--gallery-action-fill)");
    expect(actionSurface?.style.border).toBe("1px solid var(--gallery-action-rim)");
    expect(action?.dataset.revealPrimaryVariant).toBe("galleryAction");
    const label = container.querySelector<HTMLElement>('[data-gallery-action-label]');
    expect(label?.textContent).toBe("Restock");
    expect(label?.style.textShadow).toBe("");
    expect(label?.style.filter).toBe("");
    const glyph = container.querySelector<HTMLElement>('[data-gallery-action-glyph]');
    expect(glyph?.style.color).toBe("var(--gallery-action-foreground)");
    expect(glyph?.style.textShadow).toBe("var(--shadow-sm)");
    expect(glyph?.style.filter).toBe("");
    expect(action?.dataset.pressFeedback).toBe("stationary");
    act(() => root.unmount()); container.remove();
  });

  it("renders an equal-width footer action pair and a decorative stacked copy", () => {
    const decline = vi.fn(); const confirm = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><CardGalleryPanel title="Duplication" reserveStackedCopySpace cards={[
      { entryId: "selected", model: model("Selected"), stackedCopy: true, stackedCopyDirection: "left" },
    ]} footerActions={[
      { label: "Decline Offer", onPress: decline, testId: "decline" },
      { label: "Duplicate", onPress: confirm, variant: "accent", testId: "confirm" },
    ]} /></CumulusRoot>));
    const actions = container.querySelector<HTMLElement>("[data-gallery-footer-actions]");
    expect(actions?.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    expect(
      container.querySelector<HTMLElement>("section")?.dataset
        .galleryReservesStackedCopy,
    ).toBe("true");
    const stackedCopy = container.querySelector<HTMLElement>("[data-gallery-stacked-copy]");
    expect(stackedCopy?.querySelector('[data-testid="card-view-copy"]')?.textContent).toBe("Selected");
    expect(stackedCopy?.style.transform).toContain("rotate(-3deg)");
    expect(container.querySelector<HTMLElement>('[data-testid="confirm"]')?.dataset.glassVariant).toBe("accent");
    act(() => (container.querySelector('[data-testid="decline"]') as HTMLButtonElement).click());
    act(() => (container.querySelector('[data-testid="confirm"]') as HTMLButtonElement).click());
    expect(decline).toHaveBeenCalledOnce(); expect(confirm).toHaveBeenCalledOnce();
    act(() => root.unmount()); container.remove();
  });

  it("renders optional browser controls and physical card gestures", () => {
    const dragStart = vi.fn();
    const contextMenu = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><CardGalleryPanel
      title="Your Deck"
      cards={[{ entryId: "physical-card", model: model("Physical"), draggable: true }]}
      toolbar={{
        search: { label: "Search Cards", value: "", onChange: vi.fn(), testId: "search" },
        sort: { ariaLabel: "Sort cards", value: "current", options: [{ value: "current", label: "Current Order" }], onChange: vi.fn() },
        filter: { ariaLabel: "Filter cards", value: "all", options: [{ value: "all", label: "All Types" }], onChange: vi.fn() },
      }}
      widthMode="fill"
      heightMode="fill"
      onCardDragStart={dragStart}
      onCardContextMenu={contextMenu}
    /></CumulusRoot>));

    expect(container.querySelector("[data-gallery-toolbar]")).not.toBeNull();
    expect(container.querySelector('[data-testid="search"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Sort cards"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Filter cards"]')).not.toBeNull();
    const panel = container.querySelector<HTMLElement>("section");
    expect(panel?.dataset.galleryWidthMode).toBe("fill");
    expect(panel?.dataset.galleryHeightMode).toBe("fill");
    expect(panel?.style.width).toBe("100%");
    expect(panel?.style.height).toBe("100%");
    const entry = container.querySelector<HTMLElement>('[data-gallery-entry-id="physical-card"]');
    expect(entry?.draggable).toBe(true);

    act(() => {
      entry?.dispatchEvent(new Event("dragstart", { bubbles: true, cancelable: true }));
      entry?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
    });
    expect(dragStart).toHaveBeenCalledWith("physical-card", expect.any(Object));
    expect(contextMenu).toHaveBeenCalledWith("physical-card", expect.any(Object));

    act(() => root.unmount()); container.remove();
  });

  it("renders a sort-only browser toolbar", () => {
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CumulusRoot><CardGalleryPanel
      title="Your Void"
      cards={[]}
      toolbar={{
        sort: { ariaLabel: "Sort cards", value: "current", options: [{ value: "current", label: "Current Order" }], onChange: vi.fn() },
      }}
    /></CumulusRoot>));

    expect(container.querySelector("input[type=search]")).toBeNull();
    expect(container.querySelector('button[aria-label="Sort cards"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="Filter cards"]')).toBeNull();

    act(() => root.unmount()); container.remove();
  });
});
