import { describe, expect, it } from "vitest";
import { fitSecondaryPrefix, selectRevealPlacement, type RevealPlacementInput } from "./geometry";

const viewport = { layout: "mobile", width: 390, height: 844, offsetLeft: 0, offsetTop: 0, safeArea: { top: 12, right: 0, bottom: 20, left: 0 } } as const;
const base: RevealPlacementInput = {
  viewport, reason: "press", primaryKind: "infoCard", sourceRect: { x: 170, y: 650, width: 50, height: 50 },
  touchPoint: { x: 195, y: 675 }, primarySize: { width: 248, height: 190 }, secondarySizes: [], sourceShowsCompleteGameCard: false,
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

  it("uses desktop above-first and right-side fallback families", () => {
    const desktop = { ...base, viewport: { ...viewport, layout: "desktop" as const, width: 1200 }, reason: "hover" as const, touchPoint: undefined, sourceRect: { x: 400, y: 500, width: 100, height: 80 } };
    expect(selectRevealPlacement(desktop).family).toBe("desktop-above");
    expect(selectRevealPlacement({ ...desktop, sourceRect: { x: 400, y: 20, width: 100, height: 80 } }).family).toBe("desktop-side-right");
  });

  it("places only a complete leading secondary prefix inside the full desktop group above the source", () => {
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, layout: "desktop", width: 1200, height: 900 },
      reason: "hover",
      touchPoint: undefined,
      sourceRect: { x: 500, y: 600, width: 80, height: 60 },
      primarySize: { width: 248, height: 180 },
      secondarySizes: [{ width: 248, height: 400 }, { width: 248, height: 200 }],
    });
    expect(result.family).toBe("desktop-above");
    expect(result.secondaryRects).toHaveLength(1);
    expect(result.primaryRect.y).toBe(186);
    expect(result.secondaryRects[0].y).toBe(186);
    expect(result.secondaryRects[0].y + result.secondaryRects[0].height).toBe(586);
  });

  it("centers a lone desktop primary when the first secondary cannot fit above", () => {
    const sourceRect = { x: 500, y: 250, width: 100, height: 60 };
    const result = selectRevealPlacement({
      ...base,
      viewport: { ...viewport, layout: "desktop", width: 1200, height: 900 },
      reason: "hover",
      touchPoint: undefined,
      sourceRect,
      primarySize: { width: 248, height: 180 },
      secondarySizes: [{ width: 248, height: 300 }],
    });
    expect(result.family).toBe("desktop-above");
    expect(result.orientation).toBe("primary-left");
    expect(result.secondaryRects).toEqual([]);
    expect(result.primaryRect.x).toBe(sourceRect.x + sourceRect.width / 2 - 124);
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
