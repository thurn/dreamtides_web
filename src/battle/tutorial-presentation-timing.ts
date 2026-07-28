import type { TutorialGuidancePresentation } from "../rules/battle/fold";

/** Minimum readable window for an automated opponent card before it is played. */
export const TUTORIAL_OPPONENT_PLAY_REVEAL_DWELL_MS = 2_000;

/**
 * Complete duration of one tutorial Challenge result animation. This matches
 * four `--dur-slow` motion steps on the Cumulus presentation.
 */
export const TUTORIAL_CHALLENGE_PRESENTATION_DWELL_MS = 1_680;

/** Whether this guidance already presents an automated opponent card at reveal size. */
export function isAutomaticOpponentPlayGuidance(
  presentation: TutorialGuidancePresentation,
): boolean {
  return (
    presentation.source.kind === "card" &&
    presentation.source.side === "enemy" &&
    presentation.continuation.kind === "play-card" &&
    presentation.continuation.automatic
  );
}

/**
 * Effective duration for the current guidance message. The card stays visible
 * across every message, so only the final message absorbs any shortfall needed
 * to make the complete guidance journey at least two seconds.
 */
export function tutorialGuidanceMessageDurationSeconds(
  presentation: TutorialGuidancePresentation,
): number {
  const message = presentation.messages[presentation.messageIndex];
  if (message === undefined) return 0;
  if (!isAutomaticOpponentPlayGuidance(presentation)) {
    return message.duration;
  }
  const authoredTotal = presentation.messages.reduce(
    (total, candidate) => total + candidate.duration,
    0,
  );
  const shortfall = Math.max(
    0,
    TUTORIAL_OPPONENT_PLAY_REVEAL_DWELL_MS / 1_000 - authoredTotal,
  );
  return presentation.messageIndex === presentation.messages.length - 1
    ? message.duration + shortfall
    : message.duration;
}
