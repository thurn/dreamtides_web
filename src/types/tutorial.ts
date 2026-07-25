/** Stable action names authored by the Tutorial Editor. */
export type TutorialActionName =
  | "display-speech-bubble"
  | "display-how-to-play"
  | "animate-dreamcaller-portrait"
  | "draw-opponent-card"
  | "reveal-and-play-opponent-card"
  | "reposition-opponent-character"
  | "reposition-player-character"
  | "resolve-challenge"
  | "draw-dreamwell-card"
  | "end-turn";

/** Battle-status destination for an arriving tutorial Dreamcaller. */
export type TutorialDreamcallerOwner = "player" | "enemy";

/** Character whose portrait anchors an authored tutorial speech bubble. */
export type TutorialSpeechBubbleSpeaker = "mira" | TutorialDreamcallerOwner;

/** Presentation event that opens an authored How to Play popup. */
export type TutorialHowToPlayTrigger =
  | "immediate"
  | "player-turn-announcement-complete"
  | "enemy-turn-announcement-complete";

/** Tangible game object presented alongside an authored instruction popup. */
export type TutorialHowToPlayCompanion = "dreamwell-card";

/** Fields shared by every authored tutorial action. */
export interface TutorialActionBase {
  readonly id: string;
  readonly action: TutorialActionName;
  /** Seconds to wait before the sequence advances from this action. */
  readonly wait: number;
}

/** Shows authored tutorial dialogue beside the selected speaker. */
export interface DisplaySpeechBubbleTutorialAction extends TutorialActionBase {
  readonly action: "display-speech-bubble";
  /** Defaults to Mira for tutorial snapshots authored before speaker selection. */
  readonly speaker?: TutorialSpeechBubbleSpeaker;
  /** Signed pixels added to Mira's computed vertical dialogue position. */
  readonly verticalOffset?: number;
  /** Desktop maximum width of the speech bubble, in pixels. */
  readonly bubbleWidth?: number;
  /** `[yellow]copy[/yellow]` highlights an exact inline run. */
  readonly text: string;
}

/** Shows the dismissible How to Play instruction popup. */
export interface DisplayHowToPlayTutorialAction extends TutorialActionBase {
  readonly action: "display-how-to-play";
  /** Defaults to the player-turn announcement for older authored snapshots. */
  readonly trigger?: TutorialHowToPlayTrigger;
  /** Optional game object paired with the instruction card. */
  readonly companion?: TutorialHowToPlayCompanion;
  /** Desktop width of the complete instruction card, in pixels. */
  readonly cardWidth?: number;
  /**
   * Authored instruction copy. Blank lines separate paragraphs,
   * `[yellow]copy[/yellow]` highlights an exact inline run, and `⍟` and `✦`
   * render as the points and spark glyphs.
   */
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
  /** UUID of the card represented by the face-down draw. */
  readonly cardId: string;
}

/** Reveals the opponent's hand card at reading scale, then plays it. */
export interface RevealAndPlayOpponentCardTutorialAction extends TutorialActionBase {
  readonly action: "reveal-and-play-opponent-card";
  /** UUID of the opponent hand card to reveal and play. */
  readonly cardId: string;
  /** Seconds the face-up card remains at reading scale before it travels. */
  readonly revealDuration: number;
  /** Optional Mira dialogue shown only while the card remains face up. */
  readonly revealText?: string;
  /** Signed pixels added to Mira's computed vertical dialogue position. */
  readonly verticalOffset?: number;
  /** Desktop maximum width of Mira's reveal speech bubble, in pixels. */
  readonly bubbleWidth?: number;
}

/** Moves one UUID-authored opponent character to its closest front-rank cell. */
export interface RepositionOpponentCharacterTutorialAction extends TutorialActionBase {
  readonly action: "reposition-opponent-character";
  readonly cardId: string;
}

/** Waits for the player to move one UUID-authored character across from an opponent. */
export interface RepositionPlayerCharacterTutorialAction extends TutorialActionBase {
  readonly action: "reposition-player-character";
  readonly cardId: string;
  readonly opposingCardId: string;
}

/** Resolves one UUID-authored challenger/defender pairing with unequal spark. */
export interface ResolveChallengeTutorialAction extends TutorialActionBase {
  readonly action: "resolve-challenge";
  readonly challengerCardId: string;
  readonly defenderCardId: string;
}

/** Draws and reveals one UUID-authored Dreamwell card for the selected side. */
export interface DrawDreamwellCardTutorialAction extends TutorialActionBase {
  readonly action: "draw-dreamwell-card";
  readonly owner: TutorialDreamcallerOwner;
  readonly cardId: string;
}

/** Waits for the player to play their tutorial card, then offers End Turn. */
export interface EndTurnTutorialAction extends TutorialActionBase {
  readonly action: "end-turn";
  /** Optional Mira dialogue shown after the tutorial card enters play. */
  readonly speechText?: string;
}

/** Exhaustive authored tutorial action model. */
export type TutorialAction =
  | DisplaySpeechBubbleTutorialAction
  | DisplayHowToPlayTutorialAction
  | AnimateDreamcallerPortraitTutorialAction
  | DrawOpponentCardTutorialAction
  | RevealAndPlayOpponentCardTutorialAction
  | RepositionOpponentCharacterTutorialAction
  | RepositionPlayerCharacterTutorialAction
  | ResolveChallengeTutorialAction
  | DrawDreamwellCardTutorialAction
  | EndTurnTutorialAction;

/** Local filesystem persistence state shown by the Tutorial Editor. */
export type TutorialEditorSaveStatus = "idle" | "saving" | "saved" | "error";

/** Optional cursor and transport metadata for a shared tutorial playback. */
export interface BeginTutorialOptions {
  /** Stable authored action id that should animate first. */
  readonly startActionId?: string;
  /** Durable deduplication key for automatic tutorial starts. */
  readonly intentKey?: string;
}

/** Shared result of the tutorial player's first card-play gesture. */
export interface TutorialPlayerCardPlay {
  readonly cardInstanceId: string;
  readonly cardId: string;
  readonly targetSlotId: string | null;
}

/** Event-log-owned progress for one shared tutorial playback. */
export interface TutorialPlaybackState {
  readonly runId: string;
  readonly actions: readonly TutorialAction[];
  /** Null after the last action completes. */
  readonly currentActionIndex: number | null;
  readonly playerCardPlay?: TutorialPlayerCardPlay | null;
}
