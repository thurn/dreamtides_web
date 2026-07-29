import type { CharacterDialogueModel } from "../components/overlay/CharacterDialogue";

/** Shared presentation contract for delayed tutorial speech bubbles. */
export interface TutorialSpeechBubbleView {
  readonly id?: string;
  readonly model: CharacterDialogueModel;
  readonly delaySeconds?: number;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly bubbleWidth: number;
}
