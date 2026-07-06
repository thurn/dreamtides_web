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
    targetWidth: 230,
  };
}

describe("computePeekBox", () => {
  it("enlarges every card to the same fixed size regardless of position", () => {
    // The size is a property of the target width, not of where the tile sits,
    // so a card near the top and a card near the bottom pop to the same scale.
    const high = computePeekBox(baseInput({ left: 155, top: 90, width: 83, height: 116 }));
    const low = computePeekBox(baseInput({ left: 155, top: 700, width: 83, height: 116 }));
    expect(high.width).toBeCloseTo(low.width, 5);
    expect(high.height).toBeCloseTo(low.height, 5);
    expect(high.width).toBeCloseTo(230, 5);
  });

  it("caps the card to the viewport width when the target will not fit", () => {
    const narrow: PeekLayoutInput = {
      ...baseInput({ left: 10, top: 400, width: 60, height: 84 }),
      viewport: { width: 260, height: 852 },
    };
    const peek = computePeekBox(narrow);
    // 260 - 2*18 = 224 available; the 230 target clamps down to it.
    expect(peek.width).toBeCloseTo(224, 5);
  });

  it("rises fully above a tile pressed low, clearing the finger", () => {
    const tile = { left: 155, top: 700, width: 83, height: 116 };
    const peek = computePeekBox(baseInput(tile));
    // The whole enlarged card (rules text and all) sits above the tile band.
    expect(peek.top + peek.height).toBeLessThanOrEqual(tile.top - 20 + 0.5);
  });

  it("never moves the card below the pressed tile", () => {
    // Sweep the tile down the screen; the enlarged card's top edge must never
    // drop below the tile's top edge — pressing a card only ever pops it up (or
    // sideways), never down.
    for (let top = 80; top <= 760; top += 20) {
      const tile = { left: 155, top, width: 83, height: 116 };
      const peek = computePeekBox(baseInput(tile));
      expect(peek.top).toBeLessThanOrEqual(tile.top + 0.5);
    }
  });

  it("shifts a top-third card to the right when the finger is on the left", () => {
    const tile = { left: 40, top: 90, width: 83, height: 116 };
    const peek = computePeekBox(baseInput(tile));
    // No room to rise, so it holds at the top and slides toward the right edge,
    // away from the finger.
    expect(peek.top).toBeCloseTo(59, 5);
    expect(peek.left).toBeCloseTo(393 - 18 - peek.width, 5);
  });

  it("shifts a top-third card to the left when the finger is on the right", () => {
    const tile = { left: 270, top: 90, width: 83, height: 116 };
    const peek = computePeekBox(baseInput(tile));
    expect(peek.top).toBeCloseTo(59, 5);
    expect(peek.left).toBeCloseTo(18, 5);
  });

  it("keeps the card within the horizontal safe margins", () => {
    for (let left = 0; left <= 310; left += 20) {
      const peek = computePeekBox(baseInput({ left, top: 500, width: 83, height: 116 }));
      expect(peek.left).toBeGreaterThanOrEqual(18 - 0.5);
      expect(peek.left + peek.width).toBeLessThanOrEqual(393 - 18 + 0.5);
    }
  });

  it("keeps the card inside the vertical safe area", () => {
    for (let top = 80; top <= 760; top += 20) {
      const peek = computePeekBox(baseInput({ left: 155, top, width: 83, height: 116 }));
      expect(peek.top).toBeGreaterThanOrEqual(59 - 0.5);
      expect(peek.top + peek.height).toBeLessThanOrEqual(852 - 34 + 0.5);
    }
  });

  it("preserves the card's aspect ratio", () => {
    const peek = computePeekBox(baseInput({ left: 155, top: 300, width: 83, height: 116 }));
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
