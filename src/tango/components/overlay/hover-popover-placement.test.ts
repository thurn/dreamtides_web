import { describe, it, expect } from "vitest";
import {
  computePopoverPlacement,
  POPOVER_GAP_PX,
  POPOVER_VIEWPORT_PADDING_PX,
} from "./hover-popover-placement";

/**
 * Tests for the viewport-aware placement math. Covers the cases reported
 * in backlog task 006 (right-edge card-text term and the
 * draft-deck-viewer sidebar that clips at the top), plus the symmetric
 * cases on the other edges so the helper remains correct as new screens
 * pick it up.
 */

const VIEWPORT = { width: 1280, height: 800 } as const;

function anchor({
  left,
  top,
  width,
  height,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
}) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
  };
}

describe("computePopoverPlacement (top-preferred)", () => {
  it("centers the popover above an anchor with plenty of room", () => {
    const result = computePopoverPlacement({
      anchor: anchor({ left: 400, top: 400, width: 100, height: 20 }),
      popoverWidth: 260,
      popoverHeight: 80,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "top",
    });
    expect(result.side).toBe("top");
    // Centered on anchor center (450) minus half popover width (130).
    expect(result.left).toBe(320);
    // Above the anchor with the standard 8px gap.
    expect(result.top).toBe(400 - POPOVER_GAP_PX - 80);
  });

  it("flips to bottom when the anchor sits flush against the top edge", () => {
    const result = computePopoverPlacement({
      // Anchor at top of viewport. No room above for an 80px popover.
      anchor: anchor({ left: 400, top: 8, width: 100, height: 20 }),
      popoverWidth: 260,
      popoverHeight: 80,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "top",
    });
    expect(result.side).toBe("bottom");
    expect(result.top).toBe(8 + 20 + POPOVER_GAP_PX);
  });

  it("shifts horizontally so a top-anchored popover near the right edge stays on-screen", () => {
    // Anchor near the right edge: centering a 260px popover on it would
    // make the popover extend past the viewport. The helper should shift
    // it leftward so its right edge stays inside the viewport.
    const result = computePopoverPlacement({
      anchor: anchor({ left: 1200, top: 400, width: 60, height: 20 }),
      popoverWidth: 260,
      popoverHeight: 80,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "top",
    });
    expect(result.side).toBe("top");
    const expectedMaxLeft =
      VIEWPORT.width - 260 - POPOVER_VIEWPORT_PADDING_PX;
    expect(result.left).toBe(expectedMaxLeft);
    expect(result.left + 260).toBeLessThanOrEqual(
      VIEWPORT.width - POPOVER_VIEWPORT_PADDING_PX,
    );
  });

  it("shifts horizontally so a top-anchored popover near the left edge stays on-screen", () => {
    const result = computePopoverPlacement({
      anchor: anchor({ left: 8, top: 400, width: 40, height: 20 }),
      popoverWidth: 260,
      popoverHeight: 80,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "top",
    });
    expect(result.side).toBe("top");
    expect(result.left).toBe(POPOVER_VIEWPORT_PADDING_PX);
  });

  it("picks the side with more room when neither vertical side fully fits", () => {
    // Anchor in a viewport so short that 200px does not fit above or below.
    const result = computePopoverPlacement({
      anchor: anchor({ left: 400, top: 100, width: 100, height: 50 }),
      popoverWidth: 100,
      popoverHeight: 200,
      viewportWidth: 1280,
      viewportHeight: 240,
      preferred: "top",
    });
    // Below the anchor has 240 - 150 - 8 = 82px; above has 100 - 8 = 92px.
    expect(result.side).toBe("top");
  });
});

describe("computePopoverPlacement (left-preferred)", () => {
  it("places the popover to the left of an anchor with room on that side", () => {
    const result = computePopoverPlacement({
      // Right-side deck sidebar: anchor on the right of the screen.
      anchor: anchor({ left: 1000, top: 400, width: 200, height: 40 }),
      popoverWidth: 240,
      popoverHeight: 360,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "left",
    });
    expect(result.side).toBe("left");
    expect(result.left).toBe(1000 - POPOVER_GAP_PX - 240);
    // Centered vertically on the anchor.
    expect(result.top).toBe(420 - 180);
  });

  it("clamps a left-anchored popover that would overflow above the viewport", () => {
    // Backlog 006 reproduction: deck viewer top row. Anchor at y=57 means
    // a 360px popover centered on it would overflow above (top would be
    // 57 + 20 - 180 = -103). The clamp keeps it inside.
    const result = computePopoverPlacement({
      anchor: anchor({ left: 970, top: 57, width: 300, height: 36 }),
      popoverWidth: 240,
      popoverHeight: 360,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "left",
    });
    expect(result.side).toBe("left");
    expect(result.top).toBe(POPOVER_VIEWPORT_PADDING_PX);
    expect(result.top + 360).toBeLessThanOrEqual(VIEWPORT.height);
  });

  it("clamps a left-anchored popover that would overflow below the viewport", () => {
    const result = computePopoverPlacement({
      anchor: anchor({ left: 970, top: 760, width: 300, height: 36 }),
      popoverWidth: 240,
      popoverHeight: 360,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "left",
    });
    expect(result.side).toBe("left");
    const expectedMaxTop =
      VIEWPORT.height - 360 - POPOVER_VIEWPORT_PADDING_PX;
    expect(result.top).toBe(expectedMaxTop);
  });

  it("flips to right when the anchor sits flush against the left edge", () => {
    // Anchor close to left edge; a 240px popover does not fit on the left.
    const result = computePopoverPlacement({
      anchor: anchor({ left: 20, top: 400, width: 100, height: 40 }),
      popoverWidth: 240,
      popoverHeight: 360,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "left",
    });
    expect(result.side).toBe("right");
    expect(result.left).toBe(120 + POPOVER_GAP_PX);
  });
});

describe("computePopoverPlacement (right-preferred top-aligned)", () => {
  it("places a card-style side popover to the right with its top pinned to the anchor", () => {
    const result = computePopoverPlacement({
      anchor: anchor({ left: 400, top: 240, width: 200, height: 300 }),
      popoverWidth: 240,
      popoverHeight: 360,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "right",
      crossAxisAlign: "start",
    });
    expect(result.side).toBe("right");
    expect(result.left).toBe(600 + POPOVER_GAP_PX);
    expect(result.top).toBe(240);
  });

  it("flips a top-aligned card-style popover left when the right side lacks room", () => {
    const result = computePopoverPlacement({
      anchor: anchor({ left: 1040, top: 180, width: 200, height: 300 }),
      popoverWidth: 240,
      popoverHeight: 360,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "right",
      crossAxisAlign: "start",
    });
    expect(result.side).toBe("left");
    expect(result.left).toBe(1040 - POPOVER_GAP_PX - 240);
    expect(result.top).toBe(180);
  });

  it("only moves top-aligned side popovers vertically when the viewport requires it", () => {
    const result = computePopoverPlacement({
      anchor: anchor({ left: 400, top: 620, width: 200, height: 160 }),
      popoverWidth: 240,
      popoverHeight: 260,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "right",
      crossAxisAlign: "start",
    });
    expect(result.side).toBe("right");
    expect(result.top).toBe(800 - 260 - POPOVER_VIEWPORT_PADDING_PX);
    expect(result.top).toBeLessThan(620);
  });
});

describe("computePopoverPlacement (determinism)", () => {
  it("returns the same placement for identical inputs across invocations", () => {
    const args = {
      anchor: anchor({ left: 1200, top: 400, width: 60, height: 20 }),
      popoverWidth: 260,
      popoverHeight: 80,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "top" as const,
    };
    const a = computePopoverPlacement(args);
    const b = computePopoverPlacement(args);
    expect(a).toEqual(b);
  });

  it("picks a non-default side when the preferred side does not fit", () => {
    // Documents the core promise of the helper: when the popover cannot
    // fit on the preferred side, the helper picks the opposite side
    // rather than letting the popover clip off-screen.
    const top = computePopoverPlacement({
      anchor: anchor({ left: 400, top: 2, width: 100, height: 20 }),
      popoverWidth: 260,
      popoverHeight: 80,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "top",
    });
    expect(top.side).not.toBe("top");

    const left = computePopoverPlacement({
      anchor: anchor({ left: 2, top: 400, width: 60, height: 40 }),
      popoverWidth: 240,
      popoverHeight: 360,
      viewportWidth: VIEWPORT.width,
      viewportHeight: VIEWPORT.height,
      preferred: "left",
    });
    expect(left.side).not.toBe("left");
  });
});
