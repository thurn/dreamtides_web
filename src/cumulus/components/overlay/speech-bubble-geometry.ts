/** Named edge and alignment for the speech-bubble pointer. */
export type SpeechBubblePointerPlacement =
  "left-lower" | "left-center" | "top-left" | "bottom-left";

export interface SpeechBubblePointerTip {
  readonly x: number;
  readonly y: number;
}

const SPEECH_TAIL_DEPTH = 14;
const SPEECH_TAIL_HALF_BASE = 10;
const SPEECH_CORNER_SIZE = 8;
const SPEECH_TOP_BOTTOM_TAIL_RATIO = 0.22;

const SPEECH_LEFT_TAIL_CENTER_RATIO: Record<
  Extract<SpeechBubblePointerPlacement, "left-lower" | "left-center">,
  number
> = {
  "left-lower": 0.68,
  "left-center": 0.5,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Layout depth reserved for the pointer outside the rounded bubble body. */
export function speechBubblePointerDepth(): number {
  return SPEECH_TAIL_DEPTH;
}

/** Exact pointer-tip coordinates in the bubble's unscaled border box. */
export function speechBubblePointerTip(
  width: number,
  height: number,
  placement: SpeechBubblePointerPlacement,
): SpeechBubblePointerTip {
  const corner = Math.min(SPEECH_CORNER_SIZE, height / 2, width / 2);
  const halfBase = Math.min(
    SPEECH_TAIL_HALF_BASE,
    placement.startsWith("left-") ? height / 4 : width / 4,
  );

  if (placement === "top-left" || placement === "bottom-left") {
    return {
      x: clamp(
        width * SPEECH_TOP_BOTTOM_TAIL_RATIO,
        corner + halfBase,
        width - corner - halfBase,
      ),
      y: placement === "top-left" ? 0 : height,
    };
  }

  return {
    x: 0,
    y: clamp(
      height * SPEECH_LEFT_TAIL_CENTER_RATIO[placement],
      corner + halfBase,
      height - corner - halfBase,
    ),
  };
}

/** Rounded bubble outline with a pointer whose base stays on a flat edge. */
export function makeSpeechBubblePath(
  width: number,
  height: number,
  placement: SpeechBubblePointerPlacement,
): string | null {
  if (width <= 0 || height <= 0) return null;

  const tail = SPEECH_TAIL_DEPTH;
  const corner = Math.min(SPEECH_CORNER_SIZE, height / 2, width / 2);
  const halfBase = Math.min(
    SPEECH_TAIL_HALF_BASE,
    placement.startsWith("left-") ? height / 4 : width / 4,
  );
  const tip = speechBubblePointerTip(width, height, placement);

  if (placement === "top-left") {
    const bodyTop = tail;
    return [
      `M ${corner} ${bodyTop}`,
      `H ${tip.x - halfBase}`,
      `L ${tip.x} 0`,
      `L ${tip.x + halfBase} ${bodyTop}`,
      `H ${width - corner}`,
      `Q ${width} ${bodyTop} ${width} ${bodyTop + corner}`,
      `V ${height - corner}`,
      `Q ${width} ${height} ${width - corner} ${height}`,
      `H ${corner}`,
      `Q 0 ${height} 0 ${height - corner}`,
      `V ${bodyTop + corner}`,
      `Q 0 ${bodyTop} ${corner} ${bodyTop}`,
      "Z",
    ].join(" ");
  }

  if (placement === "bottom-left") {
    const bodyBottom = height - tail;
    return [
      `M ${corner} 0`,
      `H ${width - corner}`,
      `Q ${width} 0 ${width} ${corner}`,
      `V ${bodyBottom - corner}`,
      `Q ${width} ${bodyBottom} ${width - corner} ${bodyBottom}`,
      `H ${tip.x + halfBase}`,
      `L ${tip.x} ${height}`,
      `L ${tip.x - halfBase} ${bodyBottom}`,
      `H ${corner}`,
      `Q 0 ${bodyBottom} 0 ${bodyBottom - corner}`,
      `V ${corner}`,
      `Q 0 0 ${corner} 0`,
      "Z",
    ].join(" ");
  }

  const tailCenter = tip.y;
  const tailTop = tailCenter - halfBase;
  const tailBottom = tailCenter + halfBase;
  return [
    `M ${tail + corner} 0`,
    `H ${width - corner}`,
    `Q ${width} 0 ${width} ${corner}`,
    `V ${height - corner}`,
    `Q ${width} ${height} ${width - corner} ${height}`,
    `H ${tail + corner}`,
    `Q ${tail} ${height} ${tail} ${height - corner}`,
    `V ${tailBottom}`,
    `L 0 ${tailCenter}`,
    `L ${tail} ${tailTop}`,
    `V ${corner}`,
    `Q ${tail} 0 ${tail + corner} 0`,
    "Z",
  ].join(" ");
}
