import { describe, expect, it } from "vitest";
import {
  makeSpeechBubblePath,
  speechBubblePointerTip,
} from "./speech-bubble-geometry";

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
