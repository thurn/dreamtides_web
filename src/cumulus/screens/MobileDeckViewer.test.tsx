// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import { MobileDeckViewer, type MobileDeckView } from "./MobileDeckViewer";
import { CumulusRoot } from "../CumulusRoot";
import type { CardId } from "../../types/card-identity";
import { asDeckEntryId } from "../../types/identifiers";

vi.mock("../components/card/CardView", () => ({
  GameCard: ({ model }: { model: { cardId: CardId } }) => (
    <div data-rendered-card-id={model.cardId} />
  ),
}));

function view(): MobileDeckView {
  const cardId = asCardId("11111111-1111-4111-8111-111111111111");
  return {
    cards: [
      {
        entryId: asDeckEntryId("entry-a"),
        isBane: false,
        model: {
          cardId,
          displaySnapshot: {
            id: cardId,
            name: asCardName("Archive Sentry"),
            cardNumber: 1,
            cardType: "Character",
            subtype: "Synth",
            isStarter: false,
            energyCost: 2,
            spark: 1,
            isFast: false,
            renderedText: "Nightmare is a Bane.",
            imageNumber: 1,
            artOwned: true,
          },
        },
      },
    ],
  };
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({
    matches: false,
    media: "",
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  });
});

describe("MobileDeckViewer", () => {
  it("renders UUID-backed GameCard models and closes from the shared control", () => {
    const close = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    act(() =>
      root.render(
        <CumulusRoot>
          <MobileDeckViewer view={view()} onClose={close} />
        </CumulusRoot>,
      ),
    );
    expect(
      container
        .querySelector('[data-deck-entry-id="entry-a"]')
        ?.getAttribute("data-card-id"),
    ).toBe("11111111-1111-4111-8111-111111111111");
    expect(
      container
        .querySelector("[data-rendered-card-id]")
        ?.getAttribute("data-rendered-card-id"),
    ).toBe("11111111-1111-4111-8111-111111111111");
    const closeButton = container.querySelector<HTMLButtonElement>(
      '[data-testid="mobile-deck-close"]',
    );
    expect(closeButton?.getAttribute("aria-label")).not.toBe("");
    act(() => closeButton?.click());
    expect(close).toHaveBeenCalledOnce();
    act(() => root.unmount());
    container.remove();
  });
});
