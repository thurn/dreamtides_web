import { describe, expect, it } from "vitest";
import { feedbackForRect, hoverScaleForRect, pressScaleForRect } from "./feedback";

describe("reveal feedback", () => {
  it.each([
    [{ width: 44, height: 80 }, 1 - 6 / 80],
    [{ width: 100, height: 140 }, 1 - 6 / 140],
    [{ width: 220, height: 330 }, 0.98],
    [{ width: 340, height: 510 }, 0.98],
  ])("computes physical press movement for %j", (rect, expected) => expect(pressScaleForRect(rect)).toBeCloseTo(expected));

  it.each([
    [{ width: 44, height: 80 }, 1.03],
    [{ width: 220, height: 330 }, 1 + 4 / 330],
    [{ width: 500, height: 700 }, 1.01],
  ])("computes physical hover movement for %j", (rect, expected) => expect(hoverScaleForRect(rect)).toBeCloseTo(expected));

  it("captures stable values and supports stationary inline text", () => {
    const rect = { width: 100, height: 200 };
    expect(feedbackForRect(rect, "scale")).toEqual({ pressScale: 0.97, hoverScale: 1.02 });
    expect(feedbackForRect(rect, "stationary")).toEqual({ pressScale: 1, hoverScale: 1 });
  });
});
