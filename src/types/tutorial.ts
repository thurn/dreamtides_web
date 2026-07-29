/** Stable action names authored by the Tutorial Editor. */
export type TutorialActionName =
  | "display-speech-bubble"
  | "display-how-to-play"
  | "animate-dream-avatar-portrait"
  | "draw-card"
  | "draw-opponent-card"
  | "reveal-and-play-opponent-card"
  | "reposition-opponent-character"
  | "reposition-player-character"
  | "resolve-challenge"
  | "draw-dreamwell-card"
  | "end-turn";

/** Battle-status destination for an arriving tutorial DreamAvatar. */
export type TutorialDreamAvatarOwner = "player" | "enemy";

/** Character whose portrait anchors an authored tutorial speech bubble. */
export type TutorialSpeechBubbleSpeaker = "mira" | TutorialDreamAvatarOwner;

/** Context-specific delay authored for a reusable tutorial trigger. */
export type TutorialTriggerDelay = Readonly<
  Partial<Record<TutorialTriggerEvent, number>>
>;

/** Shared placement and copy authored for every tutorial speech bubble. */
export interface TutorialSpeechBubblePresentation {
  /** Character whose portrait anchors the bubble. */
  readonly speaker: TutorialSpeechBubbleSpeaker;
  /** Seconds after the owning tutorial surface becomes active before the bubble appears. */
  readonly delay?: number | TutorialTriggerDelay;
  /** Signed pixels added to the computed horizontal dialogue position. */
  readonly horizontalOffset: number;
  /** Signed pixels added to the computed vertical dialogue position. */
  readonly verticalOffset: number;
  /** Desktop maximum width of the speech bubble, in pixels. */
  readonly bubbleWidth: number;
  /** Yellow and event-frame purple markup highlight exact inline runs. */
  readonly text: string;
}

/** Persistent Mira guidance used by tutorial journey surfaces. */
export type TutorialPersistentSpeechBubble =
  TutorialSpeechBubblePresentation & {
    readonly speaker: "mira";
    readonly delay?: number;
  };

/** Shared authoring model for timed tutorial speech bubbles. */
export interface TutorialSpeechBubble extends TutorialSpeechBubblePresentation {
  /** Seconds the bubble remains visible after it appears. */
  readonly duration: number;
}

/** Persistent guidance shown beside the tutorial journey-start offer. */
export interface TutorialJourneyStartConfiguration {
  readonly speechBubble: TutorialPersistentSpeechBubble;
}

/** Persistent guidance shown over the first tutorial dreamscape. */
export interface TutorialDreamscapeConfiguration {
  readonly speechBubble: TutorialPersistentSpeechBubble;
}

/** Persistent Mira guidance shown on the first visit to one site type. */
export interface TutorialSiteConfiguration {
  readonly speechBubble: TutorialPersistentSpeechBubble;
}

/** Authoritative card-visibility or battle edge that may open a supplemental tutorial. */
export type TutorialTriggerEvent =
  | "card-seen"
  | "card-play"
  | "dreamwell-resolve"
  | "figment-created";

/** Stable semantic condition authored for a supplemental tutorial. */
export type TutorialTriggerMatcher =
  | {
      readonly kind: "glossary";
      readonly id: string;
    }
  | {
      readonly kind: "card-type";
      readonly cardType: "event";
    }
  | {
      readonly kind: "any";
    };

/** One TOML-authored first-occurrence tutorial shared across journey and battle. */
export interface TutorialTriggerDefinition
  extends Omit<TutorialSpeechBubble, "delay"> {
  readonly id: string;
  readonly on: readonly TutorialTriggerEvent[];
  readonly priority: number;
  readonly delay?: TutorialTriggerDelay;
  readonly match: TutorialTriggerMatcher;
}

/** Complete generated tutorial configuration. */
export interface TutorialConfiguration {
  readonly journeyStart: TutorialJourneyStartConfiguration;
  readonly dreamscape: TutorialDreamscapeConfiguration;
  readonly draft: TutorialSiteConfiguration;
  readonly dreamsignRevelation: TutorialSiteConfiguration;
  readonly actions: readonly TutorialAction[];
  readonly triggers: readonly TutorialTriggerDefinition[];
  readonly battle: TutorialBattleConfiguration;
}

/** UUID-authored draw order used after the tutorial enters playable battle. */
export interface TutorialBattleConfiguration {
  readonly playerDraws: readonly string[];
  readonly enemyDraws: readonly string[];
  /** Complete shared deck prefix, including authored pre-handoff draws. */
  readonly dreamwellDraws: readonly string[];
  /** One-shot, state-matched actions which take priority over heuristic AI. */
  readonly aiActionOverrides: readonly TutorialBattleAiActionOverride[];
}

/** A stable battle-state edge that can select one authored AI action. */
export interface TutorialBattleAfterDreamwellTrigger {
  readonly kind: "after-dreamwell";
  readonly side: "enemy";
  /** UUID of the Dreamwell card resolved on the current turn. */
  readonly cardId: string;
}

/** A semantic play submitted through the ordinary battle play-card event. */
export interface TutorialBattlePlayCardOverrideAction {
  readonly kind: "play-card";
  /** UUID of the card the AI should play from its hand. */
  readonly cardId: string;
}

/**
 * An authored, one-shot AI decision. The first state-matching override in
 * source order is planned before the heuristic AI.
 */
export interface TutorialBattleAiActionOverride {
  readonly id: string;
  readonly trigger: TutorialBattleAfterDreamwellTrigger;
  readonly action: TutorialBattlePlayCardOverrideAction;
}

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
  readonly speechBubble: TutorialSpeechBubble;
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
   * `[yellow]copy[/yellow]` applies yellow emphasis,
   * `[purple]copy[purple]` applies event-frame purple, and `⍟` and `✦` render
   * as the points and spark glyphs.
   */
  readonly text: string;
}

/** Presents a DreamAvatar at large scale, then moves it into battle status. */
export interface AnimateDreamAvatarPortraitTutorialAction extends TutorialActionBase {
  readonly action: "animate-dream-avatar-portrait";
  readonly owner: TutorialDreamAvatarOwner;
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

/** Draw purpose used to reconstruct scripted Dreamwell and turn draws. */
export type TutorialCardDrawReason = "dreamwell-effect" | "turn-draw";

/** Moves one UUID-authored card from the selected deck into its owner's hand. */
export interface DrawCardTutorialAction extends TutorialActionBase {
  readonly action: "draw-card";
  readonly owner: TutorialDreamAvatarOwner;
  readonly cardId: string;
  readonly reason: TutorialCardDrawReason;
}

/** Reveals the opponent's hand card at reading scale, then plays it. */
export interface RevealAndPlayOpponentCardTutorialAction extends TutorialActionBase {
  readonly action: "reveal-and-play-opponent-card";
  /** UUID of the opponent hand card to reveal and play. */
  readonly cardId: string;
  /** Seconds the face-up card remains at reading scale before it travels. */
  readonly revealDuration: number;
  /** Optional dialogue shown only while the card remains face up. */
  readonly speechBubble?: TutorialSpeechBubble;
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

/** Resolves one UUID-authored challenger/blocker pairing with unequal spark. */
export interface ResolveChallengeTutorialAction extends TutorialActionBase {
  readonly action: "resolve-challenge";
  readonly challengerCardId: string;
  readonly blockerCardId: string;
}

/** Draws and reveals one UUID-authored Dreamwell card for the selected side. */
export interface DrawDreamwellCardTutorialAction extends TutorialActionBase {
  readonly action: "draw-dreamwell-card";
  readonly owner: TutorialDreamAvatarOwner;
  readonly cardId: string;
  /** Seconds the emerged card remains readable before its effect applies. */
  readonly revealDuration?: number;
}

/** Waits for the player to play their tutorial card, then offers End Turn. */
export interface EndTurnTutorialAction extends TutorialActionBase {
  readonly action: "end-turn";
  /** Optional dialogue shown after the tutorial card enters play. */
  readonly speechBubble?: TutorialSpeechBubble;
}

/** Exhaustive authored tutorial action model. */
export type TutorialAction =
  | DisplaySpeechBubbleTutorialAction
  | DisplayHowToPlayTutorialAction
  | AnimateDreamAvatarPortraitTutorialAction
  | DrawCardTutorialAction
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
  /** Preserve the authored snapshot while placing its shared cursor at the end. */
  readonly startAtEnd?: boolean;
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
