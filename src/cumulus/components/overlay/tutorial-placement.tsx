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

export interface AnchoredTutorialPoint {
  readonly left: number;
  readonly bottom: number;
}

/** Physical viewport insets reserved by the host device. */
export interface TutorialSafeAreaInsets {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

const ZERO_SAFE_AREA_INSETS: TutorialSafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

/**
 * Pin dialogue above a visible screen region by its bottom edge so late text
 * reflow cannot move the bubble down across the anchored content.
 */
export function placeTutorialDialogueAboveAnchor(params: {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly dialogueWidth: number;
  readonly dialogueHeight: number;
  readonly anchorRect: CardTutorialRect;
  readonly gap: number;
  readonly safeAreaInsets?: TutorialSafeAreaInsets;
  readonly horizontalOffset?: number;
  readonly verticalOffset?: number;
}): AnchoredTutorialPoint | null {
  const {
    viewportWidth,
    viewportHeight,
    dialogueWidth,
    dialogueHeight,
    anchorRect,
    gap,
    safeAreaInsets = ZERO_SAFE_AREA_INSETS,
    horizontalOffset = 0,
    verticalOffset = 0,
  } = params;
  const bottom = Math.max(
    safeAreaInsets.bottom + gap,
    viewportHeight - anchorRect.top + gap - verticalOffset,
  );
  if (viewportHeight - bottom - dialogueHeight < safeAreaInsets.top + gap) {
    return null;
  }
  return {
    left: clamp(
      anchorRect.left + horizontalOffset,
      safeAreaInsets.left + gap,
      Math.max(
        safeAreaInsets.left + gap,
        viewportWidth - safeAreaInsets.right - gap - dialogueWidth,
      ),
    ),
    bottom,
  };
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
  readonly safeAreaInsets?: TutorialSafeAreaInsets;
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
    safeAreaInsets = ZERO_SAFE_AREA_INSETS,
    horizontalOffset = 0,
    verticalOffset = 0,
  } = params;
  const minLeft = safeAreaInsets.left + gap;
  const minTop = safeAreaInsets.top + gap;
  const maxLeft = Math.max(
    minLeft,
    viewportWidth - safeAreaInsets.right - gap - dialogueWidth,
  );
  const maxTop = Math.max(
    minTop,
    viewportHeight - safeAreaInsets.bottom - gap - dialogueHeight,
  );
  const centeredLeft = clamp(
    (safeAreaInsets.left +
      viewportWidth -
      safeAreaInsets.right -
      dialogueWidth) /
      2,
    minLeft,
    maxLeft,
  );
  const centeredTop = clamp(
    (safeAreaInsets.top +
      viewportHeight -
      safeAreaInsets.bottom -
      dialogueHeight) /
      2,
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
    leftCandidates.add(
      clamp(rect.left - gap - dialogueWidth, minLeft, maxLeft),
    );
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
import {
  createContext,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
  type ReactNode,
  type RefCallback,
} from "react";

export type TutorialPlacementAnchorId = `tutorial-anchor:${string}`;
export type TutorialObstacleId = `tutorial-obstacle:${string}`;
type TutorialPlacementRegistrationId = ReturnType<typeof useId>;

export const SITE_CONTENT_TUTORIAL_ANCHOR_ID =
  "tutorial-anchor:site-content" satisfies TutorialPlacementAnchorId;
export type TutorialObstacleRole = "card" | "chrome" | "dialogue" | "control";

interface TutorialPlacementSnapshot {
  readonly anchors: ReadonlyMap<TutorialPlacementAnchorId, HTMLElement>;
  readonly obstacles: ReadonlyMap<
    TutorialObstacleId,
    { readonly element: HTMLElement; readonly role: TutorialObstacleRole }
  >;
  readonly registerAnchor: (
    registrationId: TutorialPlacementRegistrationId,
    id: TutorialPlacementAnchorId,
    element: HTMLElement | null,
  ) => void;
  readonly registerObstacle: (
    registrationId: TutorialPlacementRegistrationId,
    id: TutorialObstacleId,
    role: TutorialObstacleRole,
    element: HTMLElement | null,
  ) => void;
}

const TutorialPlacementContext =
  createContext<TutorialPlacementSnapshot | null>(null);

export function TutorialPlacementProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [anchorRegistrations, setAnchorRegistrations] = useState<
    ReadonlyMap<
      TutorialPlacementRegistrationId,
      { readonly id: TutorialPlacementAnchorId; readonly element: HTMLElement }
    >
  >(() => new Map());
  const [obstacleRegistrations, setObstacleRegistrations] = useState<
    ReadonlyMap<
      TutorialPlacementRegistrationId,
      {
        readonly id: TutorialObstacleId;
        readonly element: HTMLElement;
        readonly role: TutorialObstacleRole;
      }
    >
  >(() => new Map());
  const registerAnchor = useCallback(
    (
      registrationId: TutorialPlacementRegistrationId,
      id: TutorialPlacementAnchorId,
      element: HTMLElement | null,
    ): void => {
      setAnchorRegistrations((current) => {
        if (element === null && !current.has(registrationId)) return current;
        const next = new Map(current);
        if (element === null) next.delete(registrationId);
        else next.set(registrationId, { id, element });
        return next;
      });
    },
    [],
  );
  const registerObstacle = useCallback(
    (
      registrationId: TutorialPlacementRegistrationId,
      id: TutorialObstacleId,
      role: TutorialObstacleRole,
      element: HTMLElement | null,
    ): void => {
      setObstacleRegistrations((current) => {
        if (element === null && !current.has(registrationId)) return current;
        const next = new Map(current);
        if (element === null) next.delete(registrationId);
        else next.set(registrationId, { id, element, role });
        return next;
      });
    },
    [],
  );
  const anchors = useMemo(() => {
    const resolved = new Map<TutorialPlacementAnchorId, HTMLElement>();
    for (const { id, element } of anchorRegistrations.values())
      resolved.set(id, element);
    return resolved;
  }, [anchorRegistrations]);
  const obstacles = useMemo(() => {
    const resolved = new Map<
      TutorialObstacleId,
      { readonly element: HTMLElement; readonly role: TutorialObstacleRole }
    >();
    for (const { id, element, role } of obstacleRegistrations.values())
      resolved.set(id, { element, role });
    return resolved;
  }, [obstacleRegistrations]);
  const value = useMemo(
    () => ({ anchors, obstacles, registerAnchor, registerObstacle }),
    [anchors, obstacles, registerAnchor, registerObstacle],
  );
  return (
    <TutorialPlacementContext.Provider value={value}>
      {children}
    </TutorialPlacementContext.Provider>
  );
}

export function useTutorialPlacementSnapshot(): TutorialPlacementSnapshot {
  const context = useContext(TutorialPlacementContext);
  if (context === null)
    throw new Error("Tutorial placement requires CumulusRoot.");
  return context;
}

export function useTutorialAnchor(
  id: TutorialPlacementAnchorId,
): RefCallback<HTMLElement> {
  const { registerAnchor } = useTutorialPlacementSnapshot();
  const registrationId = useId();
  return useCallback(
    (element) => registerAnchor(registrationId, id, element),
    [id, registerAnchor, registrationId],
  );
}

export function useTutorialObstacle(
  id: TutorialObstacleId,
  role: TutorialObstacleRole,
): RefCallback<HTMLElement> {
  const { registerObstacle } = useTutorialPlacementSnapshot();
  const registrationId = useId();
  return useCallback(
    (element) => registerObstacle(registrationId, id, role, element),
    [id, registerObstacle, registrationId, role],
  );
}
