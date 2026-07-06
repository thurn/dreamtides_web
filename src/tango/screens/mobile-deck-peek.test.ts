import { describe, expect, it } from "vitest";
import {
  computePeekBox,
  peekOriginTransform,
  type PeekLayoutInput,
  type PeekRect,
} from "./mobile-deck-peek";

/** A 393x852 phone viewport with iPhone-class safe insets and a 5:7 card. */
function baseInput(tile: PeekRect): PeekLayoutInput {
  return {
    tile,
    viewport: { width: 393, height: 852 },
    safeTop: 59,
    safeBottom: 34,
    gap: 20,
    sideMargin: 18,
    aspect: 5 / 7,
  };
}

describe("computePeekBox", () => {
  it("places the enlarged card above a tile pressed low on the screen", () => {
    // A tile near the bottom leaves far more room above than below.
    const peek = computePeekBox(baseInput({ left: 100, top: 700, width: 83, height: 116 }));
    expect(peek.top + peek.height).toBeLessThanOrEqual(700 - 20);
  });

  it("places the enlarged card below a tile pressed high on the screen", () => {
    const peek = computePeekBox(baseInput({ left: 100, top: 90, width: 83, height: 116 }));
    expect(peek.top).toBeGreaterThanOrEqual(90 + 116 + 20);
  });

  it("never overlaps the gap-padded band around the finger", () => {
    // Sweep the tile down the screen; the enlarged card must always clear the
    // padded tile band, so the finger stays uncovered wherever it presses.
    for (let top = 80; top <= 760; top += 20) {
      const tile = { left: 155, top, width: 83, height: 116 };
      const peek = computePeekBox(baseInput(tile));
      const clearsAbove = peek.top + peek.height <= tile.top - 20 + 0.5;
      const clearsBelow = peek.top >= tile.top + tile.height + 20 - 0.5;
      expect(clearsAbove || clearsBelow).toBe(true);
    }
  });

  it("keeps the card within the horizontal safe margins, centered", () => {
    const input = baseInput({ left: 0, top: 400, width: 83, height: 116 });
    const peek = computePeekBox(input);
    expect(peek.left).toBeGreaterThanOrEqual(18 - 0.5);
    expect(peek.left + peek.width).toBeLessThanOrEqual(393 - 18 + 0.5);
    // Centered: equal margin on both sides.
    expect(peek.left).toBeCloseTo(393 - (peek.left + peek.width), 3);
  });

  it("keeps the card inside the vertical safe area", () => {
    const input = baseInput({ left: 155, top: 420, width: 83, height: 116 });
    const peek = computePeekBox(input);
    expect(peek.top).toBeGreaterThanOrEqual(59 - 0.5);
    expect(peek.top + peek.height).toBeLessThanOrEqual(852 - 34 + 0.5);
  });

  it("preserves the card's aspect ratio", () => {
    const input = baseInput({ left: 155, top: 300, width: 83, height: 116 });
    const peek = computePeekBox(input);
    expect(peek.width / peek.height).toBeCloseTo(5 / 7, 5);
  });

  it("makes the card materially larger than the tile it grew from", () => {
    const tile = { left: 155, top: 720, width: 83, height: 116 };
    const peek = computePeekBox(baseInput(tile));
    expect(peek.width).toBeGreaterThan(tile.width * 2);
  });
});

describe("peekOriginTransform", () => {
  it("maps the enlarged card back onto the tile it grew from", () => {
    const tile = { left: 155, top: 720, width: 83, height: 116 };
    const peek = computePeekBox(baseInput(tile));
    const transform = peekOriginTransform(peek, tile);
    // Scale collapses the enlarged width back to the tile width.
    expect(transform).toContain(`scale(${String(tile.width / peek.width)})`);
    // Translation carries the top-left corner from the peek box to the tile.
    expect(transform).toContain(
      `translate(${String(tile.left - peek.left)}px, ${String(tile.top - peek.top)}px)`,
    );
  });
});
