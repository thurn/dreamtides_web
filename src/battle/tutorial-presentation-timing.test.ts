import { describe, expect, it } from "vitest";
import type {
  TutorialGuidanceMessage,
  TutorialGuidancePresentation,
} from "../rules/battle/fold";
import {
  isAutomaticOpponentPlayGuidance,
  tutorialGuidanceMessageDurationSeconds,
} from "./tutorial-presentation-timing";
import { asCardId } from "../types/card-identity";
import { asBattleCardId } from "../types/identifiers";
import { asTutorialTriggerId } from "../types/identifiers";
import { asPresentationId } from "../types/identifiers";

function message(duration: number): TutorialGuidanceMessage {
  return {
    triggerId: asTutorialTriggerId(`trigger-${String(duration)}`),
    speaker: "mira",
    text: "Fixture guidance.",
    duration,
    horizontalOffset: 0,
    verticalOffset: 0,
    bubbleWidth: 500,
  };
}

function presentation(
  durations: readonly number[],
  messageIndex: number,
  automatic = true,
): TutorialGuidancePresentation {
  return {
    id: asPresentationId("tutorial-guidance:enemy-card"),
    kind: "tutorial-guidance",
    source: {
      kind: "card",
      cardId: asCardId("229ab3a1-3720-41a2-924c-8fe112188f8e"),
      battleCardId: asBattleCardId("enemy-card"),
      cardKind: "character",
      side: "enemy",
    },
    messages: durations.map(message),
    messageIndex,
    continuation: {
      kind: "play-card",
      payload: {},
      automatic,
    },
  };
}

describe("tutorial presentation timing", () => {
  it("keeps authored opponent guidance timing when it already exceeds the reveal minimum", () => {
    const guidance = presentation([5], 0);

    expect(isAutomaticOpponentPlayGuidance(guidance)).toBe(true);
    expect(tutorialGuidanceMessageDurationSeconds(guidance)).toBe(5);
  });

  it("pads only the last message when the complete guidance is shorter than two seconds", () => {
    expect(
      tutorialGuidanceMessageDurationSeconds(presentation([0.5, 0.75], 0)),
    ).toBe(0.5);
    expect(
      tutorialGuidanceMessageDurationSeconds(presentation([0.5, 0.75], 1)),
    ).toBe(1.5);
  });

  it("does not alter guidance that is not an automatic opponent play", () => {
    const guidance = presentation([1], 0, false);

    expect(isAutomaticOpponentPlayGuidance(guidance)).toBe(false);
    expect(tutorialGuidanceMessageDurationSeconds(guidance)).toBe(1);
  });
});
