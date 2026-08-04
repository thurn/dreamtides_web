export interface CardTutorialRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface CardTutorialPoint {
  readonly left: number;
  readonly top: number;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function overlaps(
  left: number,
  top: number,
  width: number,
  height: number,
  obstacle: CardTutorialRect,
  gap: number,
): boolean {
  const right = left + width;
  const bottom = top + height;
  return (
    right > obstacle.left - gap &&
    left < obstacle.right + gap &&
    bottom > obstacle.top - gap &&
    top < obstacle.bottom + gap
  );
}

/**
 * Place compact card guidance in viewport space while preserving every card's
 * screen position. Above the complete card group is preferred, followed by
 * below and either side; irregular layouts fall back to the first free cell
 * formed by the cards' edges.
 */
export function placeCardTutorialDialogue(params: {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly dialogueWidth: number;
  readonly dialogueHeight: number;
  readonly cardRects: readonly CardTutorialRect[];
  readonly obstacleRects?: readonly CardTutorialRect[];
  readonly gap: number;
  readonly horizontalOffset?: number;
  readonly verticalOffset?: number;
}): CardTutorialPoint {
  const {
    viewportWidth,
    viewportHeight,
    dialogueWidth,
    dialogueHeight,
    cardRects,
    obstacleRects = [],
    gap,
    horizontalOffset = 0,
    verticalOffset = 0,
  } = params;
  const minLeft = gap;
  const minTop = gap;
  const maxLeft = Math.max(minLeft, viewportWidth - gap - dialogueWidth);
  const maxTop = Math.max(minTop, viewportHeight - gap - dialogueHeight);
  const centeredLeft = clamp(
    (viewportWidth - dialogueWidth) / 2,
    minLeft,
    maxLeft,
  );
  const centeredTop = clamp(
    (viewportHeight - dialogueHeight) / 2,
    minTop,
    maxTop,
  );
  if (cardRects.length === 0 && obstacleRects.length === 0) {
    return { left: centeredLeft, top: minTop };
  }
  const collisionRects = [...cardRects, ...obstacleRects];
  const fits = (candidate: CardTutorialPoint): boolean =>
    candidate.left >= minLeft &&
    candidate.left <= maxLeft &&
    candidate.top >= minTop &&
    candidate.top <= maxTop &&
    collisionRects.every(
      (rect) =>
        !overlaps(
          candidate.left,
          candidate.top,
          dialogueWidth,
          dialogueHeight,
          rect,
          gap,
        ),
    );

  const applyOffset = (candidate: CardTutorialPoint): CardTutorialPoint => ({
    left: candidate.left + horizontalOffset,
    top: candidate.top + verticalOffset,
  });
  if (cardRects.length > 0) {
    const cardsLeft = Math.min(...cardRects.map((rect) => rect.left));
    const cardsTop = Math.min(...cardRects.map((rect) => rect.top));
    const cardsRight = Math.max(...cardRects.map((rect) => rect.right));
    const cardsBottom = Math.max(...cardRects.map((rect) => rect.bottom));
    const cardsCenterX = (cardsLeft + cardsRight) / 2;
    const cardsCenterY = (cardsTop + cardsBottom) / 2;
    const preferred: readonly CardTutorialPoint[] = [
      {
        left: clamp(cardsCenterX - dialogueWidth / 2, minLeft, maxLeft),
        top: cardsTop - gap - dialogueHeight,
      },
      {
        left: clamp(cardsCenterX - dialogueWidth / 2, minLeft, maxLeft),
        top: cardsBottom + gap,
      },
      {
        left: cardsLeft - gap - dialogueWidth,
        top: clamp(cardsCenterY - dialogueHeight / 2, minTop, maxTop),
      },
      {
        left: cardsRight + gap,
        top: clamp(cardsCenterY - dialogueHeight / 2, minTop, maxTop),
      },
    ].map(applyOffset);
    const preferredFit = preferred.find(fits);
    if (preferredFit !== undefined) return preferredFit;
  }

  const leftCandidates = new Set<number>([minLeft, centeredLeft, maxLeft]);
  const topCandidates = new Set<number>([minTop, centeredTop, maxTop]);
  for (const rect of collisionRects) {
    leftCandidates.add(clamp(rect.left - gap - dialogueWidth, minLeft, maxLeft));
    leftCandidates.add(clamp(rect.right + gap, minLeft, maxLeft));
    topCandidates.add(clamp(rect.top - gap - dialogueHeight, minTop, maxTop));
    topCandidates.add(clamp(rect.bottom + gap, minTop, maxTop));
  }
  const freeCells = [...topCandidates]
    .flatMap((top) => [...leftCandidates].map((left) => ({ left, top })))
    .map(applyOffset)
    .filter(fits)
    .sort(
      (a, b) =>
        a.top - b.top ||
        Math.abs(a.left - centeredLeft) - Math.abs(b.left - centeredLeft),
    );
  return freeCells[0] ?? { left: centeredLeft, top: minTop };
}
