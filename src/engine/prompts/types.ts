import type { Cost, PaymentCost } from "../dsl/types";
import type { CardSubtype } from "../../types/card-identity";
import type { AvatarId, CardId, DreamsignId, DreamwellSource, InstanceId, Side, Slot } from "../state/ids";

/**
 * The stable key of a prompt's choice, which the UI copy module renders. The
 * string is part of the prompt's fingerprint, so a role's spelling never
 * changes.
 */
export type PromptRole =
  /** The active side discards down to the hand limit at end of turn. */
  | "discardToHandLimit"
  /** The route a hand card is played by: mode 0 for its costs, mode 1 as an offering. */
  | "playRoute"
  /** The route a void card is played by: mode 0 by a play permission, for its normal costs; mode 1 by Reclaim. */
  | "voidRoute"
  /** The value of X in a cost. */
  | "chooseX"
  /** The mode of a modal ("choose one") effect. */
  | "chooseOne"
  /** The player an effect affects: mode 0 is the controller, mode 1 their opponent. */
  | "choosePlayer"
  /** The character type an effect names: the mode indexes the prompt's `subtypes`. */
  | "chooseSubtype"
  /** The unoccupied battlefield position a character moves to. */
  | "move"
  /** The targets of an ability. */
  | "target"
  /** Which alternative of an "A or B" cost to pay. */
  | "chooseCost"
  /** Whether to pay an optional cost. */
  | "optionalCost"
  /** Whether to pay energy for an optional effect during resolution. */
  | "optionalPayment"
  /** The characters abandoned to pay a cost. */
  | "abandonCost"
  /** The character its controller chooses to abandon as an effect resolves; not a target. */
  | "abandon"
  /** The character its controller keeps in play as the rest of their characters return to hand; not a target. */
  | "keep"
  /** The controlled characters returned to hand to pay a cost. */
  | "returnCost"
  /** The cards discarded to pay a cost. */
  | "discardCost"
  /** The cards revealed to pay a cost. */
  | "revealCost"
  /** The void cards banished to pay a cost. */
  | "banishCost"
  /** Void cards from either ownership paid with the new side-selecting cost. */
  | "banishAnyVoidCost"
  /** The hand cards banished to pay a cost. */
  | "offeringCost"
  /** The cards an effect discards. */
  | "discard"
  /** The opponent hand card the controller chooses to discard. */
  | "discardChosen"
  /** The opponent hand card the controller chooses to banish. */
  | "banishChosen"
  /** The opponent hand card the controller chooses so that it cannot be played. */
  | "restrictChosen"
  /** Where each looked-at card goes. */
  | "foresee"
  /** The cards its controller draws from among the top cards of their deck, which they look at. */
  | "lookAtTop"
  | "lookAtTopBanish"
  /** The card a discover puts into its controller's hand. */
  | "discover"
  /** The character its controller privately materializes from their current hand. */
  | "materializeChosen"
  /** The exact cost a Discover looks for, chosen freely as it resolves and never paid. */
  | "discoverCost"
  /** The card put into its controller's hand from among the cards an effect just moved. */
  | "chooseAmong"
  /** The card its controller puts into their hand from the opponent's hand, which they look at. */
  | "chooseFromOpponentHand"
  /** The hand cards its controller shuffles into their deck. */
  | "shuffleInto"
  /** Where each card its controller looked at on top of their deck goes: on top of it, on the bottom, into their hand, or into their void. */
  | "putInDeck"
  /** Whether to do a "you may". */
  | "youMay"
  /** Whether the prevented card's controller pays to stop the prevention. */
  | "preventUnlessPays"
  /** Whether the source controller's opponent pays to suppress its unpaid effect during resolution. */
  | "opponentUnlessPays"
  /** Whether the prevented card's controller abandons a character to stop the prevention; the character is chosen next, with role `abandon`. */
  | "preventUnlessAbandons";

/**
 * The emblem whose ability raised a prompt: a side's avatar or one of its
 * dreamsigns (by its position among that side's dreamsigns), with its
 * catalog UUID. Emblems are public, so every view of a prompt keeps it.
 */
export type PromptEmblem =
  | { readonly kind: "avatar"; readonly side: Side; readonly id: AvatarId }
  | { readonly kind: "dreamsign"; readonly side: Side; readonly index: number; readonly id: DreamsignId };

/** What raised a prompt: a card instance's ability or an emblem's. */
export type PromptSource = InstanceId | PromptEmblem | DreamwellSource;

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

/** Choose between `min` and `max` distinct targets in play, on the stack, or in a void. */
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

/** Choose an unoccupied battlefield position; the answer is its index in slots. */
export interface ChooseSlotPrompt extends PromptBase {
  readonly kind: "chooseSlot";
  /** The battlefield containing these positions, independent of the answering side. */
  readonly fieldSide: Side;
  readonly slots: readonly Slot[];
  readonly allowed?: readonly number[];
}

export interface ModeOption {
  /** Semantic play-route identity; present when a prompt includes an alternative base. */
  readonly route?: "normal" | "offering" | "reclaim" | "eventAlternative" | "alternativeCost";
  /** Authored alternative base payments; omitted from a concealed display projection. */
  readonly costs?: readonly Cost[];
  readonly mode: number;
  readonly legal: boolean;
}

/** Choose one legal mode; a play-time prompt marks a mode with no feasible continuation not legal. */
export interface ChooseModePrompt extends PromptBase {
  readonly kind: "chooseMode";
  readonly options: readonly ModeOption[];
  /** For a character type choice (role `chooseSubtype`), the type each mode names, by mode. */
  readonly subtypes?: readonly CardSubtype[];
  /** The exact payment alternatives of a `chooseCost` prompt, indexed by original mode. */
  readonly costOptions?: readonly (readonly PaymentCost[])[];
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
  | ChooseSlotPrompt
  | ChooseTargetsPrompt
  | ConfirmPrompt
  | PayOrDeclinePrompt;

export type PromptKind = Prompt["kind"];

/** An arrangement: each card with its destination; within a destination, earlier entries go first (top). */
export type ArrangeAnswer = readonly { readonly card: InstanceId; readonly to: ArrangeDestination }[];

export type Answer = readonly InstanceId[] | number | boolean | ArrangeAnswer;

export type AnswerFor<P extends Prompt> = P extends ChooseTargetsPrompt | ChooseCardsPrompt
  ? readonly InstanceId[]
  : P extends ChooseModePrompt | ChooseNumberPrompt | ChooseSlotPrompt
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
