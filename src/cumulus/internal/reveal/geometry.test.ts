import { describe, expect, it } from "vitest";
import { fitSecondaryPrefix, selectRevealPlacement, type RevealPlacementInput } from "./geometry";

const viewport = { layout: "mobile", width: 390, height: 844, offsetLeft: 0, offsetTop: 0, safeArea: { top: 12, right: 0, bottom: 20, left: 0 } } as const;
const base: RevealPlacementInput = {
  viewport, reason: "press", primaryKind: "infoCard", sourceRect: { x: 170, y: 650, width: 50, height: 50 },
  touchPoint: { x: 195, y: 675 }, primarySize: { width: 248, height: 190 }, secondarySizes: [], sourceShowsCompleteGameCard: false,
  sourceIsBattlefieldGameCard: false,
  sourceRemainsVisible: false,
};

describe("fitSecondaryPrefix", () => {
  it("preserves priority and includes only complete leading cards", () => {
    expect(fitSecondaryPrefix([{ width: 100, height: 80 }, { width: 100, height: 90 }, { width: 100, height: 20 }], 175)).toBe(1);
    expect(fitSecondaryPrefix([], 100)).toBe(0);
  });
});

describe("selectRevealPlacement", () => {
  const circleClearance = (card: { x: number; y: number; width: number; height: number }, point: { x: number; y: number }) => {
    const x = Math.max(card.x, Math.min(point.x, card.x + card.width));
    const y = Math.max(card.y, Math.min(point.y, card.y + card.height));
    return Math.hypot(point.x - x, point.y - y) - 24;
  };
  it("uses exact 45vw mobile card widths and never places a touch popup below the touch", () => {
    const result = selectRevealPlacement(base);
    expect(result.primaryRect.width).toBe(175.5);
    expect(result.primaryRect.y + result.primaryRect.height).toBeLessThanOrEqual(base.touchPoint!.y - 24);
  });

  it("keeps GameCard primary placement identical with or without secondaries", () => {
    const game = { ...base, primaryKind: "gameCard" as const };
    const alone = selectRevealPlacement(game);
    const supported = selectRevealPlacement({ ...game, secondarySizes: [{ width: 248, height: 120 }, { width: 248, height: 150 }] });
    expect(supported.primaryRect).toEqual(alone.primaryRect);
  });

  it("evenly distributes mobile popup columns between both edges and the internal gap", () => {
    const result = selectRevealPlacement({
      ...base,
      secondarySizes: [{ width: 248, height: 120 }],
    });
    const secondary = result.secondaryRects[0];
    const leftGap = result.primaryRect.x;
    const internalGap = secondary.x - (result.primaryRect.x + result.primaryRect.width);
    const rightGap = viewport.width - (secondary.x + secondary.width);

    expect(leftGap).toBeCloseTo(13);
    expect(internalGap).toBeCloseTo(leftGap);
    expect(rightGap).toBeCloseTo(leftGap);
  });

  it("places touch popups above the complete source area with the standard source gap", () => {
    const sourceRect = { x: 165, y: 600, width: 60, height: 60 };
    const result = selectRevealPlacement({
      ...base,
      sourceRect,
      touchPoint: { x: 195, y: 630 },
    });

    expect(result.primaryRect.y + result.primaryRect.height).toBeLessThanOrEqual(sourceRect.y - 14);
  });

  it("keeps the desktop GameCard reading rectangle fixed while fitting secondaries around it", () => {
    const game = { ...base, viewport: { ...viewport, layout: "desktop" as const, width: 1200 }, reason: "hover" as const, touchPoint: undefined, primaryKind: "gameCard" as const };
    const alone = selectRevealPlacement(game);
    const supported = selectRevealPlacement({ ...game, secondarySizes: [{ width: 248, height: 120 }] });
    expect(supported.primaryRect).toEqual(alone.primaryRect);
  });

  it("places a GameCard named by a wide choice cell entirely beside the cell", () => {
    const sourceRect = { x: 29, y: 648, width: 366, height: 53 };
    const result = selectRevealPlacement({
      ...base,
      viewport: {
        ...viewport,
        layout: "desktop",
        width: 1440,
        height: 900,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        boundary: { x: 0, y: 0, width: 1440, height: 780 },
      },
      reason: "hover",
      touchPoint: undefined,
      primaryKind: "gameCard",
      sourceRect,
      primarySize: { width: 240, height: 336 },
      secondarySizes: [{ width: 248, height: 82 }],
      sourceRemainsVisible: true,
    });

    expect(result.family).toBe("desktop-side-right");
    expect(result.primaryRect.x).toBeGreaterThanOrEqual(
      sourceRect.x + sourceRect.width + 14,
    );
    expect(result.primaryRect.width).toBe(240);
    expect(result.primaryRect.y + result.primaryRect.height).toBeLessThanOrEqual(780);
    expect(result.secondaryRects[0].y + result.secondaryRects[0].height).toBeLessThanOrEqual(780);
    expect(result.bestEffortPrimaryOverlap).toBe(false);
  });

  it("keeps desktop card reading reveals inside their application boundary", () => {
    const boundary = { x: 20, y: 118, width: 1160, height: 666 };
    const result = selectRevealPlacement({
      ...base,
      viewport: {
        ...viewport,
        layout: "desktop",
        width: 1200,
        height: 800,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
        boundary,
      },
      reason: "hover",
      touchPoint: undefined,
      primaryKind: "gameCard",
      sourceRect: { x: 143, y: 118, width: 150, height: 210 },
      primarySize: { width: 150, height: 210 },
      secondarySizes: [{ width: 248, height: 80 }],
    });

    expect(result.primaryRect.y).toBe(boundary.y);
    expect(result.secondaryRects[0]?.y).toBe(boundary.y);
    expect(result.primaryRect.x).toBeGreaterThanOrEqual(boundary.x);
    expect(result.primaryRect.x + result.primaryRect.width).toBeLessThanOrEqual(
      boundary.x + boundary.width,
    );
  });

  it("grows desktop source definitions upward from the source bottom edge", () => {
    const sourceRect = { x: 400, y: 500, width: 300, height: 40 };
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, layout: "desktop", width: 1200, height: 900, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
      reason: "hover",
      touchPoint: undefined,
      primaryKind: "source",
      sourceRect,
      primarySize: { width: 300, height: 40 },
      secondarySizes: [{ width: 248, height: 80 }, { width: 248, height: 100 }],
    });

    expect(result.family).toBe("desktop-source-in-place");
    expect(result.primaryRect).toEqual(sourceRect);
    expect(result.secondaryRects).toHaveLength(2);
    expect(result.secondaryRects[1].y + result.secondaryRects[1].height).toBe(
      sourceRect.y + sourceRect.height,
    );
  });

  it("aligns a tall desktop source definition below a source near the viewport top", () => {
    const sourceRect = { x: 400, y: 80, width: 300, height: 40 };
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, layout: "desktop", width: 1200, height: 900, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
      reason: "hover",
      touchPoint: undefined,
      primaryKind: "source",
      sourceRect,
      primarySize: { width: 300, height: 40 },
      secondarySizes: [{ width: 248, height: 208 }],
    });

    expect(result.family).toBe("desktop-source-in-place");
    expect(result.primaryRect).toEqual(sourceRect);
    expect(result.secondaryRects).toHaveLength(1);
    expect(result.secondaryRects[0]?.y).toBe(sourceRect.y);
    expect(result.secondaryRects[0]?.y + result.secondaryRects[0]?.height).toBeLessThanOrEqual(900);
  });

  it("places small tangible previews horizontally beyond the glossary stack", () => {
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, layout: "desktop", width: 1200, height: 900 },
      reason: "hover",
      touchPoint: undefined,
      primaryKind: "gameCard",
      sourceRect: { x: 400, y: 250, width: 100, height: 150 },
      primarySize: { width: 240, height: 360 },
      secondarySizes: [{ width: 248, height: 120 }],
      adjacentSizes: [{ width: 150, height: 225 }],
    });

    expect(result.orientation).toBe("primary-left");
    expect(result.secondaryRects).toHaveLength(1);
    expect(result.adjacentRects).toHaveLength(1);
    expect(result.secondaryRects[0]?.x).toBe(
      result.primaryRect.x + result.primaryRect.width + 10,
    );
    expect(result.adjacentRects[0]?.x).toBe(
      result.secondaryRects[0].x + result.secondaryRects[0].width + 10,
    );
    expect(result.adjacentRects[0].x + result.adjacentRects[0].width).toBeLessThanOrEqual(1200);
  });

  it("moves the complete help row left when the source is near the right edge", () => {
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, layout: "desktop", width: 1200, height: 900 },
      reason: "hover",
      touchPoint: undefined,
      primaryKind: "gameCard",
      sourceRect: { x: 1040, y: 250, width: 100, height: 150 },
      primarySize: { width: 240, height: 360 },
      secondarySizes: [{ width: 248, height: 120 }],
      adjacentSizes: [{ width: 150, height: 225 }],
    });

    expect(result.orientation).toBe("primary-right");
    expect(result.adjacentRects[0].x).toBeGreaterThanOrEqual(0);
    expect(result.secondaryRects[0].x).toBe(
      result.adjacentRects[0].x + result.adjacentRects[0].width + 10,
    );
    expect(result.primaryRect.x).toBe(
      result.secondaryRects[0].x + result.secondaryRects[0].width + 10,
    );
  });

  it.each([
    { sourceX: 120, expectedX: 234, family: "desktop-battlefield-near-right", orientation: "primary-left" },
    { sourceX: 1000, expectedX: 746, family: "desktop-battlefield-near-left", orientation: "primary-right" },
  ] as const)("places battlefield reading copies diagonally above and beside their source", ({ sourceX, expectedX, family, orientation }) => {
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, layout: "desktop", width: 1200, height: 900, safeArea: { top: 0, right: 0, bottom: 0, left: 0 } },
      reason: "hover",
      touchPoint: undefined,
      primaryKind: "gameCard",
      sourceRect: { x: sourceX, y: 500, width: 100, height: 100 },
      primarySize: { width: 100, height: 140 },
      secondarySizes: [{ width: 248, height: 120 }],
      sourceIsBattlefieldGameCard: true,
    });

    expect(result.family).toBe(family);
    expect(result.orientation).toBe(orientation);
    expect(result.primaryRect).toMatchObject({ x: expectedX, y: 150, width: 240, height: 336 });
    expect(result.primaryRect.y + result.primaryRect.height).toBe(500 - 14);
    expect(
      result.primaryRect.x >= sourceX + 100 + 14
      || result.primaryRect.x + result.primaryRect.width <= sourceX - 14,
    ).toBe(true);
    expect(result.secondaryRects).toHaveLength(1);
    expect(result.secondaryRects[0]?.y).toBe(150);
  });

  it("gives card-shaped gallery actions the exact GameCard hover rectangle", () => {
    const input = {
      ...base,
      viewport: { ...viewport, layout: "desktop" as const, width: 1200 },
      reason: "hover" as const,
      touchPoint: undefined,
      sourceRect: { x: 400, y: 200, width: 151, height: 211.4 },
      primarySize: { width: 151, height: 211.4 },
    };
    const gameCard = selectRevealPlacement({ ...input, primaryKind: "gameCard" });
    const galleryAction = selectRevealPlacement({ ...input, primaryKind: "galleryAction" });

    expect(galleryAction.primaryRect).toEqual(gameCard.primaryRect);
    expect(galleryAction.family).toBe(gameCard.family);
  });

  it("omits secondaries when safe-area width cannot hold non-overlapping columns", () => {
    const constrained = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, width: 320, safeArea: { top: 12, right: 20, bottom: 20, left: 20 } },
      secondarySizes: [{ width: 248, height: 80 }],
    });
    expect(constrained.secondaryRects).toEqual([]);
    expect(constrained.secondaryTruncation).toBe(true);
  });

  it("pins impossible placements to an on-screen top corner opposite the touch", () => {
    const result = selectRevealPlacement({ ...base, touchPoint: { x: 195, y: 35 }, primarySize: { width: 248, height: 700 } });
    expect(result.bestEffortPrimaryOverlap).toBe(true);
    expect(result.primaryRect.x + result.primaryRect.width).toBeLessThanOrEqual(viewport.width);
    expect(result.primaryRect.y).toBe(viewport.safeArea.top);
    expect(["primary-left", "primary-right"]).toContain(result.orientation);
  });

  it("hard-clears the primary touch circle while allowing a top-aligned secondary to cross it", () => {
    const touchPoint = { x: 20, y: 80 };
    const result = selectRevealPlacement({ ...base, touchPoint, primarySize: { width: 248, height: 260 }, secondarySizes: [{ width: 248, height: 180 }] });
    expect(circleClearance(result.primaryRect, touchPoint)).toBeGreaterThanOrEqual(0);
    expect(result.primaryRect.y).toBeLessThanOrEqual(touchPoint.y);
    expect(result.secondaryRects).toHaveLength(1);
    expect(result.secondaryRects[0].y).toBe(result.primaryRect.y);
    expect(circleClearance(result.secondaryRects[0], touchPoint)).toBeLessThan(0);
  });

  it("scores impossible corners instead of choosing only from the touch half", () => {
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, safeArea: { ...viewport.safeArea, left: 100 } },
      touchPoint: { x: 210, y: 30 },
      primarySize: { width: 248, height: 700 },
    });
    expect(result.bestEffortPrimaryOverlap).toBe(true);
    expect(result.orientation).toBe("primary-right");
  });

  it("places desktop InfoCards beside their source at every vertical position", () => {
    const desktop = { ...base, viewport: { ...viewport, layout: "desktop" as const, width: 1200 }, reason: "hover" as const, touchPoint: undefined, sourceRect: { x: 400, y: 500, width: 100, height: 80 } };
    for (const input of [desktop, { ...desktop, sourceRect: { x: 400, y: 20, width: 100, height: 80 } }]) {
      const result = selectRevealPlacement(input);
      expect(result.family).toBe("desktop-side-right");
      expect(result.primaryRect.x).toBeGreaterThanOrEqual(
        input.sourceRect.x + input.sourceRect.width + 14,
      );
    }
  });

  it("keeps the one-off Augury InfoCard centered above its offer", () => {
    const sourceRect = { x: 400, y: 500, width: 300, height: 300 };
    const result = selectRevealPlacement({
      ...base,
      viewport: {
        ...viewport,
        layout: "desktop",
        width: 1200,
        height: 900,
        safeArea: { top: 0, right: 0, bottom: 0, left: 0 },
      },
      reason: "hover",
      touchPoint: undefined,
      placementException: "augury-offer-above-source",
      sourceRect,
      primarySize: { width: 248, height: 100 },
    });

    expect(result.family).toBe("desktop-augury-above-source");
    expect(result.primaryRect.x + result.primaryRect.width / 2).toBe(
      sourceRect.x + sourceRect.width / 2,
    );
    expect(result.primaryRect.y + result.primaryRect.height).toBe(
      sourceRect.y - 14,
    );
    expect(result.bestEffortPrimaryOverlap).toBe(false);
  });

  it("places only a complete leading secondary prefix beside the desktop primary", () => {
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, layout: "desktop", width: 1200, height: 900 },
      reason: "hover",
      touchPoint: undefined,
      sourceRect: { x: 500, y: 600, width: 80, height: 60 },
      primarySize: { width: 248, height: 180 },
      secondarySizes: [{ width: 248, height: 200 }, { width: 248, height: 200 }],
    });
    expect(result.family).toBe("desktop-side-right");
    expect(result.secondaryRects).toHaveLength(1);
    expect(result.primaryRect.y).toBe(600);
    expect(result.secondaryRects[0].y).toBe(600);
    expect(result.secondaryRects[0].x).toBe(
      result.primaryRect.x + result.primaryRect.width + 10,
    );
  });

  it("keeps a lone desktop primary beside the source when a secondary cannot fit", () => {
    const sourceRect = { x: 500, y: 700, width: 100, height: 60 };
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, layout: "desktop", width: 1200, height: 900 },
      reason: "hover",
      touchPoint: undefined,
      sourceRect,
      primarySize: { width: 248, height: 180 },
      secondarySizes: [{ width: 248, height: 300 }],
    });
    expect(result.family).toBe("desktop-side-right");
    expect(result.orientation).toBe("primary-left");
    expect(result.secondaryRects).toEqual([]);
    expect(result.primaryRect.x).toBe(sourceRect.x + sourceRect.width + 14);
  });

  it.each([500, 480])("truncates a desktop InfoCard pair that cannot fit the %ipx safe width", (width) => {
    const desktop = { ...base, viewport: { ...viewport, layout: "desktop" as const, width }, reason: "hover" as const, touchPoint: undefined, sourceRect: { x: 190, y: 500, width: 80, height: 60 }, primarySize: { width: 248, height: 180 }, secondarySizes: [{ width: 248, height: 100 }] };
    for (const input of [desktop, { ...desktop, sourceRect: { ...desktop.sourceRect, y: 20 } }]) {
      const result = selectRevealPlacement(input);
      expect(result.secondaryRects).toEqual([]);
      expect(result.primaryRect.x).toBeGreaterThanOrEqual(0);
      expect(result.primaryRect.x + result.primaryRect.width).toBeLessThanOrEqual(width);
    }
  });

  it("uses mobile keyboard placement without a protected circle", () => {
    const result = selectRevealPlacement({ ...base, reason: "focus", touchPoint: undefined, sourceRect: { x: 150, y: 400, width: 90, height: 50 }, secondarySizes: [{ width: 248, height: 100 }] });
    expect(result.family).toBe("mobile-focus-above");
    expect(result.circleClearance).toBeUndefined();
  });

  it("centers a lone mobile-focus primary when the first secondary cannot fit", () => {
    const sourceRect = { x: 150, y: 220, width: 90, height: 50 };
    const result = selectRevealPlacement({
      ...base,
      reason: "focus",
      touchPoint: undefined,
      sourceRect,
      secondarySizes: [{ width: 248, height: 400 }],
    });
    expect(result.family).toBe("mobile-focus-above");
    expect(result.orientation).toBe("primary-left");
    expect(result.secondaryRects).toEqual([]);
    expect(result.primaryRect.x).toBeCloseTo(sourceRect.x + sourceRect.width / 2 - result.primaryRect.width / 2);
  });

  it("does not mark primary overlap when a dropped desktop pair leaves a clear lone primary", () => {
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, layout: "desktop", width: 800, height: 700 },
      reason: "hover",
      touchPoint: undefined,
      sourceRect: { x: 300, y: 20, width: 100, height: 60 },
      primarySize: { width: 248, height: 180 },
      secondarySizes: [{ width: 248, height: 100 }],
    });
    expect(result.family).toBe("desktop-side-right");
    expect(result.secondaryRects).toEqual([]);
    expect(result.primaryRect.x).toBe(414);
    expect(result.bestEffortPrimaryOverlap).toBe(false);
  });

  it("keeps the mobile keyboard primary closest to a right-edge focused source", () => {
    const result = selectRevealPlacement({ ...base, reason: "focus", touchPoint: undefined, sourceRect: { x: 340, y: 650, width: 40, height: 40 }, secondarySizes: [{ width: 248, height: 100 }] });
    expect(result.family).toBe("mobile-focus-above");
    expect(result.orientation).toBe("primary-right");
    expect(result.primaryRect.y + result.primaryRect.height).toBeLessThanOrEqual(650 - 10);
  });

  it("fits the longest complete keyboard prefix above instead of pinning for an over-tall full stack", () => {
    const result = selectRevealPlacement({ ...base, reason: "focus", touchPoint: undefined, sourceRect: { x: 150, y: 300, width: 90, height: 50 }, secondarySizes: [{ width: 248, height: 100 }, { width: 248, height: 400 }] });
    expect(result.family).toBe("mobile-focus-above");
    expect(result.secondaryRects).toHaveLength(1);
    expect(result.primaryRect.y + result.primaryRect.height).toBeLessThanOrEqual(290);
  });

  it("qualifies press-in-place only at 90% of popup width with complete rules", () => {
    expect(selectRevealPlacement({ ...base, primaryKind: "gameCard", sourceRect: { x: 10, y: 200, width: 157.95, height: 240 }, sourceShowsCompleteGameCard: true }).pressInPlace).toBe(true);
    expect(selectRevealPlacement({ ...base, primaryKind: "gameCard", sourceRect: { x: 10, y: 200, width: 157.94, height: 240 }, sourceShowsCompleteGameCard: true }).pressInPlace).toBe(false);
  });

  it("places press-in-place secondaries only on a horizontally safe side", () => {
    const game = { ...base, primaryKind: "gameCard" as const, sourceShowsCompleteGameCard: true, secondarySizes: [{ width: 248, height: 80 }] };
    expect(selectRevealPlacement({ ...game, sourceRect: { x: 10, y: 200, width: 158, height: 240 } }).orientation).toBe("primary-left");
    expect(selectRevealPlacement({ ...game, sourceRect: { x: 220, y: 200, width: 158, height: 240 } }).orientation).toBe("primary-right");
    const neither = selectRevealPlacement({ ...game, viewport: { ...viewport, width: 320, safeArea: { top: 12, right: 20, bottom: 20, left: 20 } }, sourceRect: { x: 81, y: 200, width: 158, height: 240 } });
    expect(neither.secondaryRects).toEqual([]);
  });

  it("maintains geometry invariants across deterministic mobile grids", () => {
    for (const width of [320, 390, 430, 899]) for (const height of [568, 844, 932]) for (const x of [16, width / 2, width - 16]) for (const y of [40, height / 2, height - 20]) {
      const input = { ...base, viewport: { ...viewport, width, height }, touchPoint: { x, y }, secondarySizes: [{ width: 248, height: 80 }] };
      const result = selectRevealPlacement(input);
      expect(result.primaryRect.width).toBe(width * 0.45);
      expect(result.primaryRect.x).toBeGreaterThanOrEqual(0);
      expect(result.primaryRect.x + result.primaryRect.width).toBeLessThanOrEqual(width);
      expect(result.primaryRect.y).toBeLessThanOrEqual(y);
      for (const secondary of result.secondaryRects) {
        const separated = secondary.x >= result.primaryRect.x + result.primaryRect.width || result.primaryRect.x >= secondary.x + secondary.width;
        expect(separated).toBe(true);
      }
    }
  });
});
