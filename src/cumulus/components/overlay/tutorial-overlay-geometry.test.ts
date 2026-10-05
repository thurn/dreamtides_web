import { describe, expect, it } from "vitest";
import {
  makeSpeechBubblePath,
  speechBubblePointerTip,
} from "./speech-bubble-geometry";
import {
  placeCardTutorialDialogue,
  placeTutorialDialogueAboveAnchor,
} from "./tutorial-placement";

function rect(left: number, top: number, width: number, height: number) {
  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
  };
}

describe("placeCardTutorialDialogue", () => {
  it("places Mira above a four-card desktop draft row", () => {
    const position = placeCardTutorialDialogue({
      viewportWidth: 1440,
      viewportHeight: 900,
      dialogueWidth: 300,
      dialogueHeight: 100,
      cardRects: [
        rect(100, 240, 280, 392),
        rect(420, 240, 280, 392),
        rect(740, 240, 280, 392),
        rect(1060, 240, 280, 392),
      ],
      gap: 8,
    });

    expect(position).toEqual({ left: 570, top: 132 });
  });

  it("uses the clear band below a narrow two-row draft grid", () => {
    const position = placeCardTutorialDialogue({
      viewportWidth: 390,
      viewportHeight: 844,
      dialogueWidth: 300,
      dialogueHeight: 96,
      cardRects: [
        rect(8, 72, 185, 259),
        rect(197, 72, 185, 259),
        rect(8, 335, 185, 259),
        rect(197, 335, 185, 259),
      ],
      obstacleRects: [rect(159, 602, 72, 22), rect(0, 774, 390, 70)],
      gap: 8,
    });

    expect(position).toEqual({ left: 45, top: 632 });
  });

  it("moves outside a gallery instead of covering its header", () => {
    const position = placeCardTutorialDialogue({
      viewportWidth: 1440,
      viewportHeight: 900,
      dialogueWidth: 300,
      dialogueHeight: 105,
      cardRects: [
        rect(710, 310, 150, 210),
        rect(875, 310, 150, 210),
        rect(1040, 310, 150, 210),
        rect(1205, 310, 150, 210),
      ],
      obstacleRects: [rect(680, 180, 700, 600)],
      gap: 8,
    });

    expect(position).toEqual({ left: 570, top: 8 });
  });

  it("avoids site controls when guidance has no card source", () => {
    const obstacle = rect(8, 8, 784, 180);
    const position = placeCardTutorialDialogue({
      viewportWidth: 800,
      viewportHeight: 600,
      dialogueWidth: 420,
      dialogueHeight: 120,
      cardRects: [],
      obstacleRects: [obstacle],
      gap: 8,
    });

    expect(position.top).toBe(196);
    expect(position.top).toBeGreaterThanOrEqual(obstacle.bottom + 8);
  });

  it("anchors site guidance directly above its narrative panel", () => {
    const narrative = rect(12, 620, 400, 210);
    const position = placeTutorialDialogueAboveAnchor({
      viewportWidth: 1440,
      viewportHeight: 900,
      dialogueWidth: 500,
      dialogueHeight: 100,
      anchorRect: narrative,
      gap: 8,
    });

    expect(position).toEqual({ left: 12, bottom: 288 });
    if (position === null) throw new Error("Expected anchored placement.");
    expect(900 - position.bottom - 100).toBe(512);
  });

  it("keeps floating dialogue inside every physical safe-area edge", () => {
    const point = placeCardTutorialDialogue({
      viewportWidth: 390,
      viewportHeight: 844,
      dialogueWidth: 300,
      dialogueHeight: 160,
      cardRects: [],
      gap: 8,
      safeAreaInsets: { top: 47, right: 12, bottom: 34, left: 10 },
    });
    expect(point.left).toBeGreaterThanOrEqual(18);
    expect(point.left + 300).toBeLessThanOrEqual(370);
    expect(point.top).toBeGreaterThanOrEqual(55);
    expect(point.top + 160).toBeLessThanOrEqual(802);
  });
});

describe("speech bubble pointer geometry", () => {
  it("places the top-left pointer base entirely on the flat top edge", () => {
    expect(speechBubblePointerTip(200, 100, "top-left")).toEqual({
      x: 44,
      y: 0,
    });
    expect(makeSpeechBubblePath(200, 100, "top-left")).toContain(
      "M 8 14 H 34 L 44 0 L 54 14 H 192",
    );
  });

  it("clamps the bottom-left pointer base outside the corner radius", () => {
    expect(speechBubblePointerTip(60, 100, "bottom-left")).toEqual({
      x: 18,
      y: 100,
    });
    expect(makeSpeechBubblePath(60, 100, "bottom-left")).toContain(
      "H 28 L 18 100 L 8 86 H 8",
    );
  });
});
