const CARD_TEXT_BASE_WIDTH = 156;
const LARGE_CARD_TEXT_BASE_WIDTH = 220;
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
