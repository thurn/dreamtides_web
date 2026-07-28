import { describe, expect, it } from "vitest";
import { placeCardTutorialDialogue } from "./card-tutorial-dialogue-placement";

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
      obstacleRects: [
        rect(159, 602, 72, 22),
        rect(0, 774, 390, 70),
      ],
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
});
