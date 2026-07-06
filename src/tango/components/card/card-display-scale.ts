const CARD_TEXT_BASE_WIDTH = 156;

/**
 * Rendered card width (px) at which a `large` card's rules text reaches full
 * scale. Below it the text scales down with the card; at and above it the scale
 * is clamped to 1, so growing the card further enlarges the frame and art but
 * not the text. It is therefore the smallest width that renders the rules text
 * at its full, comfortably-readable size — the natural stopping point for any
 * "enlarge a card just until its text is legible" treatment.
 */
export const LARGE_CARD_TEXT_BASE_WIDTH = 220;
const MIN_CARD_TEXT_SCALE = 0.48;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function computeCardTextScale(
  widthPx: number | null,
  large: boolean,
): number {
  if (widthPx === null || widthPx <= 0) {
    return 1;
  }

  const baseWidth = large ? LARGE_CARD_TEXT_BASE_WIDTH : CARD_TEXT_BASE_WIDTH;
  return clamp(widthPx / baseWidth, MIN_CARD_TEXT_SCALE, 1);
}
