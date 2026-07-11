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

  it("uses desktop above-first and right-side fallback families", () => {
    const desktop = { ...base, viewport: { ...viewport, layout: "desktop" as const, width: 1200 }, reason: "hover" as const, touchPoint: undefined, sourceRect: { x: 400, y: 500, width: 100, height: 80 } };
    expect(selectRevealPlacement(desktop).family).toBe("desktop-above");
    expect(selectRevealPlacement({ ...desktop, sourceRect: { x: 400, y: 20, width: 100, height: 80 } }).family).toBe("desktop-side-right");
  });

  it("uses mobile keyboard placement without a protected circle", () => {
    const result = selectRevealPlacement({ ...base, reason: "focus", touchPoint: undefined, sourceRect: { x: 150, y: 400, width: 90, height: 50 }, secondarySizes: [{ width: 248, height: 100 }] });
    expect(result.family).toBe("mobile-focus-above");
    expect(result.circleClearance).toBeUndefined();
  });

  it("qualifies press-in-place only at 90% of popup width with complete rules", () => {
    expect(selectRevealPlacement({ ...base, primaryKind: "gameCard", sourceRect: { x: 10, y: 200, width: 158, height: 240 }, sourceShowsCompleteGameCard: true }).pressInPlace).toBe(true);
    expect(selectRevealPlacement({ ...base, primaryKind: "gameCard", sourceRect: { x: 10, y: 200, width: 157, height: 240 }, sourceShowsCompleteGameCard: true }).pressInPlace).toBe(false);
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
