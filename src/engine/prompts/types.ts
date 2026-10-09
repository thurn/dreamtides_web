import type { AvatarId, CardId, DreamsignId, InstanceId, Side } from "../state/ids";

/**
 * The stable key of a prompt's choice, which the UI copy module renders. The
 * string is part of the prompt's fingerprint, so a role's spelling never
 * changes.
 */
export type PromptRole =
  /** The active side discards down to the hand limit at end of turn. */
  | "discardToHandLimit"
  /** The route a card is played by: from hand, as an offering, or by reclaim. */
  | "playRoute"
  /** The value of X in a cost. */
  | "chooseX"
  /** The mode of a modal ("choose one") effect. */
  | "chooseOne"
  /** The targets of an ability. */
  | "target"
  /** Which alternative of an "A or B" cost to pay. */
  | "chooseCost"
  /** Whether to pay an optional cost. */
  | "optionalCost"
  /** The characters abandoned to pay a cost. */
  | "abandonCost"
  /** The cards discarded to pay a cost. */
  | "discardCost"
  /** The cards revealed to pay a cost. */
  | "revealCost"
  /** The void cards banished to pay a cost. */
  | "banishCost"
  /** The hand cards banished to pay a cost. */
  | "offeringCost"
  /** The cards an effect discards. */
  | "discard"
  /** Where each looked-at card goes. */
  | "foresee"
  /** Whether to do a "you may". */
  | "youMay"
  /** Whether the prevented card's controller pays to stop the prevention. */
  | "preventUnlessPays";

/**
 * The emblem whose ability raised a prompt: a side's avatar or one of its
 * dreamsigns (by its position among that side's dreamsigns), with its
 * catalog UUID. Emblems are public, so every view of a prompt keeps it.
 */
export type PromptEmblem =
  | { readonly kind: "avatar"; readonly side: Side; readonly id: AvatarId }
  | { readonly kind: "dreamsign"; readonly side: Side; readonly index: number; readonly id: DreamsignId };

/** What raised a prompt: a card instance's ability or an emblem's. */
export type PromptSource = InstanceId | PromptEmblem;

/**
 * Why a prompt was raised: its source and the role of the choice. Never
 * prose. The purpose is part of the prompt's fingerprint.
 */
export interface PromptPurpose {
  /**
   * The card instance or emblem whose ability asks; `null` for a prompt of
   * the rules themselves (the hand limit) or, in a view, for a card the
   * viewer cannot identify.
   */
  readonly source: PromptSource | null;
  /** The printed card of a card source; `null` for a figment, an emblem, or no source. */
  readonly cardId: CardId | null;
  readonly ability: number | null;
  readonly role: PromptRole;
}

export type { PromptId } from "../../types/identifiers";

/** A prompt's fingerprint: a hash of its identifying fields. */
export type PromptFingerprint = string & { readonly __brand: "PromptFingerprint" };

interface PromptBase {
  /** The side that answers. */
  readonly side: Side;
  readonly purpose: PromptPurpose;
  /** Only before the commit point of the acting side's own play. */
  readonly cancellable: boolean;
  /** Cards revealed only to the chooser, such as "look at the top 4". */
  readonly privateTo?: Side;
}

/** Choose between `min` and `max` distinct targets in play or on the stack. */
export interface ChooseTargetsPrompt extends PromptBase {
  readonly kind: "chooseTargets";
  readonly candidates: readonly InstanceId[];
  readonly min: number;
  readonly max: number;
  /**
   * The complete list of legal answers, present only when the engine withheld
   * answers the other fields allow: a play-time prompt offers only answers
   * from which some continuation reaches the commit point with payable costs
   * (engine-design § Legality by search).
   */
  readonly allowed?: readonly (readonly InstanceId[])[];
}

/** Choose between `min` and `max` distinct cards from a zone. */
export interface ChooseCardsPrompt extends PromptBase {
  readonly kind: "chooseCards";
  readonly candidates: readonly InstanceId[];
  readonly min: number;
  readonly max: number;
  /**
   * The complete list of legal answers, present only when the engine withheld
   * answers the other fields allow: a play-time prompt offers only answers
   * from which some continuation reaches the commit point with payable costs
   * (engine-design § Legality by search).
   */
  readonly allowed?: readonly (readonly InstanceId[])[];
}

export interface ModeOption {
  readonly mode: number;
  readonly legal: boolean;
}

/** Choose one legal mode; a play-time prompt marks a mode with no feasible continuation not legal. */
export interface ChooseModePrompt extends PromptBase {
  readonly kind: "chooseMode";
  readonly options: readonly ModeOption[];
}

/** Choose an integer in `[min, max]`, such as the value of X. */
export interface ChooseNumberPrompt extends PromptBase {
  readonly kind: "chooseNumber";
  readonly min: number;
  readonly max: number;
  /**
   * The complete list of legal answers, present only when the engine withheld
   * answers the other fields allow: a play-time prompt offers only answers
   * from which some continuation reaches the commit point with payable costs
   * (engine-design § Legality by search).
   */
  readonly allowed?: readonly number[];
}

export type ArrangeDestination = "top" | "bottom" | "void" | "hand";

/** One allowed destination of an arrangement and how many cards it takes. */
export interface ArrangeSlot {
  readonly to: ArrangeDestination;
  /** The fewest cards this destination must receive. */
  readonly min: number;
  /** The most cards this destination may receive. */
  readonly max: number;
}

/**
 * Place every listed card in one of the allowed destinations, in order, with
 * each destination receiving between its `min` and `max` cards. "One on top
 * and one on bottom" is `[{ to: "top", min: 1, max: 1 }, { to: "bottom", min: 1, max: 1 }]`.
 */
export interface ArrangePrompt extends PromptBase {
  readonly kind: "arrange";
  readonly cards: readonly InstanceId[];
  /** Distinct destinations, each listed once. */
  readonly destinations: readonly ArrangeSlot[];
  /**
   * The complete list of legal answers, present only when the engine withheld
   * answers the other fields allow: a play-time prompt offers only answers
   * from which some continuation reaches the commit point with payable costs
   * (engine-design § Legality by search).
   */
  readonly allowed?: readonly ArrangeAnswer[];
}

/** Accept or decline a "you may". */
export interface ConfirmPrompt extends PromptBase {
  readonly kind: "confirm";
  /**
   * The complete list of legal answers, present only when the engine withheld
   * answers the other fields allow: a play-time prompt offers only answers
   * from which some continuation reaches the commit point with payable costs
   * (engine-design § Legality by search).
   */
  readonly allowed?: readonly boolean[];
}

/** Pay an "unless" cost, or decline. `payable` is false when the cost cannot be paid. */
export interface PayOrDeclinePrompt extends PromptBase {
  readonly kind: "payOrDecline";
  readonly energy: number;
  readonly payable: boolean;
  /**
   * The complete list of legal answers, present only when the engine withheld
   * answers the other fields allow: a play-time prompt offers only answers
   * from which some continuation reaches the commit point with payable costs
   * (engine-design § Legality by search).
   */
  readonly allowed?: readonly boolean[];
}

export type Prompt =
  | ArrangePrompt
  | ChooseCardsPrompt
  | ChooseModePrompt
  | ChooseNumberPrompt
  | ChooseTargetsPrompt
  | ConfirmPrompt
  | PayOrDeclinePrompt;

export type PromptKind = Prompt["kind"];

/** An arrangement: each card with its destination; within a destination, earlier entries go first (top). */
export type ArrangeAnswer = readonly { readonly card: InstanceId; readonly to: ArrangeDestination }[];

export type Answer = readonly InstanceId[] | number | boolean | ArrangeAnswer;

export type AnswerFor<P extends Prompt> = P extends ChooseTargetsPrompt | ChooseCardsPrompt
  ? readonly InstanceId[]
  : P extends ChooseModePrompt | ChooseNumberPrompt
    ? number
    : P extends ConfirmPrompt | PayOrDeclinePrompt
      ? boolean
      : P extends ArrangePrompt
        ? ArrangeAnswer
        : never;

/** What rules code passes to `choose`: the context fills in `cancellable`. */
export type PromptSpec<P extends Prompt = Prompt> = P extends Prompt
  ? Omit<P, "cancellable">
  : never;
