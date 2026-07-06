// Pure geometry for the mobile deck viewer's press-and-hold zoom.
//
// When a player presses and holds a card in the 4-across grid, a large copy of
// that card expands to a readable size. The whole point of the interaction is
// that the enlarged card must NOT sit under the finger that summoned it, so the
// player can read it while still touching the screen. `computePeekBox` decides
// where the enlarged card goes: it drops into whichever vertical half of the
// viewport the pressed tile does NOT occupy, sized as large as that half allows
// while keeping the card's fixed 5:7 shape and staying inside the safe-area
// insets. Kept side-effect-free and framework-free so the placement rule — the
// hard part of this screen — is unit-tested against plain numbers.

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
}

/**
 * Places the enlarged card in the vertical half opposite the pressed tile,
 * horizontally centered, as large as that half allows without breaking the
 * card's aspect ratio or crossing the safe-area insets.
 *
 * The card lands above the tile when there is more room above it, and below
 * when there is more room below — so a card pressed low on the screen zooms
 * upward, clear of the thumb, and a card pressed high zooms downward. The
 * returned rectangle never overlaps the `gap`-padded band around the tile, so
 * the finger is always left uncovered.
 */
export function computePeekBox(input: PeekLayoutInput): PeekRect {
  const { tile, viewport, safeTop, safeBottom, gap, sideMargin, aspect } = input;

  // Room available in each half, measured from the gap-padded edge of the tile
  // to the corresponding safe-area edge of the viewport.
  const roomAbove = tile.top - gap - safeTop;
  const roomBelow =
    viewport.height - safeBottom - (tile.top + tile.height + gap);
  const placeAbove = roomAbove >= roomBelow;

  // The card is sized to the larger half's height and the available width,
  // whichever binds first, then the other dimension follows from the aspect.
  const availableHeight = Math.max(0, placeAbove ? roomAbove : roomBelow);
  const availableWidth = Math.max(0, viewport.width - sideMargin * 2);
  const width = Math.min(availableWidth, availableHeight * aspect);
  const height = width / aspect;

  const left = (viewport.width - width) / 2;
  const rawTop = placeAbove
    ? tile.top - gap - height
    : tile.top + tile.height + gap;

  // Guard against sub-pixel spill past the safe area when the chosen half is
  // only just tall enough for the fitted card.
  const minTop = safeTop;
  const maxTop = viewport.height - safeBottom - height;
  const top = Math.min(Math.max(rawTop, minTop), Math.max(minTop, maxTop));

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
