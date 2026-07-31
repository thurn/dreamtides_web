// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CumulusRoot } from "../../CumulusRoot";
import { PlayingCard } from "./PlayingCard";

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
  // Visual values are tuned through browser QA. Keep this suite on the stable
  // semantic and accessibility contract exposed to consumers and players.
  it("renders a three-character ten and exposes the complete accessible value", () => {
    const card = renderCard({ rank: "10", suit: "hearts" });

    expect(card.getAttribute("aria-label")).toBe("10 of hearts");
    expect(card.textContent).toBe("10♥");
    expect(card.dataset.playingCardRank).toBe("10");
    expect(card.dataset.playingCardSuit).toBe("hearts");
    expect(card.dataset.playingCardSize).toBe("standard");
    expect(card.dataset.playingCardFace).toBe("front");
  });

  it.each([
    ["clubs", "♣"],
    ["diamonds", "♦"],
    ["hearts", "♥"],
    ["spades", "♠"],
  ] as const)("renders the %s suit's conventional glyph", (suit, glyph) => {
    const card = renderCard({ rank: "Q", suit });

    expect(card.getAttribute("aria-label")).toBe(`Q of ${suit}`);
    expect(card.textContent).toBe(`Q${glyph}`);
    expect(card.dataset.playingCardSuit).toBe(suit);
  });

  it("announces a face-down card without exposing its hidden identity", () => {
    const card = renderCard({ rank: "K", suit: "clubs", face: "back" });

    expect(card.getAttribute("aria-label")).toBe("Face-down playing card");
    expect(card.dataset.playingCardFace).toBe("back");
    expect(card.querySelector("[data-playing-card-front]")).not.toBeNull();
    expect(card.querySelector("[data-playing-card-back]")).not.toBeNull();
    expect(card.querySelector("[data-playing-card-checkerboard]")).not.toBeNull();
  });

  it("exposes the selected named size without changing card identity", () => {
    const card = renderCard({
      rank: "7",
      suit: "diamonds",
      size: "compact",
    });

    expect(card.dataset.playingCardSize).toBe("compact");
    expect(card.getAttribute("aria-label")).toBe("7 of diamonds");
    expect(card.textContent).toBe("7♦");
  });
});
