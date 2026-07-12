export interface FeedbackRect {
  readonly width: number;
  readonly height: number;
}

export type PressFeedback = "scale" | "stationary";

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

// Base scale on the longest edge so a wide row and a portrait card both move
// by a small, comparable physical distance at their farthest edge. Basing the
// factor on the short edge makes wide rows lurch horizontally.
const feedbackDimension = (rect: FeedbackRect): number =>
  Math.max(1, rect.width, rect.height);

export function pressScaleForRect(rect: FeedbackRect): number {
  return clamp(1 - 6 / feedbackDimension(rect), 0.9, 0.98);
}

export function hoverScaleForRect(rect: FeedbackRect): number {
  return clamp(1 + 4 / feedbackDimension(rect), 1.01, 1.03);
}

export function feedbackForRect(
  rect: FeedbackRect,
  feedback: PressFeedback,
): Readonly<{ pressScale: number; hoverScale: number }> {
  return Object.freeze(
    feedback === "stationary"
      ? { pressScale: 1, hoverScale: 1 }
      : {
          pressScale: pressScaleForRect(rect),
          hoverScale: hoverScaleForRect(rect),
        },
  );
}
