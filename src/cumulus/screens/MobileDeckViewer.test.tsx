// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import { MobileDeckViewer, type MobileDeckView } from "./MobileDeckViewer";

vi.mock("../components/card/CardView", () => ({
  GameCard: ({ model }: { model: { cardId: string } }) => <div data-rendered-card-id={model.cardId} />,
}));

function view(): MobileDeckView {
  const cardId = asCardId("11111111-1111-4111-8111-111111111111");
  return { cards: [{ entryId: "entry-a", isBane: false, model: { cardId, displaySnapshot: {
    id: cardId, name: asCardName("Archive Sentry"), cardNumber: 1, cardType: "Character",
    subtype: "Synth", isStarter: false, energyCost: 2, spark: 1, isFast: false,
    renderedText: "Discard a bane.", imageNumber: 1, artOwned: true,
  } } }] };
}

beforeEach(() => {
  (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = (() => ({ matches: false, media: "", onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});

describe("MobileDeckViewer", () => {
  it("renders UUID-backed GameCard models and closes from the shared control", () => {
    const close = vi.fn(); const container = document.createElement("div"); document.body.append(container);
    const root = createRoot(container);
    act(() => root.render(<MobileDeckViewer view={view()} onClose={close} />));
    expect(container.querySelector('[data-deck-entry-id="entry-a"]')?.getAttribute("data-card-id")).toBe("11111111-1111-4111-8111-111111111111");
    expect(container.querySelector('[data-rendered-card-id]')?.getAttribute("data-rendered-card-id")).toBe("11111111-1111-4111-8111-111111111111");
    const closeButton = [...container.querySelectorAll("button")].find((button) => button.getAttribute("aria-label") === "Close deck");
    act(() => closeButton?.click()); expect(close).toHaveBeenCalledOnce();
    act(() => root.unmount()); container.remove();
  });
});
