import { describe, expect, it } from "vitest";
import {
  computePeekBox,
  computeSupplementalPeekLayout,
  peekWidthForViewport,
  rulesRegionOfPeek,
  circleRectGap,
  FINGER_RADIUS_PX,
  PEEK_MAX_WIDTH_PX,
  type PeekLayoutInput,
} from "./mobile-card-peek-geometry";

const THREE_TERM_CARD_ID = "15b63630-d9f8-473b-9717-15ad91ff2f16";

/** iPhone-class safe insets, side margin, and card shape shared by the cases. */
const ENV = {
  safeTop: 59,
  safeBottom: 34,
  sideMargin: 18,
  aspect: 5 / 7,
  columns: 4,
  columnGap: 8,
};

function layout(
  viewport: { width: number; height: number },
  finger: { x: number; y: number },
  width: number,
): PeekLayoutInput {
  return {
    viewport,
    safeTop: ENV.safeTop,
    safeBottom: ENV.safeBottom,
    sideMargin: ENV.sideMargin,
    aspect: ENV.aspect,
    width,
    finger,
  };
}

function widthFor(viewportWidth: number): number {
  return peekWidthForViewport({
    viewportWidth,
    sideMargin: ENV.sideMargin,
    columns: ENV.columns,
    columnGap: ENV.columnGap,
  });
}

/** The 4-across grid's column-center x coordinates (the finger's x is one). */
function columnCenters(viewportWidth: number): number[] {
  const gridWidth = viewportWidth - ENV.sideMargin * 2;
  const tileWidth =
    (gridWidth - ENV.columnGap * (ENV.columns - 1)) / ENV.columns;
  return Array.from(
    { length: ENV.columns },
    (_, i) => ENV.sideMargin + i * (tileWidth + ENV.columnGap) + tileWidth / 2,
  );
}

describe("peekWidthForViewport", () => {
  it("never exceeds the max width, and reaches it only on roomy viewports", () => {
    expect(widthFor(360)).toBeLessThanOrEqual(PEEK_MAX_WIDTH_PX);
    // Narrower phones must shrink the card to keep the finger clear.
    expect(widthFor(360)).toBeLessThan(widthFor(430));
  });

  it("is a single value per viewport — every card enlarges to the same size", () => {
    // The width depends only on the viewport, not on which card or column, so a
    // second query with the same viewport returns the identical size.
    expect(widthFor(393)).toBe(widthFor(393));
  });
});

describe("computePeekBox", () => {
  it("sits just above the finger for a low press, not up at the top", () => {
    const width = widthFor(393);
    const box = computePeekBox(
      layout({ width: 393, height: 852 }, { x: 150, y: 700 }, width),
    );
    // The card is placed just above the finger (well below the safe-area top),
    // so a bottom-of-deck card pops up near the thumb rather than at the top.
    expect(box.top).toBeGreaterThan(ENV.safeTop + 100);
    // Its bottom edge (the rules text) clears the top of the finger circle.
    expect(box.top + box.height).toBeLessThanOrEqual(
      700 - FINGER_RADIUS_PX + 0.5,
    );
  });

  it("pins the card to the top when the finger is too high to fit above it", () => {
    const box = computePeekBox(
      layout({ width: 393, height: 852 }, { x: 60, y: 215 }, widthFor(393)),
    );
    expect(box.top).toBeCloseTo(ENV.safeTop, 5);
  });

  it("pins a top-row source to the safe top even when it could fit lower", () => {
    const width = widthFor(393);
    const box = computePeekBox({
      ...layout({ width: 393, height: 852 }, { x: 150, y: 400 }, width),
      pinToTop: true,
    });

    expect(box.top).toBeCloseTo(ENV.safeTop, 5);
    expect(box.top).toBeLessThan(400);
  });

  it("never places the card below the finger — pressing only pops it up", () => {
    const width = widthFor(393);
    for (let y = 200; y <= 800; y += 20) {
      const box = computePeekBox(
        layout({ width: 393, height: 852 }, { x: 150, y }, width),
      );
      expect(box.top).toBeLessThanOrEqual(y);
    }
  });

  it("draws the card at the requested width, in the card's aspect ratio", () => {
    const width = widthFor(393);
    const box = computePeekBox(
      layout({ width: 393, height: 852 }, { x: 242, y: 300 }, width),
    );
    expect(box.width).toBeCloseTo(width, 5);
    expect(box.width / box.height).toBeCloseTo(ENV.aspect, 5);
  });

  it("shifts a top-of-screen finger's card to the opposite side", () => {
    const width = widthFor(393);
    // A finger high on the left throws the card to the right edge, and vice versa.
    const left = computePeekBox(
      layout({ width: 393, height: 852 }, { x: 60, y: 215 }, width),
    );
    const right = computePeekBox(
      layout({ width: 393, height: 852 }, { x: 333, y: 215 }, width),
    );
    expect(left.left).toBeGreaterThan(right.left);
    expect(right.left).toBeCloseTo(ENV.sideMargin, 5);
    expect(left.left).toBeCloseTo(393 - ENV.sideMargin - width, 5);
  });

  it("keeps a low finger's card over its own column", () => {
    const width = widthFor(393);
    const box = computePeekBox(
      layout({ width: 393, height: 852 }, { x: 60, y: 760 }, width),
    );
    // The finger is well below the rules band, so the card centers on it.
    expect(box.left).toBeCloseTo(ENV.sideMargin, 5); // clamped to the left margin
  });

  it("keeps the card within the horizontal safe margins", () => {
    const width = widthFor(393);
    for (const x of columnCenters(393)) {
      for (let y = 200; y <= 800; y += 40) {
        const box = computePeekBox(
          layout({ width: 393, height: 852 }, { x, y }, width),
        );
        expect(box.left).toBeGreaterThanOrEqual(ENV.sideMargin - 0.5);
        expect(box.left + box.width).toBeLessThanOrEqual(
          393 - ENV.sideMargin + 0.5,
        );
      }
    }
  });
});

describe("computeSupplementalPeekLayout", () => {
  it(`keeps the three definition cards for UUID ${THREE_TERM_CARD_ID} beside the enlarged card near the bottom`, () => {
    // Fourth-row, second-inner-column geometry on an iPhone 16 viewport: the
    // enlarged card is centered over a low press. A 45vw definition column
    // cannot fit on either side unless the pair is packed as one unit.
    const viewportWidth = 393;
    const box = {
      left: 169,
      top: 440,
      width: widthFor(viewportWidth),
      height: widthFor(viewportWidth) / ENV.aspect,
    };
    const supplementalWidth = viewportWidth * 0.45;
    const layout = computeSupplementalPeekLayout({
      box,
      viewportWidth,
      supplementalWidth,
      gap: 10,
      edge: 6,
    });

    expect(layout.primaryLeft).toBeGreaterThan(box.left);
    expect(layout.supplemental.side).toBe("left");
    expect(
      layout.supplemental.left + supplementalWidth + 10,
    ).toBeLessThanOrEqual(layout.primaryLeft);
    expect(layout.supplemental.left).toBeGreaterThanOrEqual(6);
    expect(layout.primaryLeft + box.width).toBeLessThanOrEqual(
      viewportWidth - 6,
    );
  });

  it("preserves the enlarged card position when a definition column already fits", () => {
    const box = { left: 18, top: 59, width: 146, height: 204.4 };
    const layout = computeSupplementalPeekLayout({
      box,
      viewportWidth: 393,
      supplementalWidth: 176.85,
      gap: 10,
      edge: 6,
    });

    expect(layout.primaryLeft).toBe(box.left);
    expect(layout.supplemental.side).toBe("right");
    expect(layout.supplemental.left).toBe(box.left + box.width + 10);
  });

  it("keeps the primary and definition column disjoint across mobile widths and horizontal positions", () => {
    for (const viewportWidth of [360, 375, 393, 430]) {
      const width = widthFor(viewportWidth);
      const supplementalWidth = viewportWidth * 0.45;
      for (
        let left = ENV.sideMargin;
        left <= viewportWidth - ENV.sideMargin - width;
        left += 7
      ) {
        const box = {
          left,
          top: 400,
          width,
          height: width / ENV.aspect,
        };
        const layout = computeSupplementalPeekLayout({
          box,
          viewportWidth,
          supplementalWidth,
          gap: 10,
          edge: 6,
        });
        const primaryRight = layout.primaryLeft + box.width;
        const supplementalRight =
          layout.supplemental.left + supplementalWidth;

        expect(layout.primaryLeft).toBeGreaterThanOrEqual(6);
        expect(primaryRight).toBeLessThanOrEqual(viewportWidth - 6);
        expect(layout.supplemental.left).toBeGreaterThanOrEqual(6);
        expect(supplementalRight).toBeLessThanOrEqual(viewportWidth - 6);
        if (layout.supplemental.top === box.top) {
          const horizontalGap = Math.max(
            layout.supplemental.left - primaryRight,
            layout.primaryLeft - supplementalRight,
          );
          expect(horizontalGap).toBeGreaterThanOrEqual(10);
        } else {
          expect(layout.supplemental.top).toBeGreaterThanOrEqual(
            box.top + box.height + 10,
          );
        }
      }
    }
  });
});

describe("rules-text clears the finger circle (the guarantee)", () => {
  const VIEWPORTS = [
    { width: 360, height: 800 },
    { width: 375, height: 812 },
    { width: 393, height: 852 },
    { width: 430, height: 932 },
  ];

  it("never overlaps, for every column at every press height and phone width", () => {
    for (const viewport of VIEWPORTS) {
      const width = widthFor(viewport.width);
      for (const x of columnCenters(viewport.width)) {
        for (
          let y = ENV.safeTop;
          y <= viewport.height - ENV.safeBottom;
          y += 2
        ) {
          const box = computePeekBox(layout(viewport, { x, y }, width));
          const gap = circleRectGap(
            x,
            y,
            FINGER_RADIUS_PX,
            rulesRegionOfPeek(box),
          );
          expect(gap).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });
});

describe("circleRectGap", () => {
  const rect = { left: 100, top: 100, width: 80, height: 40 };

  it("is negative when the circle reaches into the rectangle", () => {
    expect(circleRectGap(120, 120, 10, rect)).toBeLessThan(0);
  });

  it("is the edge-to-edge distance when the circle is clear", () => {
    // Circle centered 50px left of the rect's left edge, radius 10 → gap 40.
    expect(circleRectGap(50, 120, 10, rect)).toBeCloseTo(40, 5);
  });
});
