import type { CharacterDialogueModel } from "../components/overlay/CharacterDialogue";

/** Mira guidance rendered for the initial teaching window of a first site visit. */
export interface FirstVisitSiteTutorialView {
  readonly id: string;
  readonly model: CharacterDialogueModel;
  readonly horizontalOffset: number;
  readonly verticalOffset: number;
  readonly bubbleWidth: number;
}
