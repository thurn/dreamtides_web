import type { TutorialSpeechBubble, TutorialAction } from "../../types/tutorial";
import { tutorialInstructionPlainText } from "../../data/tutorial-instruction-markup";
function tutorialSpeechBubbleLogDetails(speechBubble: TutorialSpeechBubble) {
  const messageText = tutorialInstructionPlainText(speechBubble.text);
  return {
    speaker: speechBubble.speaker,
    durationSeconds: speechBubble.duration,
    horizontalOffsetPx: speechBubble.horizontalOffset,
    verticalOffsetPx: speechBubble.verticalOffset,
    bubbleWidthPx: speechBubble.bubbleWidth,
    messageText,
    ...(messageText === speechBubble.text
      ? {}
      : { messageMarkup: speechBubble.text }),
  };
}

/** Reconstruction fields logged whenever an authored tutorial action appears. */
export function tutorialActionLogDetails(
  action: TutorialAction,
) {
  if (action.action === "animate-avatar-portrait") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      owner: action.owner,
      portraitPauseSeconds: action.pause,
      portraitTravelSeconds: action.duration,
    };
  }
  if (action.action === "display-speech-bubble") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      speechBubble: tutorialSpeechBubbleLogDetails(action.speechBubble),
    };
  }
  if (action.action === "display-how-to-play") {
    const messageText = tutorialInstructionPlainText(action.text);
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      trigger: action.trigger ?? "player-turn-announcement-complete",
      ...(action.companion === undefined
        ? {}
        : { companion: action.companion }),
      ...(action.companion === "dreamwell-card"
        ? {
            presentationSequence: [
              "dreamwell-emergence",
              "instruction",
            ] as const,
            dreamwellEmergenceDurationSeconds: 1,
          }
        : {}),
      ...(action.cardWidth === undefined
        ? {}
        : { cardWidthPx: action.cardWidth }),
      title: "How to Play",
      messageText,
      ...(messageText === action.text ? {} : { messageMarkup: action.text }),
    };
  }
  if (action.action === "draw-dreamwell-card") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      cardId: action.cardId,
      cardFace: "up",
      owner: action.owner,
      sourceZone: "dreamwell",
      destinationPhase: "dawn",
      ...(action.revealDuration === undefined
        ? {}
        : { revealDurationSeconds: action.revealDuration }),
    };
  }
  if (action.action === "draw-card") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      cardId: action.cardId,
      cardFace: action.owner === "player" ? "up" : "down",
      owner: action.owner,
      reason: action.reason,
      sourceZone: `${action.owner}-deck`,
      destinationZone: `${action.owner}-hand`,
    };
  }
  if (action.action === "reveal-and-play-opponent-card") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      cardId: action.cardId,
      cardFace: "up",
      revealDurationSeconds: action.revealDuration,
      ...(action.speechBubble === undefined
        ? {}
        : {
            speechBubble: tutorialSpeechBubbleLogDetails(action.speechBubble),
          }),
      revealPlacement: "right-front-rank-intersection",
      sourceZone: "opponent-hand",
      destinationZone: "opponent-back-rank",
      destinationSlot: "center",
      entersExhausted: true,
      exhaustionClearsAt: "ending",
    };
  }
  if (action.action === "reposition-opponent-character") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      cardId: action.cardId,
      sourceZone: "opponent-back-rank",
      destinationZone: "opponent-front-rank",
      destinationSlot: "closest",
    };
  }
  if (action.action === "reposition-player-character") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      cardId: action.cardId,
      opposingCardId: action.opposingCardId,
      sourceZone: "player-back-rank",
      destinationZone: "player-front-rank",
      destinationSlot: "across-from-opponent",
    };
  }
  if (action.action === "resolve-challenge") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      challengerCardId: action.challengerCardId,
      blockerCardId: action.blockerCardId,
      sourceZone: "front-rank",
      loserDestinationZone: "controller-void",
      resolution: "compare-spark",
    };
  }
  if (action.action === "end-turn") {
    return {
      actionId: action.id,
      action: action.action,
      waitSeconds: action.wait,
      ...(action.speechBubble === undefined
        ? {}
        : {
            speechBubble: tutorialSpeechBubbleLogDetails(action.speechBubble),
          }),
      sourceSide: "player",
      destinationSide: "enemy",
      destinationPhase: "dawn",
    };
  }
  return {
    actionId: action.id,
    action: action.action,
    waitSeconds: action.wait,
    cardId: action.cardId,
    cardFace: "down",
    sourceZone: "opponent-deck",
    destinationZone: "opponent-hand",
  };
}
