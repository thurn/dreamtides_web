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
const TARGET_APPROACH_RUN = 8;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Connect one external callout bubble to the facing edge of a rendered card
 * feature. Coordinates are returned relative to the annotated-card group.
 */
export function buildLoadingCalloutLeaderLine(
  group: LoadingCalloutRect,
  bubble: LoadingCalloutRect,
  target: LoadingCalloutRect,
): LoadingCalloutLeaderLine {
  const targetY = target.top + target.height / 2;
  const bubbleCenterX = bubble.left + bubble.width / 2;
  const targetCenterX = target.left + target.width / 2;
  const startsOnRight = bubbleCenterX < targetCenterX;
  const targetX = startsOnRight ? target.left : target.right;
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
  const approachRun = Math.min(
    TARGET_APPROACH_RUN,
    Math.abs(relativeEndX - relativeStartX) / 2,
  );
  const approachX = rounded(
    relativeEndX + (startsOnRight ? -approachRun : approachRun),
  );
  const path =
    relativeStartY === relativeEndY
      ? `M ${String(relativeStartX)} ${String(relativeStartY)} L ${String(relativeEndX)} ${String(relativeEndY)}`
      : `M ${String(relativeStartX)} ${String(relativeStartY)} L ${String(approachX)} ${String(relativeStartY)} L ${String(approachX)} ${String(relativeEndY)} L ${String(relativeEndX)} ${String(relativeEndY)}`;

  return {
    startX: relativeStartX,
    startY: relativeStartY,
    endX: relativeEndX,
    endY: relativeEndY,
    path,
  };
}
