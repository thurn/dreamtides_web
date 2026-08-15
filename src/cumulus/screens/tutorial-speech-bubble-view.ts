import type { CharacterDialogueModel } from "../components/overlay/CharacterDialogue";
import type { PresentationId } from "../../types/identifiers";

/** Shared presentation contract for delayed tutorial speech bubbles. */
export interface TutorialSpeechBubbleView {
  readonly id: PresentationId;
  readonly model: CharacterDialogueModel;
  readonly delaySeconds?: number;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly bubbleWidth: number;
}
