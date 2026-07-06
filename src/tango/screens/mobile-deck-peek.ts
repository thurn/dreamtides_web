// Pure geometry for the mobile deck viewer's press-and-hold zoom.
//
// When a player presses and holds a card in the 4-across grid, a large copy of
// that card pops up at ONE fixed, comfortably-readable size — the same size for
// every card, so no two presses disagree on scale. `computePeekBox` decides
// only where that fixed-size card goes:
//
//   - It never moves down. The rules text sits at the bottom of the card, so a
//     card that grew downward would drop its text under the finger.
//   - It generally moves UP: the enlarged card rises out of the tile and sits
//     fully above it, its whole body (art + rules) clear of the finger below.
//   - When the tile is already near the top of the screen (the top third),
//     there is no room to rise, so the card instead shifts sideways — toward
//     whichever side of the screen the finger is NOT on — and otherwise just
//     pops up in place at the larger size.
//
// Kept side-effect-free and framework-free so the placement rule — the hard
// part of this screen — is unit-tested against plain numbers.

/** A viewport-space rectangle (CSS `position: fixed` coordinates). */
export interface PeekRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Inputs to the placement decision, all in viewport pixels. */
export interface PeekLayoutInput {
  /** The pressed tile's on-screen rectangle (its `getBoundingClientRect`). */
  tile: PeekRect;
  /** The visible viewport size. */
  viewport: { width: number; height: number };
  /** Top safe-area inset to keep the card clear of (status bar / notch). */
  safeTop: number;
  /** Bottom safe-area inset to keep the card clear of (home indicator). */
  safeBottom: number;
  /** Empty gap left between the pressed tile and the enlarged card. */
  gap: number;
  /** Horizontal margin kept on each side of the enlarged card. */
  sideMargin: number;
  /** The card's width-to-height ratio (5/7 for a Dreamtides card). */
  aspect: number;
  /**
   * The fixed width the enlarged card is grown to — chosen so its rules text is
   * comfortably readable and no larger. The same for every card so all presses
   * enlarge to a consistent size; only clamped smaller if the viewport is too
   * narrow to hold it inside the side margins.
   */
  targetWidth: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * How close (as a fraction of viewport width) a top-of-screen tile's center may
 * sit to a screen edge before its enlarged card is thrown to the opposite side
 * rather than popped up centered on the tile. Outer-column tiles clear the
 * finger by sliding across; inner tiles have no better side and stay put.
 */
const SIDE_HUG_FRACTION = 0.3;

/**
 * Places the fixed-size enlarged card relative to the pressed tile.
 *
 * The card is always the same size (`targetWidth`, clamped only to fit the
 * viewport width). It rises fully above the tile when there is room; when the
 * tile sits too high for that (roughly the top third of the screen), the card
 * holds at the top of the safe area and shifts horizontally toward the side the
 * finger is not on. It never lands below the tile.
 */
export function computePeekBox(input: PeekLayoutInput): PeekRect {
  const { tile, viewport, safeTop, safeBottom, gap, sideMargin, aspect } = input;

  const availableWidth = Math.max(0, viewport.width - sideMargin * 2);
  const width = Math.min(input.targetWidth, availableWidth);
  const height = width / aspect;

  const minLeft = sideMargin;
  const maxLeft = viewport.width - sideMargin - width;
  const minTop = safeTop;
  const maxTop = viewport.height - safeBottom - height;

  // Preferred placement: rise fully above the tile, leaving a gap, so the whole
  // card body (and its bottom-anchored rules text) clears the finger.
  const aboveTop = tile.top - gap - height;

  let top: number;
  let left: number;
  if (aboveTop >= minTop) {
    // Room above — move straight up, centered horizontally on the tile.
    top = aboveTop;
    left = clamp(tile.left + tile.width / 2 - width / 2, minLeft, maxLeft);
  } else {
    // Tile is near the top: there is no room to rise. Hold at the top of the
    // safe area. A tile hugging a side throws the card to the opposite side, off
    // the finger; a tile near the middle has no better side, so the card just
    // pops up in place, centered on the tile.
    top = minTop;
    const tileCenterX = tile.left + tile.width / 2;
    const nearestEdgeDist = Math.min(tileCenterX, viewport.width - tileCenterX);
    if (nearestEdgeDist < viewport.width * SIDE_HUG_FRACTION) {
      left = tileCenterX <= viewport.width / 2 ? maxLeft : minLeft;
    } else {
      left = tileCenterX - width / 2;
    }
    left = clamp(left, minLeft, maxLeft);
  }

  top = clamp(top, minTop, maxTop);
  return { left, top, width, height };
}

/**
 * The CSS `transform` that maps the enlarged card's final rectangle back onto
 * the pressed tile, using a top-left transform origin. Applying this as the
 * animation's starting transform (and clearing it to `none`) makes the card
 * appear to grow out of the tile the finger is touching — the container
 * transform the design system asks meaningful objects to travel with.
 */
export function peekOriginTransform(peek: PeekRect, tile: PeekRect): string {
  const scale = tile.width / peek.width;
  const translateX = tile.left - peek.left;
  const translateY = tile.top - peek.top;
  return `translate(${String(translateX)}px, ${String(translateY)}px) scale(${String(
    scale,
  )})`;
}
