import { describe, expect, it } from "vitest";
import {
  ART_SAFE_AREA_OVERLAP,
  artPanStep,
  artSafeAreaTarget,
  minArtOffsetY,
  minArtScale,
} from "./CardView";
import {
  ART_EXTENSION_FRACTION,
  ART_REGION_ASPECT_RATIO_VALUE,
} from "./card-aspect";

// `minArtOffsetY` is the up-pan floor that keeps the watermark strip clipped off
// the bottom of every source image from rising into the art region (which would
// expose the fill band above the rules box). The art-crop editor clamps to it
// and the data-fix script pulls over-panned crops back to it.

// Aspect of the standard 462x280 card art (landscape, wider than the art region).
const WIDE_ASPECT = 462 / 280;

describe("minArtOffsetY", () => {
  it("forbids meaningful up-pan at the default zoom of a wide image", () => {
    // At scale 1.17 the usable art only just covers the seam, so the floor sits
    // slightly *above* centre: panning up at all would expose the band.
    const min = minArtOffsetY(WIDE_ASPECT, 1.17);
    expect(min).toBeGreaterThan(0);
    expect(min).toBeCloseTo(0.032, 2);
  });

  it("grants more up-pan room as zoom increases", () => {
    // More zoom = more overscan = the watermark stays clear further up, so the
    // floor drops below centre.
    const min = minArtOffsetY(WIDE_ASPECT, 2);
    expect(min).toBeLessThan(0);
    expect(min).toBeCloseTo(-0.7, 2);
  });

  it("never returns a value outside the [-1, 1] pan range", () => {
    for (const scale of [1, 1.05, 1.17, 1.5, 3, 5]) {
      const min = minArtOffsetY(WIDE_ASPECT, scale);
      expect(min).toBeGreaterThanOrEqual(-1);
      expect(min).toBeLessThanOrEqual(1);
    }
  });

  it("returns 0 when there is no overscan to pan within", () => {
    // A source exactly as wide as the art region at scale 1 has renderH === 1:
    // no overscan, so there is no pan to bound.
    expect(minArtOffsetY(ART_REGION_ASPECT_RATIO_VALUE, 1)).toBe(0);
  });
});

const ART_SOURCE_BOTTOM_CROP = 21 / 280;

// Reconstruct the watermark-clipped art bottom (as a fraction of card height) for
// a crop at a given pan/zoom, mirroring the placement math in
// `artImageStyleExtended` / `artCoverMetrics`. The lowest the bottom can sit
// (greatest coverage) is at the down-most pan, which is what `minArtScale` and
// the safe-area target are defined against.
function visibleBottomAtMaxDownPan(imageAspect: number, scale: number): number {
  const ratio = imageAspect / ART_REGION_ASPECT_RATIO_VALUE;
  const coverH = ratio >= 1 ? 1 : 1 / ratio;
  const region = 1 - ART_EXTENSION_FRACTION;
  const renderH = scale * coverH;
  return renderH * region * (1 - ART_SOURCE_BOTTOM_CROP);
}

describe("artSafeAreaTarget", () => {
  it("falls back to the art-region seam when the box is unmeasured", () => {
    expect(artSafeAreaTarget(null)).toBeCloseTo(1 - ART_EXTENSION_FRACTION, 6);
  });

  it("targets just under the box's first text line when measured", () => {
    expect(artSafeAreaTarget(0.62)).toBeCloseTo(
      0.62 + ART_SAFE_AREA_OVERLAP,
      6,
    );
  });

  it("caps the target just shy of the card bottom", () => {
    expect(artSafeAreaTarget(0.97)).toBeLessThanOrEqual(0.98);
  });
});

describe("minArtScale", () => {
  it("floors zoom so a wide image just covers down to the target", () => {
    // At the floor, the down-most-pan bottom sits exactly on the target.
    const target = artSafeAreaTarget(0.9); // a short, low box
    const floor = minArtScale(WIDE_ASPECT, target);
    expect(visibleBottomAtMaxDownPan(WIDE_ASPECT, floor)).toBeCloseTo(
      target,
      4,
    );
  });

  it("lets a taller box (higher top) zoom out further than a short one", () => {
    const tallBox = minArtScale(WIDE_ASPECT, artSafeAreaTarget(0.62));
    const shortBox = minArtScale(WIDE_ASPECT, artSafeAreaTarget(0.9));
    expect(tallBox).toBeLessThan(shortBox);
  });

  it("never lets the source sit shorter than the art region", () => {
    // A very high target still cannot push the floor below renderH === 1.
    for (const top of [0.4, 0.62, 0.8, 0.9]) {
      const floor = minArtScale(WIDE_ASPECT, artSafeAreaTarget(top));
      expect(floor).toBeGreaterThanOrEqual(1);
    }
  });

  it("floors a narrow source at the width-covering zoom", () => {
    // Narrower than the art region: height is covered well before width, so the
    // floor is the width-covering scale of 1.
    expect(minArtScale(0.6, artSafeAreaTarget(0.9))).toBeCloseTo(1, 4);
  });
});

// Reconstruct the on-screen move (as a fraction of the card) a given per-axis
// offset step produces, mirroring the placement math in `artImageStyleExtended`.
function visualMove(
  step: { x: number; y: number },
  imageAspect: number,
  scale: number,
): { x: number; y: number } {
  const ratio = imageAspect / ART_REGION_ASPECT_RATIO_VALUE;
  const renderW = scale * (ratio >= 1 ? ratio : 1);
  const renderH = scale * (ratio >= 1 ? 1 : 1 / ratio);
  return {
    x: (step.x * (renderW - 1)) / 2,
    y: ((step.y * (renderH - 1)) / 2) * (1 - ART_EXTENSION_FRACTION),
  };
}

describe("artPanStep", () => {
  it("moves the art the same target distance on both axes for a wide source", () => {
    const step = artPanStep(WIDE_ASPECT, 1.17, 0.03);
    // The raw offset steps differ a lot (X has far more pan range than Y)...
    expect(step.x).not.toBeCloseTo(step.y, 2);
    // ...but the resulting on-screen move is ~3% of the card on each axis.
    const move = visualMove(step, WIDE_ASPECT, 1.17);
    expect(move.x).toBeCloseTo(0.03, 4);
    expect(move.y).toBeCloseTo(0.03, 4);
  });

  it("holds the target move steady across zoom levels", () => {
    for (const scale of [1.2, 2, 4]) {
      const move = visualMove(
        artPanStep(WIDE_ASPECT, scale, 0.03),
        WIDE_ASPECT,
        scale,
      );
      expect(move.x).toBeCloseTo(0.03, 4);
      expect(move.y).toBeCloseTo(0.03, 4);
    }
  });

  it("reports 0 on an axis with no overscan to pan within", () => {
    // A source matching the art region's aspect at scale 1 covers it exactly:
    // no overscan on either axis, so neither arrow has anything to move.
    const step = artPanStep(ART_REGION_ASPECT_RATIO_VALUE, 1, 0.03);
    expect(step.x).toBe(0);
    expect(step.y).toBe(0);
  });
});
