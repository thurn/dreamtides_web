/** Stable action names authored by the Tutorial Editor. */
export type TutorialActionName =
  | "display-speech-bubble"
  | "animate-dreamcaller-portrait"
  | "draw-opponent-card"
  | "reveal-and-play-opponent-card";

/** Battle-status destination for an arriving tutorial Dreamcaller. */
export type TutorialDreamcallerOwner = "player" | "enemy";

/** Character whose portrait anchors an authored tutorial speech bubble. */
export type TutorialSpeechBubbleSpeaker = "mira" | TutorialDreamcallerOwner;

/** Fields shared by every authored tutorial action. */
export interface TutorialActionBase {
  readonly id: string;
  readonly action: TutorialActionName;
  /** Seconds to wait before the sequence advances from this action. */
  readonly wait: number;
}

/** Shows Mira's tutorial dialogue with authored plain text. */
export interface DisplaySpeechBubbleTutorialAction extends TutorialActionBase {
  readonly action: "display-speech-bubble";
  /** Defaults to Mira for tutorial snapshots authored before speaker selection. */
  readonly speaker?: TutorialSpeechBubbleSpeaker;
  readonly text: string;
}

/** Presents a Dreamcaller at large scale, then moves it into battle status. */
export interface AnimateDreamcallerPortraitTutorialAction extends TutorialActionBase {
  readonly action: "animate-dreamcaller-portrait";
  readonly owner: TutorialDreamcallerOwner;
  /** Seconds the fully revealed portrait remains large before it travels. */
  readonly pause: number;
  /** Seconds the portrait takes to scale down and travel into battle status. */
  readonly duration: number;
}

/** Moves the top face-down card of the opponent's deck into their hand. */
export interface DrawOpponentCardTutorialAction extends TutorialActionBase {
  readonly action: "draw-opponent-card";
}

/** Reveals the opponent's hand card at reading scale, then plays it. */
export interface RevealAndPlayOpponentCardTutorialAction extends TutorialActionBase {
  readonly action: "reveal-and-play-opponent-card";
  /** Seconds the face-up card remains at reading scale before it travels. */
  readonly revealDuration: number;
}

/** Exhaustive authored tutorial action model. */
export type TutorialAction =
  | DisplaySpeechBubbleTutorialAction
  | AnimateDreamcallerPortraitTutorialAction
  | DrawOpponentCardTutorialAction
  | RevealAndPlayOpponentCardTutorialAction;

/** Local filesystem persistence state shown by the Tutorial Editor. */
export type TutorialEditorSaveStatus = "idle" | "saving" | "saved" | "error";

/** Optional cursor and transport metadata for a shared tutorial playback. */
export interface BeginTutorialOptions {
  /** Stable authored action id that should animate first. */
  readonly startActionId?: string;
  /** Durable deduplication key for automatic tutorial starts. */
  readonly intentKey?: string;
}

/** Event-log-owned progress for one shared tutorial playback. */
export interface TutorialPlaybackState {
  readonly runId: string;
  readonly actions: readonly TutorialAction[];
  /** Null after the last action completes. */
  readonly currentActionIndex: number | null;
}
