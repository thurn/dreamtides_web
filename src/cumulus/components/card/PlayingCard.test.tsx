// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import {
  PLAYING_CARD_DESIGN,
  PlayingCard,
} from "./PlayingCard";

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

function renderCard(
  card: Parameters<typeof PlayingCard>[0],
): HTMLDivElement {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() => root.render(<CumulusRoot><PlayingCard {...card} /></CumulusRoot>));
  const rendered = host.querySelector<HTMLDivElement>("[data-playing-card]");
  if (rendered === null) throw new Error("expected playing card");
  return rendered;
}

describe("PlayingCard", () => {
  it("renders a three-character ten and exposes the complete accessible value", () => {
    const card = renderCard({ rank: "10", suit: "hearts" });

    expect(card.getAttribute("aria-label")).toBe("10 of hearts");
    expect(card.textContent).toBe("10♥");
    expect(card.style.width).toBe(
      `${String(PLAYING_CARD_DESIGN.sizes.standard.square)}px`,
    );
    expect(card.style.clipPath).toContain("polygon(");
  });

  it("uses the bright red for red suits and black for black suits", () => {
    const red = renderCard({ rank: "Q", suit: "diamonds" });
    const black = renderCard({ rank: "A", suit: "spades" });
    const redIndex = red.querySelector<HTMLElement>(
      "[data-playing-card-index]",
    );
    const blackIndex = black.querySelector<HTMLElement>(
      "[data-playing-card-index]",
    );

    expect(redIndex?.style.color).toBe("rgb(255, 82, 104)");
    expect(redIndex?.style.webkitTextStroke).toBe(
      `${String(
        PLAYING_CARD_DESIGN.sizes.standard.redCharacterOutlineWidth,
      )}px ${PLAYING_CARD_DESIGN.colors.characterOutline}`,
    );
    expect(redIndex?.style.filter).toBe("");
    expect(blackIndex?.style.color).toBe("rgb(7, 7, 10)");
    expect(blackIndex?.style.webkitTextStroke).toBe("");
    expect(blackIndex?.style.paintOrder).toBe("");
    expect(blackIndex?.style.filter).toBe("");
  });

  it("applies equal-weight suit scaling and glyph-specific alignment", () => {
    const card = renderCard({
      rank: "7",
      suit: "diamonds",
      size: "compact",
    });
    const suit = card.querySelector<HTMLElement>(
      "[data-playing-card-suit-glyph]",
    );

    expect(suit?.style.fontSize).toBe(
      `${String(
        PLAYING_CARD_DESIGN.sizes.compact.fontSize *
          PLAYING_CARD_DESIGN.suitOptics.diamonds.scale,
      )}px`,
    );
    expect(Number.parseFloat(suit?.style.fontSize ?? "0")).toBeGreaterThan(
      PLAYING_CARD_DESIGN.sizes.compact.fontSize,
    );
    expect(suit?.style.top).toBe(
      `${String(
        PLAYING_CARD_DESIGN.sizes.compact.fontSize *
          PLAYING_CARD_DESIGN.suitOptics.diamonds.verticalOffsetEm,
      )}px`,
    );
  });
});
