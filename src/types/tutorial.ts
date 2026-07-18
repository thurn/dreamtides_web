/** Stable action names authored by the Tutorial Editor. */
export type TutorialActionName = "display-speech-bubble";

/** Fields shared by every authored tutorial action. */
export interface TutorialActionBase {
  readonly id: string;
  readonly action: TutorialActionName;
  /** Seconds to wait before the sequence advances from this action. */
  readonly wait: number;
}

/** Shows Mira's tutorial dialogue with authored plain text. */
export interface DisplaySpeechBubbleTutorialAction
  extends TutorialActionBase {
  readonly action: "display-speech-bubble";
  readonly text: string;
}

/** Exhaustive authored tutorial action model. */
export type TutorialAction = DisplaySpeechBubbleTutorialAction;

/** Local filesystem persistence state shown by the Tutorial Editor. */
export type TutorialEditorSaveStatus =
  | "idle"
  | "saving"
  | "saved"
  | "error";

/** Event-log-owned progress for one shared tutorial playback. */
export interface TutorialPlaybackState {
  readonly runId: string;
  readonly actions: readonly TutorialAction[];
  /** Null after the last action completes. */
  readonly currentActionIndex: number | null;
}
