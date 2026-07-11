export interface FeedbackRect { readonly width: number; readonly height: number }
export type RevealFeedback = "scale" | "stationary";

const clamp = (value: number, minimum: number, maximum: number): number => Math.min(maximum, Math.max(minimum, value));
const minimumDimension = (rect: FeedbackRect): number => Math.max(1, Math.min(rect.width, rect.height));

export function pressScaleForRect(rect: FeedbackRect): number {
  return clamp(1 - 6 / minimumDimension(rect), 0.9, 0.98);
}

export function hoverScaleForRect(rect: FeedbackRect): number {
  return clamp(1 + 4 / minimumDimension(rect), 1.01, 1.03);
}

export function feedbackForRect(rect: FeedbackRect, feedback: RevealFeedback): Readonly<{ pressScale: number; hoverScale: number }> {
  return Object.freeze(feedback === "stationary"
    ? { pressScale: 1, hoverScale: 1 }
    : { pressScale: pressScaleForRect(rect), hoverScale: hoverScaleForRect(rect) });
}
