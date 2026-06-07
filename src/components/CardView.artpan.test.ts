import { describe, expect, it } from "vitest";
import { minArtOffsetY } from "./CardView";
import { ART_REGION_ASPECT_RATIO_VALUE } from "./card-aspect";

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
