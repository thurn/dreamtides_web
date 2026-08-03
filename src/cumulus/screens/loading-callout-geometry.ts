export interface LoadingCalloutRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface LoadingCalloutLeaderLine {
  readonly startX: number;
  readonly startY: number;
  readonly endX: number;
  readonly endY: number;
  readonly path: string;
}

const BUBBLE_EDGE_INSET = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Connect one external callout bubble to the exact center of a rendered card
 * feature. Coordinates are returned relative to the annotated-card group.
 */
export function buildLoadingCalloutLeaderLine(
  group: LoadingCalloutRect,
  bubble: LoadingCalloutRect,
  target: LoadingCalloutRect,
): LoadingCalloutLeaderLine {
  const targetX = target.left + target.width / 2;
  const targetY = target.top + target.height / 2;
  const bubbleCenterX = bubble.left + bubble.width / 2;
  const startsOnRight = bubbleCenterX < targetX;
  const startX = startsOnRight ? bubble.right : bubble.left;
  const startY = clamp(
    targetY,
    bubble.top + BUBBLE_EDGE_INSET,
    bubble.bottom - BUBBLE_EDGE_INSET,
  );
  const relativeStartX = rounded(startX - group.left);
  const relativeStartY = rounded(startY - group.top);
  const relativeEndX = rounded(targetX - group.left);
  const relativeEndY = rounded(targetY - group.top);
  const elbowX = rounded(
    relativeStartX + (relativeEndX - relativeStartX) * 0.45,
  );

  return {
    startX: relativeStartX,
    startY: relativeStartY,
    endX: relativeEndX,
    endY: relativeEndY,
    path: `M ${String(relativeStartX)} ${String(relativeStartY)} L ${String(elbowX)} ${String(relativeStartY)} L ${String(relativeEndX)} ${String(relativeEndY)}`,
  };
}
