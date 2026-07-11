// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../../types/card-identity";
import { GLYPHS } from "../../primitives/glyph";
import { CardGalleryPanel } from "./CardGalleryPanel";

vi.mock("./CardView", () => ({
  GameCard: ({ model, onActivate, testId, unavailable, large }: {
    model: { displaySnapshot: { name: string } }; onActivate?: () => void;
    testId?: string; unavailable?: boolean; large?: boolean;
  }) => <button data-testid={testId} data-unavailable={String(unavailable)} data-large={String(large)} onClick={unavailable ? undefined : onActivate}>{model.displaySnapshot.name}</button>,
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

  it("preserves header and trailing gallery actions", () => {
    const close = vi.fn(); const restock = vi.fn();
    const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<CardGalleryPanel title="Card Shop" cards={[]} rightAccessory={{ kind: "iconButton", glyph: GLYPHS.close, label: "Close", onPress: close, testId: "close" }} endAction={{ entryId: "restock", glyph: GLYPHS.refresh, label: "Restock", caption: { kind: "essence", amount: 50 }, testId: "restock" }} onEndActionPress={restock} />));
    act(() => (container.querySelector('[data-testid="close"]') as HTMLButtonElement).click());
    act(() => (container.querySelector('[data-testid="restock"]') as HTMLButtonElement).click());
    expect(close).toHaveBeenCalledOnce(); expect(restock).toHaveBeenCalledWith("restock");
    act(() => root.unmount()); container.remove();
  });
});
