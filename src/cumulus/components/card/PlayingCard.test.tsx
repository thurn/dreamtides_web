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
    expect(
      card.querySelector<HTMLElement>("[data-playing-card-front]")?.style
        .clipPath,
    ).toContain("polygon(");
  });

  it("uses the configured suit colors and character outlines", () => {
    const red = renderCard({ rank: "Q", suit: "diamonds" });
    const black = renderCard({ rank: "A", suit: "spades" });
    const redIndex = red.querySelector<HTMLElement>(
      "[data-playing-card-index]",
    );
    const blackIndex = black.querySelector<HTMLElement>(
      "[data-playing-card-index]",
    );

    const expectedRed = document.createElement("span");
    expectedRed.style.color = PLAYING_CARD_DESIGN.colors.red;
    const expectedBlack = document.createElement("span");
    expectedBlack.style.color = PLAYING_CARD_DESIGN.colors.black;

    expect(redIndex?.style.color).toBe(expectedRed.style.color);
    expect(redIndex?.style.webkitTextStroke).toBe(
      `${String(
        PLAYING_CARD_DESIGN.sizes.standard.redCharacterOutlineWidth,
      )}px ${PLAYING_CARD_DESIGN.colors.characterOutline}`,
    );
    expect(redIndex?.style.filter).toBe("");
    expect(blackIndex?.style.color).toBe(expectedBlack.style.color);
    expect(blackIndex?.style.webkitTextStroke).toBe(
      `${String(
        PLAYING_CARD_DESIGN.sizes.standard.blackCharacterOutlineWidth,
      )}px ${PLAYING_CARD_DESIGN.colors.characterOutline}`,
    );
    expect(blackIndex?.style.paintOrder).toBe("stroke fill");
    expect(blackIndex?.style.filter).toBe("");
  });

  it("renders the bordered checkerboard back from the shared design constants", () => {
    const card = renderCard({ rank: "K", suit: "clubs", face: "back" });
    const border = card.querySelector<HTMLElement>(
      "[data-playing-card-back-border]",
    );
    const checkerboard = card.querySelector<HTMLElement>(
      "[data-playing-card-checkerboard]",
    );

    expect(card.getAttribute("aria-label")).toBe("Face-down playing card");
    expect(card.dataset.playingCardFace).toBe("back");
    expect(border?.style.inset).toBe(
      `${String(PLAYING_CARD_DESIGN.backFace.panelInsetPercent)}%`,
    );
    expect(checkerboard?.style.inset).toBe(
      `${String(PLAYING_CARD_DESIGN.backFace.borderWidth)}px`,
    );
    expect(checkerboard?.dataset.playingCardCheckerSquares).toBe(
      String(PLAYING_CARD_DESIGN.backFace.checkerSquaresPerSide),
    );
    const checkerTilePercent =
      (2 / PLAYING_CARD_DESIGN.backFace.checkerSquaresPerSide) * 100;
    expect(checkerboard?.style.backgroundSize).toBe(
      `${String(checkerTilePercent)}% ${String(checkerTilePercent)}%`,
    );
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
    expect(suit?.style.top).toBe(
      `${String(
        PLAYING_CARD_DESIGN.sizes.compact.fontSize *
          PLAYING_CARD_DESIGN.suitOptics.diamonds.verticalOffsetEm,
      )}px`,
    );
  });
});
