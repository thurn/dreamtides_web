import type { RevealPoint, RevealReason, RevealRect } from "./model";
import type { VisualViewportSnapshot } from "./viewport";

const MOBILE_WIDTH_FRACTION = 0.45;
const CARD_GAP = 10;
const DESKTOP_SOURCE_GAP = 14;
const MOBILE_SOURCE_GAP = DESKTOP_SOURCE_GAP;
const TOUCH_RADIUS = 24;
const DESKTOP_GAME_CARD_WIDTH = 340;

export interface RevealSize { readonly width: number; readonly height: number }
export interface RevealPlacementInput {
  readonly viewport: VisualViewportSnapshot;
  readonly reason: RevealReason;
  readonly primaryKind: "gameCard" | "infoCard";
  readonly sourceRect: RevealRect;
  readonly touchPoint?: RevealPoint;
  readonly primarySize: RevealSize;
  readonly secondarySizes: readonly RevealSize[];
  readonly sourceShowsCompleteGameCard: boolean;
}

export interface RevealPlacementDecision {
  readonly family: string;
  readonly orientation: "primary-left" | "primary-right";
  readonly primaryRect: RevealRect;
  readonly secondaryRects: readonly RevealRect[];
  readonly shownSecondaryCount: number;
  readonly droppedSecondaryCount: number;
  readonly pressInPlace: boolean;
  readonly sideFallback: boolean;
  readonly secondaryTruncation: boolean;
  readonly bestEffortPrimaryOverlap: boolean;
  readonly circleClearance?: number;
}

export function fitSecondaryPrefix(sizes: readonly RevealSize[], availableHeight: number, gap = CARD_GAP): number {
  let used = 0;
  let count = 0;
  for (const size of sizes) {
    const next = used + (count === 0 ? 0 : gap) + size.height;
    if (next > availableHeight) break;
    used = next;
    count += 1;
  }
  return count;
}

function scaled(size: RevealSize, width: number): RevealSize {
  return { width, height: size.height * width / Math.max(1, size.width) };
}

function rect(x: number, y: number, size: RevealSize): RevealRect {
  return { x, y, width: size.width, height: size.height };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distanceFromCircle(card: RevealRect, point: RevealPoint): number {
  const nearestX = clamp(point.x, card.x, card.x + card.width);
  const nearestY = clamp(point.y, card.y, card.y + card.height);
  return Math.hypot(point.x - nearestX, point.y - nearestY) - TOUCH_RADIUS;
}

function secondaryRectsAt(sizes: readonly RevealSize[], count: number, x: number, y: number): readonly RevealRect[] {
  let top = y;
  return sizes.slice(0, count).map((size) => {
    const value = rect(x, top, size);
    top += size.height + CARD_GAP;
    return value;
  });
}

function stackHeight(sizes: readonly RevealSize[], count: number): number {
  return sizes.slice(0, count).reduce((height, size, index) => height + size.height + (index === 0 ? 0 : CARD_GAP), 0);
}

function fitGroupPrefix(sizes: readonly RevealSize[], availableHeight: number, primaryHeight: number): number {
  if (primaryHeight > availableHeight) return 0;
  let count = 0;
  for (let next = 1; next <= sizes.length; next += 1) {
    if (Math.max(primaryHeight, stackHeight(sizes, next)) > availableHeight) break;
    count = next;
  }
  return count;
}

function cornerScore(card: RevealRect, point: RevealPoint): number {
  const textRect = { ...card, y: card.y + card.height * 0.6, height: card.height * 0.4 };
  const primaryClearance = distanceFromCircle(card, point);
  const textClearance = distanceFromCircle(textRect, point);
  const centerDistance = Math.hypot(point.x - (card.x + card.width / 2), point.y - (card.y + card.height / 2));
  return primaryClearance * 100 + textClearance * 200 + centerDistance;
}

function result(input: RevealPlacementInput, values: Omit<RevealPlacementDecision, "shownSecondaryCount" | "droppedSecondaryCount" | "secondaryTruncation">): RevealPlacementDecision {
  const shownSecondaryCount = values.secondaryRects.length;
  return Object.freeze({
    ...values,
    primaryRect: Object.freeze(values.primaryRect),
    secondaryRects: Object.freeze(values.secondaryRects.map((cardRect) => Object.freeze(cardRect))),
    shownSecondaryCount,
    droppedSecondaryCount: input.secondarySizes.length - shownSecondaryCount,
    secondaryTruncation: shownSecondaryCount < input.secondarySizes.length,
  });
}

function mobilePlacement(input: RevealPlacementInput): RevealPlacementDecision {
  const { viewport, touchPoint, sourceRect } = input;
  const cardWidth = viewport.width * MOBILE_WIDTH_FRACTION;
  const primarySize = scaled(input.primarySize, cardWidth);
  const secondarySizes = input.secondarySizes.map((size) => scaled(size, cardWidth));
  const safeTop = viewport.offsetTop + viewport.safeArea.top;
  const safeBottom = viewport.offsetTop + viewport.height - viewport.safeArea.bottom;
  const safeLeft = viewport.offsetLeft + viewport.safeArea.left;
  const safeRight = viewport.offsetLeft + viewport.width - viewport.safeArea.right;
  const safeWidth = safeRight - safeLeft;
  const horizontalPairFits = safeWidth >= cardWidth * 2;
  const distributedColumnGap = horizontalPairFits ? (safeWidth - cardWidth * 2) / 3 : 0;
  const leftColumnX = horizontalPairFits ? safeLeft + distributedColumnGap : safeLeft;
  const rightColumnX = horizontalPairFits ? leftColumnX + cardWidth + distributedColumnGap : safeRight - cardWidth;
  const pressInPlace = input.reason === "press" && input.primaryKind === "gameCard"
    && input.sourceShowsCompleteGameCard && sourceRect.width >= cardWidth * 0.9 - Number.EPSILON * viewport.width;

  if (pressInPlace) {
    const rightX = sourceRect.x + sourceRect.width + CARD_GAP;
    const leftX = sourceRect.x - CARD_GAP - cardWidth;
    const rightFits = rightX + cardWidth <= safeRight && rightX >= safeLeft;
    const leftFits = leftX >= safeLeft && leftX + cardWidth <= safeRight;
    const orientation = rightFits || !leftFits ? "primary-left" : "primary-right";
    const secondaryX = orientation === "primary-left" ? rightX : leftX;
    const verticallySafe = sourceRect.y >= safeTop;
    const count = (rightFits || leftFits) && verticallySafe ? fitSecondaryPrefix(secondarySizes, safeBottom - sourceRect.y) : 0;
    return result(input, { family: "mobile-press-in-place", orientation, primaryRect: sourceRect,
      secondaryRects: secondaryRectsAt(secondarySizes, count, secondaryX, sourceRect.y), pressInPlace: true,
      sideFallback: orientation === "primary-right", bestEffortPrimaryOverlap: false });
  }


  const anchorX = sourceRect.x + sourceRect.width / 2;
  if (input.reason === "focus") {
    const canPair = secondarySizes.length > 0 && horizontalPairFits;
    const horizontalLayout = (secondaryCount: number): {
      readonly orientation: "primary-left" | "primary-right";
      readonly primaryX: number;
      readonly secondaryX: number;
    } => {
      const showsSecondaryColumn = secondaryCount > 0;
      const groupWidth = showsSecondaryColumn ? cardWidth * 2 + distributedColumnGap : cardWidth;
      const groupLeft = showsSecondaryColumn
        ? leftColumnX
        : clamp(anchorX - groupWidth / 2, safeLeft, safeRight - groupWidth);
      const leftPrimaryX = groupLeft;
      const rightPrimaryX = groupLeft + (showsSecondaryColumn ? cardWidth + distributedColumnGap : 0);
      const useRightPrimary = showsSecondaryColumn
        && Math.abs(rightPrimaryX + cardWidth / 2 - anchorX) < Math.abs(leftPrimaryX + cardWidth / 2 - anchorX);
      return {
        orientation: useRightPrimary ? "primary-right" : "primary-left",
        primaryX: useRightPrimary ? rightPrimaryX : leftPrimaryX,
        secondaryX: useRightPrimary ? groupLeft : groupLeft + cardWidth + CARD_GAP,
      };
    };
    const aboveHeight = sourceRect.y - CARD_GAP - safeTop;
    const aboveCount = canPair ? fitGroupPrefix(secondarySizes, aboveHeight, primarySize.height) : 0;
    const canFitPrimaryAbove = primarySize.height <= aboveHeight;
    if (canFitPrimaryAbove) {
      const { orientation, primaryX, secondaryX } = horizontalLayout(aboveCount);
      const groupHeight = Math.max(primarySize.height, stackHeight(secondarySizes, aboveCount));
      const y = sourceRect.y - CARD_GAP - groupHeight;
      return result(input, { family: "mobile-focus-above", orientation, primaryRect: rect(primaryX, y, primarySize),
        secondaryRects: secondaryRectsAt(secondarySizes, aboveCount, secondaryX, y), pressInPlace: false,
        sideFallback: false, bestEffortPrimaryOverlap: false });
    }
    const topCount = canPair ? fitGroupPrefix(secondarySizes, safeBottom - safeTop, primarySize.height) : 0;
    const { orientation, primaryX, secondaryX } = horizontalLayout(topCount);
    return result(input, { family: "mobile-focus-top", orientation, primaryRect: rect(primaryX, safeTop, primarySize),
      secondaryRects: secondaryRectsAt(secondarySizes, topCount, secondaryX, safeTop), pressInPlace: false,
      sideFallback: true, bestEffortPrimaryOverlap: false });
  }

  const hasNotionalPair = input.primaryKind === "gameCard" || secondarySizes.length > 0;
  const preferredPrimaryX = leftColumnX;
  const oppositePrimaryX = rightColumnX;
  let orientation: "primary-left" | "primary-right" = "primary-left";
  let primaryX = hasNotionalPair ? preferredPrimaryX : clamp(anchorX - cardWidth / 2, safeLeft, safeRight - cardWidth);
  const targetBottom = input.reason === "press" && touchPoint !== undefined
    ? Math.min(touchPoint.y - TOUCH_RADIUS, sourceRect.y - MOBILE_SOURCE_GAP)
    : sourceRect.y - CARD_GAP;
  const desiredTop = targetBottom - primarySize.height;
  let primaryY = Math.max(safeTop, desiredTop);
  let family = "mobile-touch-up";
  let bestEffortPrimaryOverlap = false;

  if (desiredTop < safeTop) {
    primaryY = safeTop;
    family = "mobile-touch-top";
    const pointX = touchPoint?.x ?? anchorX;
    if (hasNotionalPair) {
      orientation = pointX < viewport.offsetLeft + viewport.width / 2 ? "primary-right" : "primary-left";
      primaryX = orientation === "primary-left" ? preferredPrimaryX : oppositePrimaryX;
    } else {
      primaryX = pointX < viewport.offsetLeft + viewport.width / 2 ? oppositePrimaryX : preferredPrimaryX;
      orientation = primaryX === preferredPrimaryX ? "primary-left" : "primary-right";
    }
  }

  const primaryRect = rect(primaryX, primaryY, primarySize);
  const circleClearance = touchPoint === undefined ? undefined : distanceFromCircle(primaryRect, touchPoint);
  if (circleClearance !== undefined && circleClearance < 0 && touchPoint !== undefined) {
    const candidates = [
      { orientation: "primary-left" as const, card: rect(preferredPrimaryX, safeTop, primarySize), preferred: touchPoint.x >= viewport.offsetLeft + viewport.width / 2 },
      { orientation: "primary-right" as const, card: rect(oppositePrimaryX, safeTop, primarySize), preferred: touchPoint.x < viewport.offsetLeft + viewport.width / 2 },
    ];
    const feasible = candidates.filter((candidate) => distanceFromCircle(candidate.card, touchPoint) >= 0 && candidate.card.y <= touchPoint.y);
    const pool = feasible.length > 0 ? feasible : candidates;
    pool.sort((a, b) => cornerScore(b.card, touchPoint) - cornerScore(a.card, touchPoint) || Number(b.preferred) - Number(a.preferred));
    const chosen = pool[0];
    orientation = chosen.orientation;
    primaryX = chosen.card.x;
    primaryY = chosen.card.y;
    family = feasible.length > 0 ? "mobile-touch-top" : "mobile-touch-corner";
    bestEffortPrimaryOverlap = feasible.length === 0;
  }
  const finalPrimary = rect(primaryX, primaryY, primarySize);
  const secondaryX = orientation === "primary-left" ? rightColumnX : leftColumnX;
  const secondaryCount = horizontalPairFits ? fitSecondaryPrefix(secondarySizes, safeBottom - primaryY) : 0;
  return result(input, {
    family, orientation, primaryRect: finalPrimary,
    secondaryRects: secondaryRectsAt(secondarySizes, secondaryCount, secondaryX, primaryY),
    pressInPlace: false, sideFallback: family.includes("top") || family.includes("corner"),
    bestEffortPrimaryOverlap,
    ...(touchPoint === undefined ? {} : { circleClearance: distanceFromCircle(finalPrimary, touchPoint) }),
  });
}

function desktopPlacement(input: RevealPlacementInput): RevealPlacementDecision {
  const { viewport, sourceRect } = input;
  const safeTop = viewport.offsetTop + viewport.safeArea.top;
  const safeBottom = viewport.offsetTop + viewport.height - viewport.safeArea.bottom;
  const safeLeft = viewport.offsetLeft + viewport.safeArea.left;
  const safeRight = viewport.offsetLeft + viewport.width - viewport.safeArea.right;
  const primaryWidth = input.primaryKind === "gameCard" ? Math.max(DESKTOP_GAME_CARD_WIDTH, sourceRect.width) : input.primarySize.width;
  const primarySize = scaled(input.primarySize, primaryWidth);
  const secondarySizes = input.secondarySizes;
  const secondaryWidth = secondarySizes.reduce((width, size) => Math.max(width, size.width), 0);
  if (input.primaryKind === "gameCard") {
    const primaryX = clamp(sourceRect.x + sourceRect.width / 2 - primaryWidth / 2, safeLeft, safeRight - primaryWidth);
    const primaryY = clamp(sourceRect.y + sourceRect.height / 2 - primarySize.height / 2, safeTop, Math.max(safeTop, safeBottom - primarySize.height));
    const rightX = primaryX + primaryWidth + CARD_GAP;
    const leftX = primaryX - CARD_GAP - secondaryWidth;
    const canUseRight = secondarySizes.length > 0 && rightX + secondaryWidth <= safeRight;
    const canUseLeft = secondarySizes.length > 0 && leftX >= safeLeft;
    const secondaryX = canUseRight ? rightX : leftX;
    const count = canUseRight || canUseLeft ? fitSecondaryPrefix(secondarySizes, safeBottom - primaryY) : 0;
    return result(input, {
      family: "desktop-game-card-reading",
      orientation: canUseRight || !canUseLeft ? "primary-left" : "primary-right",
      primaryRect: rect(primaryX, primaryY, primarySize),
      secondaryRects: secondaryRectsAt(secondarySizes, count, secondaryX, primaryY),
      pressInPlace: false,
      sideFallback: !canUseRight && canUseLeft,
      bestEffortPrimaryOverlap: false,
    });
  }
  const pairFitsSafeWidth = secondarySizes.length > 0 && primaryWidth + CARD_GAP + secondaryWidth <= safeRight - safeLeft;
  const usableSecondaries = pairFitsSafeWidth ? secondarySizes : [];
  const groupWidth = primaryWidth + (usableSecondaries.length > 0 ? CARD_GAP + secondaryWidth : 0);
  const aboveAvailableHeight = sourceRect.y - DESKTOP_SOURCE_GAP - safeTop;
  if (primarySize.height <= aboveAvailableHeight) {
    const count = fitGroupPrefix(usableSecondaries, aboveAvailableHeight, primarySize.height);
    const groupHeight = Math.max(primarySize.height, stackHeight(usableSecondaries, count));
    const aboveY = sourceRect.y - DESKTOP_SOURCE_GAP - groupHeight;
    const visibleGroupWidth = primaryWidth + (count > 0 ? CARD_GAP + secondaryWidth : 0);
    const x = clamp(sourceRect.x + sourceRect.width / 2 - visibleGroupWidth / 2, safeLeft, safeRight - visibleGroupWidth);
    return result(input, { family: "desktop-above", orientation: "primary-left", primaryRect: rect(x, aboveY, primarySize),
      secondaryRects: secondaryRectsAt(usableSecondaries, count, x + primaryWidth + CARD_GAP, aboveY), pressInPlace: false,
      sideFallback: false, bestEffortPrimaryOverlap: false });
  }
  const rightSpace = safeRight - (sourceRect.x + sourceRect.width + DESKTOP_SOURCE_GAP);
  const leftSpace = sourceRect.x - DESKTOP_SOURCE_GAP - safeLeft;
  const useRight = rightSpace >= groupWidth || rightSpace >= leftSpace;
  const orientation = useRight ? "primary-left" : "primary-right";
  const x = useRight
    ? clamp(sourceRect.x + sourceRect.width + DESKTOP_SOURCE_GAP, safeLeft, Math.max(safeLeft, safeRight - groupWidth))
    : clamp(sourceRect.x - DESKTOP_SOURCE_GAP - groupWidth, safeLeft, Math.max(safeLeft, safeRight - groupWidth));
  const y = clamp(sourceRect.y, safeTop, Math.max(safeTop, safeBottom - primarySize.height));
  const primaryX = orientation === "primary-left" ? x : x + (usableSecondaries.length > 0 ? secondaryWidth + CARD_GAP : 0);
  const secondaryX = orientation === "primary-left" ? primaryX + primaryWidth + CARD_GAP : x;
  const sideCanFitPair = usableSecondaries.length > 0 && (useRight ? rightSpace : leftSpace) >= groupWidth;
  const count = sideCanFitPair ? fitSecondaryPrefix(usableSecondaries, safeBottom - y) : 0;
  const finalPrimaryRect = rect(count === 0 ? clamp(useRight ? sourceRect.x + sourceRect.width + DESKTOP_SOURCE_GAP : sourceRect.x - DESKTOP_SOURCE_GAP - primaryWidth, safeLeft, safeRight - primaryWidth) : primaryX, y, primarySize);
  const clearsSourceGap = finalPrimaryRect.x >= sourceRect.x + sourceRect.width + DESKTOP_SOURCE_GAP
    || finalPrimaryRect.x + finalPrimaryRect.width <= sourceRect.x - DESKTOP_SOURCE_GAP;
  return result(input, { family: useRight ? "desktop-side-right" : "desktop-side-left", orientation,
    primaryRect: finalPrimaryRect, secondaryRects: secondaryRectsAt(usableSecondaries, count, secondaryX, y),
    pressInPlace: false, sideFallback: true, bestEffortPrimaryOverlap: !clearsSourceGap });
}

export function selectRevealPlacement(input: RevealPlacementInput): RevealPlacementDecision {
  return input.viewport.layout === "mobile" ? mobilePlacement(input) : desktopPlacement(input);
}
