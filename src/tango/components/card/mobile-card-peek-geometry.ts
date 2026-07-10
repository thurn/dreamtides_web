// Pure geometry for the mobile deck viewer's press-and-hold zoom.
//
// When a player presses a card in the 4-across grid, a large, fully legible
// copy appears instantly. Its whole box stays clear of a 36px-radius circle at
// the actual touch point. Placement first moves upward; only when the full card
// cannot fit above the circle does it move left or right. It never moves down.
//
// The finger is modelled as a circle of radius `FINGER_RADIUS_PX` around the
// touch point. `computePeekBox` guarantees the whole enlarged card never
// intersects that circle, by construction:
//
//   - First the card sits just high enough that its bottom edge clears the top
//     of the circle, centered on the actual touch x-coordinate.
//   - When it cannot fit above the circle, it stays at the physical safe top
//     and clears sideways, shrinking only if the roomier side requires it.
//
// Kept side-effect-free and framework-free so the clearance rule — the hard
// part of this screen — is unit-tested, and independently proven over a full
// sweep of touch points by scripts/deck-peek-clearance-analysis.mjs.

/** A viewport-space rectangle (CSS `position: fixed` coordinates). */
export interface PeekRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** The jointly packed primary card and supplemental definition column. */
export interface SupplementalPeekLayout {
  /** Horizontal position for the enlarged card after pair packing. */
  primaryLeft: number;
  /** Position and reading-order side for the definition column. */
  supplemental: {
    left: number;
    top: number;
    width: number;
    side: "left" | "right";
  };
}

/**
 * Radius (px) of the protected circle centered on the actual touch point.
 * The enlarged card never intersects this circle; supplemental definition
 * cards are allowed to cross it.
 */
export const FINGER_RADIUS_PX = 36;

/**
 * Widest the enlarged card is ever drawn (px). At this width a `large` card's
 * rules text is at full scale, so nothing is gained by going wider. Roomy
 * viewports render at this cap; tighter ones shrink to keep the finger clear.
 */
export const PEEK_MAX_WIDTH_PX = 220;

/**
 * Fraction of the card height, measured from the top, at which the rules-text
 * band begins. The band runs from here to the card's bottom edge. Set
 * conservatively so it covers the reserved three-line text box (which starts
 * around 0.8 of the height even before its padding), not just the rendered
 * glyphs. This remains useful for diagnostics of the rules region even though
 * placement now protects the whole card.
 */
export const RULES_REGION_TOP_FRACTION = 0.75;

/**
 * Extra clearance (px) kept between the whole card and the touch circle, so
 * the two are visibly apart rather than merely tangent.
 */
export const CLEARANCE_MARGIN_PX = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Inputs to the placement decision, all in viewport pixels. */
export interface PeekLayoutInput {
  /** The visible viewport size. */
  viewport: { width: number; height: number };
  /** Physical top safe-area inset to preserve. */
  safeTop: number;
  /** Bottom safe-area inset to keep the card clear of (home indicator). */
  safeBottom: number;
  /** Horizontal margin kept on each side of the enlarged card. */
  sideMargin: number;
  /** The card's width-to-height ratio (5/7 for a Dreamtides card). */
  aspect: number;
  /** The width the card is drawn at, from {@link peekWidthForViewport}. */
  width: number;
  /** The finger's touch point (its `pointerdown` client coordinates). */
  finger: { x: number; y: number };
}

/**
 * The largest card width (px) that still fits entirely beside a finger pressing
 * the most central column of the grid, capped at {@link PEEK_MAX_WIDTH_PX}.
 *
 * A finger near the horizontal center of the screen is the hardest to clear:
 * the enlarged card, thrown to one side, must fit between that finger's circle
 * and the screen edge. This returns the width at which even the most central
 * column a finger can land on is cleared, so the enlargement is drawn as large
 * as legibility wants and no larger than the clearance allows.
 */
export function peekWidthForViewport(input: {
  viewportWidth: number;
  sideMargin: number;
  columns: number;
  columnGap: number;
  fingerRadius?: number;
  maxWidth?: number;
}): number {
  const {
    viewportWidth,
    sideMargin,
    columns,
    columnGap,
    fingerRadius = FINGER_RADIUS_PX,
    maxWidth = PEEK_MAX_WIDTH_PX,
  } = input;

  const gridWidth = viewportWidth - sideMargin * 2;
  const tileWidth = (gridWidth - columnGap * (columns - 1)) / columns;

  // The clearance a finger at column center `cx` leaves for a card thrown to its
  // roomier side: the wider of the gaps between the finger's circle and the two
  // screen margins. The binding column is the one whose best side is tightest.
  let smallestClearance = Infinity;
  for (let i = 0; i < columns; i++) {
    const cx = sideMargin + i * (tileWidth + columnGap) + tileWidth / 2;
    const roomRight = viewportWidth - sideMargin - (cx + fingerRadius);
    const roomLeft = cx - fingerRadius - sideMargin;
    smallestClearance = Math.min(
      smallestClearance,
      Math.max(roomLeft, roomRight),
    );
  }

  return Math.max(
    0,
    Math.min(maxWidth, smallestClearance - CLEARANCE_MARGIN_PX),
  );
}

/**
 * Places the enlarged card outside the protected touch circle. The full-size
 * card first moves straight up, centered on the touch. If it cannot fit above
 * the circle without crossing the top safe area, it stays at the safe top and
 * moves wholly to the roomier horizontal side. The horizontal fallback may
 * shrink just enough to fit; no branch places the card below the touch.
 */
export function computePeekBox(input: PeekLayoutInput): PeekRect {
  const {
    viewport,
    safeTop,
    safeBottom,
    sideMargin,
    aspect,
    finger,
  } = input;

  const availableWidth = Math.max(0, viewport.width - sideMargin * 2);
  let width = Math.min(input.width, availableWidth);
  let height = width / aspect;

  const minLeft = sideMargin;
  const minTop = safeTop;
  let maxLeft = viewport.width - sideMargin - width;
  let maxTop = viewport.height - safeBottom - height;

  // The lowest top at which the whole card (its bottom-anchored rules band, so
  // `top + height`) still clears the top of the finger circle by the margin.
  const topClearingFinger =
    finger.y - FINGER_RADIUS_PX - CLEARANCE_MARGIN_PX - height;

  let top: number;
  let left: number;
  if (topClearingFinger >= minTop) {
    // First choice: move the whole card up until its bottom clears the circle.
    top = clamp(topClearingFinger, minTop, maxTop);
    left = clamp(finger.x - width / 2, minLeft, maxLeft);
  } else {
    // Second choice: keep the card at the top safe area, then move it wholly to
    // the roomier side. Shrink only when the preferred width cannot fit there.
    const roomRight =
      viewport.width - sideMargin - (finger.x + FINGER_RADIUS_PX);
    const roomLeft = finger.x - FINGER_RADIUS_PX - sideMargin;
    const useRight = roomRight >= roomLeft;
    const horizontalRoom = Math.max(roomLeft, roomRight);
    width = Math.min(width, Math.max(0, horizontalRoom - CLEARANCE_MARGIN_PX));
    height = width / aspect;
    maxLeft = viewport.width - sideMargin - width;
    maxTop = viewport.height - safeBottom - height;
    top = clamp(minTop, minTop, maxTop);
    left = useRight ? maxLeft : minLeft;
    left = clamp(left, minLeft, maxLeft);
  }

  return { left, top, width, height };
}

/**
 * Packs the enlarged card and its glossary column as one non-overlapping unit.
 *
 * The enlarged card's placement is never changed here: its touch-circle
 * clearance is authoritative. Definitions use whichever side already fits and
 * otherwise fall below the card, where they may cross the protected circle.
 *
 * When neither side fits, definitions use a below-card fallback while the
 * primary card keeps its touch-circle clearance.
 */
export function computeSupplementalPeekLayout(input: {
  box: PeekRect;
  viewportWidth: number;
  supplementalWidth: number;
  gap: number;
  edge: number;
}): SupplementalPeekLayout {
  const { box, viewportWidth, supplementalWidth, gap, edge } = input;

  const rightLeft = box.left + box.width + gap;
  if (rightLeft + supplementalWidth <= viewportWidth - edge) {
    return {
      primaryLeft: box.left,
      supplemental: {
        left: rightLeft,
        top: box.top,
        width: supplementalWidth,
        side: "right",
      },
    };
  }

  const leftLeft = box.left - gap - supplementalWidth;
  if (leftLeft >= edge) {
    return {
      primaryLeft: box.left,
      supplemental: {
        left: leftLeft,
        top: box.top,
        width: supplementalWidth,
        side: "left",
      },
    };
  }

  return {
    primaryLeft: box.left,
    supplemental: {
      left: clamp(box.left, edge, viewportWidth - edge - supplementalWidth),
      top: box.top + box.height + gap,
      width: supplementalWidth,
      side: "right",
    },
  };
}

/**
 * The rules-text band of a placed card: the lower {@link RULES_REGION_TOP_FRACTION}
 * of its box, which the placement keeps clear of the finger circle.
 */
export function rulesRegionOfPeek(box: PeekRect): PeekRect {
  const top = box.top + RULES_REGION_TOP_FRACTION * box.height;
  return {
    left: box.left,
    top,
    width: box.width,
    height: box.top + box.height - top,
  };
}

/**
 * Signed gap (px) between a circle and a rectangle: the distance from the
 * circle's edge to the nearest point of the rectangle. Non-negative means they
 * do not overlap; the returned value is how much clearance (or, if negative,
 * penetration) there is.
 */
export function circleRectGap(
  cx: number,
  cy: number,
  radius: number,
  rect: PeekRect,
): number {
  const nearestX = clamp(cx, rect.left, rect.left + rect.width);
  const nearestY = clamp(cy, rect.top, rect.top + rect.height);
  return Math.hypot(cx - nearestX, cy - nearestY) - radius;
}
