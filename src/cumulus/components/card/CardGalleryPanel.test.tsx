// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import { GLYPHS } from "../../primitives/glyph";
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
  window.matchMedia = (() => ({ matches: false, media: "", onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
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
    act(() => root.render(<CumulusRoot><CardGalleryPanel title="Duplication" cards={[
      { entryId: "selected", model: model("Selected"), stackedCopy: true },
    ]} footerActions={[
      { label: "Decline Offer", onPress: decline, testId: "decline" },
      { label: "Duplicate", onPress: confirm, variant: "accent", testId: "confirm" },
    ]} /></CumulusRoot>));
    const actions = container.querySelector<HTMLElement>("[data-gallery-footer-actions]");
    expect(actions?.style.gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))");
    const stackedCopy = container.querySelector<HTMLElement>("[data-gallery-stacked-copy]");
    expect(stackedCopy?.querySelector('[data-testid="card-view-copy"]')?.textContent).toBe("Selected");
    expect(stackedCopy?.style.transform).toContain("rotate(3deg)");
    expect(container.querySelector<HTMLElement>('[data-testid="confirm"]')?.dataset.glassVariant).toBe("accent");
    act(() => (container.querySelector('[data-testid="decline"]') as HTMLButtonElement).click());
    act(() => (container.querySelector('[data-testid="confirm"]') as HTMLButtonElement).click());
    expect(decline).toHaveBeenCalledOnce(); expect(confirm).toHaveBeenCalledOnce();
    act(() => root.unmount()); container.remove();
  });
});
