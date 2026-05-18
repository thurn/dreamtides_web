/**
 * Pure placement math for `HoverPopover`. Given an anchor rect, a popover
 * size, and the viewport dimensions, decide which side of the anchor the
 * popover sits on and the final `(left, top)` of the popover.
 *
 * Splitting the math out keeps the React component focused on lifecycle and
 * gives us a place to unit-test the viewport-aware behavior without
 * standing up jsdom layout. See `hover-popover-placement.test.ts`.
 *
 * Behavior summary:
 *
 * - `"top"` preferred: place the popover above the anchor, horizontally
 *   centered. Flip to `"bottom"` when the popover would clip off the top
 *   of the viewport and there is more room below. Shift the popover
 *   horizontally so it stays fully inside the viewport.
 * - `"left"` preferred: place the popover to the left of the anchor,
 *   vertically centered. Flip to `"right"` when the popover would clip off
 *   the left edge and there is more room on the right. Shift the popover
 *   vertically so it stays fully inside the viewport.
 *
 * "Flip" is preferred over "shift" along the primary axis so the popover
 * keeps a clear visual relationship with the anchor (above / below the
 * row, or left / right of the rail). "Shift" handles the perpendicular
 * axis so a popover near the top-right corner does not sail off the
 * screen sideways.
 */

/** Gap between the anchor edge and the popover. Matches the visual spec. */
export const POPOVER_GAP_PX = 8;

/**
 * Inner margin from any viewport edge that the popover refuses to cross.
 * Keeps the popover from looking glued to the bezel and matches what
 * floating-ui calls "padding".
 */
export const POPOVER_VIEWPORT_PADDING_PX = 6;

export type PopoverPlacementSide = "top" | "bottom" | "left" | "right";

interface ComputeArgs {
  anchor: { left: number; top: number; right: number; bottom: number };
  popoverWidth: number;
  popoverHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  preferred: "top" | "left";
}

export interface ComputedPlacement {
  left: number;
  top: number;
  side: PopoverPlacementSide;
}

export function computePopoverPlacement(args: ComputeArgs): ComputedPlacement {
  const {
    anchor,
    popoverWidth,
    popoverHeight,
    viewportWidth,
    viewportHeight,
    preferred,
  } = args;

  if (preferred === "top") {
    return placeVertically({
      anchor,
      popoverWidth,
      popoverHeight,
      viewportWidth,
      viewportHeight,
    });
  }
  return placeHorizontally({
    anchor,
    popoverWidth,
    popoverHeight,
    viewportWidth,
    viewportHeight,
  });
}

interface AxisArgs {
  anchor: { left: number; top: number; right: number; bottom: number };
  popoverWidth: number;
  popoverHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * Top-preferred placement: above the anchor, horizontally centered. Flips
 * to below when the top side does not have room.
 */
function placeVertically(args: AxisArgs): ComputedPlacement {
  const {
    anchor,
    popoverWidth,
    popoverHeight,
    viewportWidth,
    viewportHeight,
  } = args;

  const spaceAbove = anchor.top - POPOVER_GAP_PX;
  const spaceBelow = viewportHeight - anchor.bottom - POPOVER_GAP_PX;
  const fitsAbove = spaceAbove >= popoverHeight;
  const fitsBelow = spaceBelow >= popoverHeight;

  let side: PopoverPlacementSide;
  if (fitsAbove) {
    side = "top";
  } else if (fitsBelow) {
    side = "bottom";
  } else {
    // Neither side fits cleanly: pick whichever has more room.
    side = spaceAbove >= spaceBelow ? "top" : "bottom";
  }

  const top =
    side === "top"
      ? anchor.top - POPOVER_GAP_PX - popoverHeight
      : anchor.bottom + POPOVER_GAP_PX;

  const anchorCenterX = (anchor.left + anchor.right) / 2;
  const desiredLeft = anchorCenterX - popoverWidth / 2;
  const left = clampToViewportX(desiredLeft, popoverWidth, viewportWidth);

  return { left, top, side };
}

/**
 * Left-preferred placement: to the left of the anchor, vertically
 * centered. Flips to right when the left side does not have room.
 */
function placeHorizontally(args: AxisArgs): ComputedPlacement {
  const {
    anchor,
    popoverWidth,
    popoverHeight,
    viewportWidth,
    viewportHeight,
  } = args;

  const spaceLeft = anchor.left - POPOVER_GAP_PX;
  const spaceRight = viewportWidth - anchor.right - POPOVER_GAP_PX;
  const fitsLeft = spaceLeft >= popoverWidth;
  const fitsRight = spaceRight >= popoverWidth;

  let side: PopoverPlacementSide;
  if (fitsLeft) {
    side = "left";
  } else if (fitsRight) {
    side = "right";
  } else {
    side = spaceLeft >= spaceRight ? "left" : "right";
  }

  const left =
    side === "left"
      ? anchor.left - POPOVER_GAP_PX - popoverWidth
      : anchor.right + POPOVER_GAP_PX;

  const anchorCenterY = (anchor.top + anchor.bottom) / 2;
  const desiredTop = anchorCenterY - popoverHeight / 2;
  const top = clampToViewportY(desiredTop, popoverHeight, viewportHeight);

  return { left, top, side };
}

function clampToViewportX(
  desiredLeft: number,
  popoverWidth: number,
  viewportWidth: number,
): number {
  const minLeft = POPOVER_VIEWPORT_PADDING_PX;
  const maxLeft = Math.max(
    minLeft,
    viewportWidth - popoverWidth - POPOVER_VIEWPORT_PADDING_PX,
  );
  if (desiredLeft < minLeft) return minLeft;
  if (desiredLeft > maxLeft) return maxLeft;
  return desiredLeft;
}

function clampToViewportY(
  desiredTop: number,
  popoverHeight: number,
  viewportHeight: number,
): number {
  const minTop = POPOVER_VIEWPORT_PADDING_PX;
  const maxTop = Math.max(
    minTop,
    viewportHeight - popoverHeight - POPOVER_VIEWPORT_PADDING_PX,
  );
  if (desiredTop < minTop) return minTop;
  if (desiredTop > maxTop) return maxTop;
  return desiredTop;
}
