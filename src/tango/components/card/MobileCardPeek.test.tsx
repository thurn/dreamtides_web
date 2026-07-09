// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CardData } from "../../../types/cards";
import { asCardId, asCardName } from "../../../types/card-identity";
import { renderMobileCardPeekOverlay } from "./MobileCardPeek";

vi.mock("./CardView", () => ({
  GameCard: ({ card }: { card: CardData }) => (
    <div data-rendered-card-id={card.id} />
  ),
}));

vi.mock("./CardTermDefinitions", () => ({
  CardTermDefinitions: ({ side }: { side?: "left" | "right" }) => (
    <div data-rendered-definition-side={side}>
      <div />
      <div />
      <div />
    </div>
  ),
}));

const THREE_TERM_CARD_ID = asCardId(
  "15b63630-d9f8-473b-9717-15ad91ff2f16",
);

const THREE_TERM_CARD: CardData = {
  id: THREE_TERM_CARD_ID,
  name: asCardName("Three-term fixture"),
  cardNumber: 252,
  cardType: "Character",
  subtype: "Synth",
  isStarter: false,
  energyCost: 5,
  spark: 3,
  isFast: true,
  isInterrupt: true,
  renderedText: "Offering\n\n▸Materialized: Prevent a played card.",
  imageNumber: 1,
  artOwned: true,
};

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 393,
  });
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("renderMobileCardPeekOverlay", () => {
  it("renders a low-row three-definition preview beside, never over, its UUID-identified card", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);

    act(() => {
      root.render(
        renderMobileCardPeekOverlay({
          view: { card: THREE_TERM_CARD },
          box: { left: 169, top: 440, width: 146, height: 204.4 },
          pointerId: 1,
          startX: 242,
          startY: 700,
          fingerX: 242,
          pinToTop: false,
        }),
      );
    });

    const primary = document.body.querySelector<HTMLElement>(
      "[data-mobile-card-peek-card]",
    );
    const definitions = document.body.querySelector<HTMLElement>(
      "[data-mobile-card-peek-definitions]",
    );
    expect(
      primary?.querySelector("[data-rendered-card-id]")?.getAttribute(
        "data-rendered-card-id",
      ),
    ).toBe(THREE_TERM_CARD_ID);
    expect(definitions?.querySelectorAll(":scope > div > div")).toHaveLength(3);

    const primaryLeft = Number.parseFloat(primary?.style.left ?? "NaN");
    const primaryWidth = Number.parseFloat(primary?.style.width ?? "NaN");
    const definitionsLeft = Number.parseFloat(
      definitions?.style.left ?? "NaN",
    );
    const definitionsWidth = Number.parseFloat(
      definitions?.style.width ?? "NaN",
    );
    expect(definitionsLeft + definitionsWidth + 10).toBeLessThanOrEqual(
      primaryLeft,
    );
    expect(primaryLeft + primaryWidth).toBeLessThanOrEqual(393 - 6);

    act(() => {
      root.unmount();
    });
  });
});
