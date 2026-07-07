// Unit tests for the two pieces of real logic in InfoCard's press-reveal
// engine — factored into pure functions so they can be verified directly
// without mounting React or driving a live pointer stream.
//
//   1. isHold(downT, upT, clickWindow) — the tap-vs-hold discriminator.
//      A press released WITHIN the click window is a TAP (the child's onClick
//      is allowed to fire); a press that OUTLASTS the window is a HOLD (reveal
//      only, the click is swallowed on touch). Bug class guarded: a regression
//      that makes every tap open the popover, or every hold fire a click.
//
//   2. computePopoverPosition(anchor, width, height, gap, edge) — the on-screen
//      clamp math. Given an anchor rect (in stage-native px, carrying the
//      viewport w/h), a card size, a uniform gap and a screen inset, the
//      popover is placed a uniform `gap` from the anchor and clamped fully on
//      screen. Bug class guarded: a popover clipped off any viewport edge near
//      a corner/edge anchor.

import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { glassSurfaceStyle } from "../controls/glass-surface";
import {
  CLICK_WINDOW,
  computePopoverPosition,
  EDGE,
  FINGER_RADIUS,
  GAP,
  InfoCard,
  isHold,
  type AnchorRect,
} from "./InfoCard";

describe("InfoCard shell treatment", () => {
  it("uses the shared liquid-glass material at the fixed fill opacity", () => {
    const html = renderToStaticMarkup(
      React.createElement(InfoCard, { title: "Essence" }),
    );
    const glass = glassSurfaceStyle();

    expect(html).toContain("rgba(18,14,28,0.5)");
    expect(html).toContain(
      `-webkit-backdrop-filter:${String(glass.WebkitBackdropFilter)}`,
    );
    expect(html).toContain(`backdrop-filter:${String(glass.backdropFilter)}`);
    expect(html).toContain(`box-shadow:${String(glass.boxShadow)}`);
  });

  it("keeps the portal wrapper out of opacity and transform animation layers", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        InfoCard.PressPopover,
        { anchor: { x: 100, top: 100, bottom: 140, w: 390, h: 844 } },
        React.createElement(InfoCard, { title: "Essence" }),
      ),
    );

    expect(html).toContain("visibility:hidden");
    expect(html).not.toContain("opacity:");
    expect(html).not.toContain("animation:");
    expect(html).not.toContain("transform:");
  });
});

describe("isHold — tap vs hold discrimination", () => {
  const W = CLICK_WINDOW; // the engine default click window (ms)

  it("treats an instant press/release as a TAP", () => {
    expect(isHold(1000, 1000, W)).toBe(false);
  });

  it("treats a release strictly within the click window as a TAP", () => {
    expect(isHold(1000, 1000 + (W - 1), W)).toBe(false);
    expect(isHold(1000, 1000 + 1, W)).toBe(false);
  });

  it("treats a release AT the click window boundary as a HOLD", () => {
    // `>= clickWindow` is a hold — the window is the tap's upper bound.
    expect(isHold(1000, 1000 + W, W)).toBe(true);
  });

  it("treats a release well past the click window as a HOLD", () => {
    expect(isHold(1000, 1000 + W + 500, W)).toBe(true);
  });

  it("honors a custom click window", () => {
    expect(isHold(0, 149, 150)).toBe(false);
    expect(isHold(0, 150, 150)).toBe(true);
  });
});

describe("computePopoverPosition — on-screen clamp", () => {
  const WIDTH = 248; // CARD_W
  const HEIGHT = 120; // a representative measured card height
  const VP_W = 390; // device viewport
  const VP_H = 844;

  function anchor(partial: Partial<AnchorRect>): AnchorRect {
    return { x: 195, top: 400, bottom: 440, w: VP_W, h: VP_H, ...partial };
  }

  function assertFullyOnScreen(
    pos: { left: number; top: number },
    width: number,
    height: number,
  ): void {
    expect(pos.left).toBeGreaterThanOrEqual(EDGE);
    expect(pos.left + width).toBeLessThanOrEqual(VP_W - EDGE);
    expect(pos.top).toBeGreaterThanOrEqual(EDGE);
    expect(pos.top + height).toBeLessThanOrEqual(VP_H - EDGE);
  }

  it("places the card a uniform gap ABOVE an anchor with room above", () => {
    const pos = computePopoverPosition(
      anchor({ top: 400, bottom: 440 }),
      WIDTH,
      HEIGHT,
      GAP,
      EDGE,
    );
    // card bottom sits exactly GAP above the anchor top
    expect(pos.top + HEIGHT + GAP).toBe(400);
    assertFullyOnScreen(pos, WIDTH, HEIGHT);
  });

  it("pins ABOVE at the top inset rather than flipping below when it misses the full gap", () => {
    // The card doesn't fit above at the full uniform gap (obstacle top 140,
    // card 120 + gap 14 + edge 12 = 146 > 140), but it DOES clear the obstacle
    // pinned to the top inset (edge 12 + height 120 = 132 <= 140). Above is
    // strongly preferred, so it pins to the top rather than dropping below.
    const pos = computePopoverPosition(
      anchor({ top: 140, bottom: 180 }),
      WIDTH,
      HEIGHT,
      GAP,
      EDGE,
    );
    expect(pos.top).toBe(EDGE);
    // Its bottom stays clear of the anchor top — it is genuinely above the press.
    expect(pos.top + HEIGHT).toBeLessThanOrEqual(140);
    assertFullyOnScreen(pos, WIDTH, HEIGHT);
  });

  it("flips BELOW a top-edge anchor with no room above, keeping the gap", () => {
    const pos = computePopoverPosition(
      anchor({ top: 20, bottom: 60 }),
      WIDTH,
      HEIGHT,
      GAP,
      EDGE,
    );
    // card top sits exactly GAP below the anchor bottom
    expect(pos.top).toBe(60 + GAP);
    assertFullyOnScreen(pos, WIDTH, HEIGHT);
  });

  it("clamps a left-edge anchor to the screen inset (not off-screen)", () => {
    const pos = computePopoverPosition(
      anchor({ x: 8 }),
      WIDTH,
      HEIGHT,
      GAP,
      EDGE,
    );
    expect(pos.left).toBe(EDGE);
    assertFullyOnScreen(pos, WIDTH, HEIGHT);
  });

  it("clamps a right-edge anchor so the card never clips off the right", () => {
    const pos = computePopoverPosition(
      anchor({ x: 384 }),
      WIDTH,
      HEIGHT,
      GAP,
      EDGE,
    );
    expect(pos.left + WIDTH).toBeLessThanOrEqual(VP_W - EDGE);
    assertFullyOnScreen(pos, WIDTH, HEIGHT);
  });

  it("keeps a bottom-edge anchor on-screen (clamped into view)", () => {
    const pos = computePopoverPosition(
      anchor({ top: 800, bottom: 840 }),
      WIDTH,
      HEIGHT,
      GAP,
      EDGE,
    );
    assertFullyOnScreen(pos, WIDTH, HEIGHT);
  });

  it("stays fully on-screen for a sweep of anchor positions", () => {
    for (let x = 0; x <= VP_W; x += 13) {
      for (let y = 0; y <= VP_H; y += 41) {
        const pos = computePopoverPosition(
          anchor({ x, top: y, bottom: y + 40 }),
          WIDTH,
          HEIGHT,
          GAP,
          EDGE,
        );
        assertFullyOnScreen(pos, WIDTH, HEIGHT);
      }
    }
  });

  it("keeps the fingertip disc clear when the press lands near a large trigger's top edge", () => {
    // A big node (200px) pressed near its TOP edge: the finger disc pokes above
    // the node's top, so the card placed above must clear the disc, not just the
    // node box. Without the press point it would sit GAP above the node top and
    // overlap the finger.
    const big = anchor({ top: 300, bottom: 500, pointerY: 312 });
    const pos = computePopoverPosition(big, WIDTH, HEIGHT, GAP, EDGE);
    // The card's bottom clears the top of the finger disc (pointerY - radius) by
    // at least the gap.
    expect(pos.top + HEIGHT).toBeLessThanOrEqual(312 - FINGER_RADIUS - GAP + 0.001);
    assertFullyOnScreen(pos, WIDTH, HEIGHT);
  });

  it("keeps the fingertip disc clear when the card flips below the press point", () => {
    // A top-edge node with no room above flips below; the card top must clear the
    // BOTTOM of the finger disc, so a press near the node's low edge still leaves
    // the finger uncovered.
    const near = anchor({ top: 20, bottom: 120, pointerY: 118 });
    const pos = computePopoverPosition(near, WIDTH, HEIGHT, GAP, EDGE);
    expect(pos.top).toBeGreaterThanOrEqual(118 + FINGER_RADIUS + GAP - 0.001);
    assertFullyOnScreen(pos, WIDTH, HEIGHT);
  });

  it("ignores the press point on a fine-pointer hover (no pointerY)", () => {
    // Without pointerY the placement is anchor-only — identical to the hover
    // path, so a mouse hover is never pushed away by a phantom finger.
    const withPointer = computePopoverPosition(
      anchor({ top: 400, bottom: 440, pointerY: 402 }),
      WIDTH,
      HEIGHT,
      GAP,
      EDGE,
    );
    const withoutPointer = computePopoverPosition(
      anchor({ top: 400, bottom: 440 }),
      WIDTH,
      HEIGHT,
      GAP,
      EDGE,
    );
    // The finger disc (radius 18) pokes above top=400, so the pointer case sits
    // strictly higher than the anchor-only case.
    expect(withPointer.top).toBeLessThan(withoutPointer.top);
  });

  it("pins an oversized card to the top-left inset rather than clipping wildly", () => {
    // A card larger than the viewport can't satisfy every edge; the clamp
    // pins it to the leading inset so at least the title/corner is reachable.
    const pos = computePopoverPosition(
      anchor({ x: 195, top: 400, bottom: 440 }),
      VP_W + 40, // wider than the screen
      VP_H + 60, // taller than the screen
      GAP,
      EDGE,
    );
    expect(pos.left).toBe(EDGE);
    expect(pos.top).toBe(EDGE);
  });
});
