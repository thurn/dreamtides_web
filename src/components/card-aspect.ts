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

/**
 * Width of a single card in the quest draft offer: the smaller of half the
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
