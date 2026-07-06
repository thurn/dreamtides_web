// Pure geometry for the mobile deck viewer's press-and-hold zoom.
//
// When a player presses a card in the 4-across grid, a large, fully legible
// copy appears instantly. Its one job is to stay clear of the finger so the
// rules text — which sits at the bottom of the card — is readable while the
// finger is still down. The card therefore JUMPS to the top of the screen and,
// when the finger is high enough that the top-of-screen card would still sit
// under it, SHIFTS to the side of the screen the finger is not on.
//
// The finger is modelled as a circle of radius `FINGER_RADIUS_PX` around the
// touch point. `computePeekBox` guarantees the card's rules-text region never
// intersects that circle, by construction:
//
//   - The card is pinned to the top of the safe area, so its rules-text band
//     lands high on the screen. A finger well above that band (a card near the
//     top) or well below it (a card near the bottom) is already clear
//     vertically — the card stays centered on the finger's column.
//   - Only a finger whose circle overlaps the rules band vertically needs help;
//     there the card is thrown flush to the screen edge away from the finger.
//     For that to actually clear the circle the card must be narrow enough to
//     sit entirely beside the finger, which is what `peekWidthForViewport`
//     guarantees: it caps the card width to what fits beside the most central
//     column a finger can press.
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

/**
 * Radius (px) of the circle the finger is assumed to occlude, centered on the
 * pressed card. Sized to a thumb's contact and to cover the width of a grid
 * tile, so that wherever on the card the finger landed it stays inside this
 * circle; the placement keeps the enlarged card's rules text entirely outside
 * it. Raising it makes the guarantee more conservative (and the enlarged card
 * smaller, via `peekWidthForViewport`).
 */
export const FINGER_RADIUS_PX = 44;

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
 * glyphs, so the clearance guarantee holds for the wordiest card.
 */
export const RULES_REGION_TOP_FRACTION = 0.75;

/**
 * Extra clearance (px) kept between the rules-text band and the finger circle,
 * so the two are visibly apart rather than merely tangent. Applied both when
 * capping the card width and when deciding whether a finger is clear of the
 * rules band vertically, so the guaranteed gap is at least this everywhere.
 */
export const CLEARANCE_MARGIN_PX = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/** Inputs to the placement decision, all in viewport pixels. */
export interface PeekLayoutInput {
  /** The visible viewport size. */
  viewport: { width: number; height: number };
  /** Top safe-area inset to keep the card clear of (status bar / notch). */
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
    smallestClearance = Math.min(smallestClearance, Math.max(roomLeft, roomRight));
  }

  return Math.max(0, Math.min(maxWidth, smallestClearance - CLEARANCE_MARGIN_PX));
}

/**
 * Places the enlarged card at the top of the screen, shifted off the finger.
 *
 * The card is pinned to the top of the safe area. If the finger's circle would
 * overlap the card's rules-text band there, the card is thrown flush to the
 * screen edge away from the finger; otherwise it stays centered on the finger's
 * column. With a width from {@link peekWidthForViewport} the flush placement is
 * always wide enough to leave the finger circle clear of the rules text.
 */
export function computePeekBox(input: PeekLayoutInput): PeekRect {
  const { viewport, safeTop, safeBottom, sideMargin, aspect, finger } = input;

  const availableWidth = Math.max(0, viewport.width - sideMargin * 2);
  const width = Math.min(input.width, availableWidth);
  const height = width / aspect;

  const minLeft = sideMargin;
  const maxLeft = viewport.width - sideMargin - width;
  const minTop = safeTop;
  const maxTop = viewport.height - safeBottom - height;

  // Jump to the top of the safe area — as far from a finger pressing below as
  // the screen allows.
  const top = clamp(minTop, minTop, maxTop);

  const rulesTop = top + RULES_REGION_TOP_FRACTION * height;
  const rulesBottom = top + height;
  // Treat a finger within the clearance margin of the band as overlapping, so
  // near-tangent fingers take the sideways path (which keeps the full margin)
  // rather than the vertical path (which would leave only a hair of gap).
  const fingerOverlapsRules =
    finger.y + FINGER_RADIUS_PX + CLEARANCE_MARGIN_PX > rulesTop &&
    finger.y - FINGER_RADIUS_PX - CLEARANCE_MARGIN_PX < rulesBottom;

  let left: number;
  if (!fingerOverlapsRules) {
    // The finger sits clear of the rules band vertically (a card near the top
    // or bottom of the screen). Keep the card over the finger's column.
    left = clamp(finger.x - width / 2, minLeft, maxLeft);
  } else {
    // The finger is level with the rules text — throw the card to the roomier
    // side so the rules text ends up entirely beside the finger's circle.
    const roomRight = viewport.width - sideMargin - (finger.x + FINGER_RADIUS_PX);
    const roomLeft = finger.x - FINGER_RADIUS_PX - sideMargin;
    left = roomRight >= roomLeft ? maxLeft : minLeft;
    left = clamp(left, minLeft, maxLeft);
  }

  return { left, top, width, height };
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
