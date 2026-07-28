/**
 * Single source of truth for the shape at which cards render.
 *
 * To try a different card shape, change `CARD_ASPECT_W` / `CARD_ASPECT_H`
 * (a `width : height` ratio, e.g. 5 : 7 for the standard 2.5" × 3.5" card).
 * Everything else here is derived from those two numbers: the CSS
 * `aspect-ratio` value, the corner radius (kept uniform across the card's
 * sides), and the draft-offer width that fits two rows of cards on screen.
 */
export const CARD_ASPECT_W = 5;
export const CARD_ASPECT_H = 7;

/** Value for the CSS `aspect-ratio` property / inline style. */
export const CARD_ASPECT_RATIO = `${CARD_ASPECT_W} / ${CARD_ASPECT_H}`;

/** Numeric width-to-height ratio of the card, for layout math. */
export const CARD_ASPECT_RATIO_VALUE = CARD_ASPECT_W / CARD_ASPECT_H;

/** Square geometry used by the art-forward in-play battlefield face. */
export const BATTLEFIELD_CARD_ASPECT_RATIO = "1 / 1";

/** Numeric width-to-height ratio of the in-play battlefield face. */
export const BATTLEFIELD_CARD_ASPECT_RATIO_VALUE = 1;

/**
 * Fraction of the card's height, measured up from the bottom edge, that does
 * not render the source artwork. Instead this band is filled by an
 * art-extension treatment (a mirrored, blurred, darkened continuation of the
 * art's bottom edge) so important art elements are not lost to the vertical
 * crop or hidden behind the bottom text box. The artwork itself is fitted into
 * the remaining top band, which is a slightly wider aspect ratio than the full
 * card. Change this single value to grow or shrink the fill band.
 */
export const ART_EXTENSION_FRACTION = 0.1;

/**
 * Width-to-height ratio of the region the source artwork is fitted into: the
 * top `1 - ART_EXTENSION_FRACTION` of the card. Because it is shorter than the
 * full card at the same width, it is a wider ratio than
 * `CARD_ASPECT_RATIO_VALUE`. The art crop (pan/zoom) is resolved against this
 * region rather than the whole card.
 */
export const ART_REGION_ASPECT_RATIO_VALUE =
  CARD_ASPECT_RATIO_VALUE / (1 - ART_EXTENSION_FRACTION);

/**
 * Card corner radius (18px at the 500px design width). The horizontal radius
 * is a fixed percentage of the width; the vertical radius is scaled by the
 * aspect ratio so the rendered corner is uniform (`3.6%` of width on every
 * side) regardless of the chosen shape. A `cqw` value here would resolve
 * against an ancestor container rather than the card itself.
 */
const CARD_CORNER_RADIUS_PCT = 3.6;
export const CARD_CORNER_RADIUS = `${CARD_CORNER_RADIUS_PCT}% / ${(
  (CARD_CORNER_RADIUS_PCT * CARD_ASPECT_W) /
  CARD_ASPECT_H
).toFixed(2)}%`;

/** Uniform corner radius for the square in-play battlefield face. */
export const BATTLEFIELD_CARD_CORNER_RADIUS = `${CARD_CORNER_RADIUS_PCT}%`;

/**
 * Width of a single card in the journey draft offer: the smaller of half the
 * container width (two cards across) and the width that keeps two rows tall
 * within the available viewport height. Each row is `width * H / W` tall, so
 * two rows fit when `width = available-height * W / (2 * H)`. The card
 * editor's "large" preset tiles cards at this same width so editor previews
 * match the size players see while drafting. Both surfaces resolve `100cqw`
 * against an `inline-size` container, so the value tracks the surface width.
 */
export const DRAFT_OFFER_CARD_WIDTH = `min(calc((100cqw - 16px) / 2), calc((100vh - 48px - 80px) * ${CARD_ASPECT_W} / ${
  2 * CARD_ASPECT_H
}))`;
