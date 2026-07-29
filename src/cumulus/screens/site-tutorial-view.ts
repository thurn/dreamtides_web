import type { CharacterDialogueModel } from "../components/overlay/CharacterDialogue";

/** Persistent Mira guidance rendered throughout one first site visit. */
export interface FirstVisitSiteTutorialView {
  readonly id: string;
  readonly model: CharacterDialogueModel;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly bubbleWidth: number;
}
