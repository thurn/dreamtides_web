import type {
  TutorialSpeechBubblePresentation,
  TutorialTriggerEvent,
} from "../types/tutorial";

/** Resolve scalar or event-specific authored speech-bubble timing. */
export function tutorialSpeechBubbleDelaySeconds(
  speechBubble: Pick<TutorialSpeechBubblePresentation, "delay">,
  event?: TutorialTriggerEvent,
): number {
  const { delay } = speechBubble;
  if (typeof delay === "number") return delay;
  if (delay === undefined || event === undefined) return 0;
  return delay[event] ?? 0;
}
