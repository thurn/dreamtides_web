import { describe, expect, it } from "vitest";
import { computeSupplementalPeekLayout } from "./mobile-card-peek-geometry";

describe("mobile card peek supplemental definitions", () => {
  it("packs definitions beside a centered enlarged card without overlap", () => {
    const card = { left: 80, top: 250, width: 143, height: 200 };
    const placement = computeSupplementalPeekLayout({
      box: card,
      viewportWidth: 393,
      supplementalWidth: 177,
      gap: 10,
      edge: 6,
    });

    const cardLeft = placement.primaryLeft;
    const cardRight = cardLeft + card.width;
    const definitionsLeft = placement.supplemental.left;
    const definitionsRight = definitionsLeft + placement.supplemental.width;
    const gap = Math.max(
      definitionsLeft - cardRight,
      cardLeft - definitionsRight,
    );

    expect(gap).toBeGreaterThanOrEqual(10);
    expect(cardLeft).toBeGreaterThanOrEqual(6);
    expect(cardRight).toBeLessThanOrEqual(393 - 6);
    expect(definitionsLeft).toBeGreaterThanOrEqual(6);
    expect(definitionsRight).toBeLessThanOrEqual(393 - 6);
  });

  it("preserves the enlarged card position when definitions already fit", () => {
    const card = { left: 18, top: 59, width: 143, height: 200 };
    const placement = computeSupplementalPeekLayout({
      box: card,
      viewportWidth: 393,
      supplementalWidth: 177,
      gap: 10,
      edge: 6,
    });

    expect(placement.primaryLeft).toBe(card.left);
    expect(placement.supplemental.side).toBe("right");
    expect(placement.supplemental.left).toBe(card.left + card.width + 10);
  });
});
