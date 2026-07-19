/** Stable action names authored by the Tutorial Editor. */
export type TutorialActionName =
  | "display-speech-bubble"
  | "animate-dreamcaller-portrait";

/** Battle-status destination for an arriving tutorial Dreamcaller. */
export type TutorialDreamcallerOwner = "player" | "enemy";

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

/** Presents a Dreamcaller at large scale, then moves it into battle status. */
export interface AnimateDreamcallerPortraitTutorialAction
  extends TutorialActionBase {
  readonly action: "animate-dreamcaller-portrait";
  readonly owner: TutorialDreamcallerOwner;
  /** Seconds the fully revealed portrait remains large before it travels. */
  readonly pause: number;
  /** Seconds the portrait takes to scale down and travel into battle status. */
  readonly duration: number;
}

/** Exhaustive authored tutorial action model. */
export type TutorialAction =
  | DisplaySpeechBubbleTutorialAction
  | AnimateDreamcallerPortraitTutorialAction;

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
