import { describe, expect, it } from "vitest";
import { tutorialSpeechBubbleDelaySeconds } from "./tutorial-speech-bubble";

describe("tutorialSpeechBubbleDelaySeconds", () => {
  it("resolves scalar and event-specific delays without leaking between events", () => {
    expect(tutorialSpeechBubbleDelaySeconds({ delay: 1 })).toBe(1);
    const trigger = { delay: { "card-seen": 1 } } as const;
    expect(tutorialSpeechBubbleDelaySeconds(trigger, "card-seen")).toBe(1);
    expect(tutorialSpeechBubbleDelaySeconds(trigger, "card-play")).toBe(0);
    expect(tutorialSpeechBubbleDelaySeconds(trigger, "dreamwell-resolve")).toBe(
      0,
    );
  });
});
