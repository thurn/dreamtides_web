/**
 * The ability DSL: typed, declarative ability data (D5). Each entity's
 * abilities sit beside its printed text in its content module, and one
 * interpreter executes them. Effect nodes come from the primitive registry
 * (effects/primitives/); later phases add static kinds.
 */
import type { CardSubtype } from "../../types/card-identity";
import type { Effect } from "../effects/registry";
import type { Zone } from "../state/ids";

/** The variant a card instance is played as. Phase 4 adds transfigurations and deck modifications. */
export interface Variant {
  readonly amplified: boolean;
}

export const BASE_VARIANT: Variant = { amplified: false };

/** A side relative to an effect's controller. */
export type PlayerRef = "you" | "opponent";

/** Which characters in play a selector matches. */
export interface CharacterSelector {
  readonly controller: "you" | "opponent" | "any";
  readonly subtype?: CardSubtype;
  /** Excludes the effect's source. */
  readonly another?: boolean;
  readonly sparkAtMost?: number;
  readonly sparkAtLeast?: number;
  readonly costAtMost?: number;
  readonly exhausted?: boolean;
  readonly rank?: "front" | "back";
}

/**
 * Which cards on the stack a selector matches. Activated abilities on the
 * stack are not cards, so no stack selector matches them.
 */
export interface StackItemSelector {
  readonly kind: "stackItem";
  /** Whose item, relative to the effect's controller. */
  readonly controller: "you" | "opponent" | "any";
  readonly cardType?: "character" | "event";
  /** Only items that can be prevented: excludes cards that cannot be prevented. */
  readonly preventable?: boolean;
}

/** A card on the stack chosen when the card or ability is played. */
export interface StackTargetSpec {
  readonly kind: "stackTarget";
  readonly selector: StackItemSelector;
}

/** A target chosen when the card is played (rules § Targeting). */
export interface TargetSpec {
  readonly kind: "target";
  readonly selector: CharacterSelector;
  /** How many targets; defaults to 1. */
  readonly count?: number;
  /** "Up to N": fewer targets, including none, are allowed. */
  readonly upTo?: boolean;
}

/** Every character matching a selector, chosen by nobody. */
export interface AllSpec {
  readonly kind: "all";
  readonly selector: CharacterSelector;
}

/** The effect's own source. */
export interface SelfSpec {
  readonly kind: "self";
}

/** The card the triggering event concerns ("it", "that character"), while it is in play. */
export interface SubjectSpec {
  readonly kind: "subject";
}

/** The characters a character effect applies to. */
export type CharacterRef = TargetSpec | AllSpec | SelfSpec | SubjectSpec;

/** Any target chosen at play time: characters in play or cards on the stack. */
export type PlayTimeTarget = TargetSpec | StackTargetSpec;

/** A number an effect reads when it resolves. */
export type ValueExpr =
  | number
  | { readonly value: "x" }
  | { readonly value: "count"; readonly of: CharacterSelector }
  | { readonly value: "handSize"; readonly player: PlayerRef };

/**
 * How long a change lasts (rules § Durations). "Until the opponent pays N●"
 * lets the opponent end it with the `payToEnd` action (C7).
 */
export type Duration =
  | "permanent"
  | "untilEndOfTurn"
  | "untilYourNextTurn"
  | "untilNextDay"
  | "whileSourceInPlay"
  | { readonly duration: "untilOpponentPays"; readonly cost: number };

/** A condition an effect checks when it resolves. */
export type Condition =
  | { readonly cond: "controls"; readonly selector: CharacterSelector; readonly atLeast: number }
  | { readonly cond: "energyAtLeast"; readonly amount: number }
  /**
   * "If the additional cost was paid": whether the item's optional cost at
   * index `optional` (in printed order) was paid when it was played. A copy
   * counts the original's optional costs as paid (rules § Playing Cards and
   * the Stack → Copies on the stack).
   */
  | { readonly cond: "costPaid"; readonly optional: number }
  /** "If this card is in your void": the source instance is in `zone`. An emblem is always in play. */
  | { readonly cond: "sourceIn"; readonly zone: Zone };

/** Keywords printed on a card. */
export type Keyword = "vengeful" | "awakened" | "cannotBePrevented";

/** A timing category: when a card or activated ability may be played (rules § Playing Cards and the Stack). */
export type Speed = "standard" | "fast" | "interrupt";

/** N●. */
export interface EnergyCost {
  readonly cost: "energy";
  readonly amount: number;
}

/**
 * X●, chosen as the card is played or the ability activated (rules § Costs,
 * Requirements, and X). X is at least `min`: 1, unless the definition widens
 * it to 0 because X=0 does something meaningful.
 */
export interface EnergyXCost {
  readonly cost: "energyX";
  readonly min: number;
}

/** A cost paid to play a card: its printed energy, fixed and X parts in printed order ("2 X" pays 2● first, then X●). */
export type CardCost = EnergyCost | EnergyXCost;

/** Which cards in a hidden or void zone a cost may use. */
export interface CardFilter {
  readonly cardType?: "character" | "event";
  readonly subtype?: CardSubtype;
}

/** A cost that pays one fixed thing (no X and no choice between costs). */
export type PaymentCost =
  | EnergyCost
  /** ☾: exhausts the source, a ready back-rank character or the avatar. */
  | { readonly cost: "exhaustSelf" }
  /** Abandon characters you control that match the selector. */
  | { readonly cost: "abandon"; readonly selector: CharacterSelector; readonly count: number }
  /** Discard cards from your hand. */
  | { readonly cost: "discard"; readonly count: number }
  /** N⧗: spend counters stored on the source (rules § Counters). */
  | { readonly cost: "counters"; readonly amount: number }
  /** Banish cards from your void that match the filter. */
  | { readonly cost: "banishFromVoid"; readonly count: number; readonly filter: CardFilter }
  /** Reveal cards from your hand that match the filter; they stay in hand. */
  | { readonly cost: "reveal"; readonly count: number; readonly filter: CardFilter };

/** "A or B": the player chooses one alternative and pays every cost in it. */
export interface ChoiceCost {
  readonly cost: "choice";
  readonly options: readonly (readonly PaymentCost[])[];
}

/**
 * "You may A": the player chooses whether to pay. Whether it was paid is
 * recorded on the stack item, and effects read it with the `costPaid`
 * condition.
 */
export interface OptionalCost {
  readonly cost: "optional";
  readonly costs: readonly PaymentCost[];
}

/** A card's additional cost ("To play this card, …"): anything but X. */
export type AdditionalCost = PaymentCost | ChoiceCost | OptionalCost;

/**
 * One cost of an activated ability or a card (engine-design § Costs). X is
 * only ever a top-level cost. Choices among costs are play-time prompts;
 * payment happens after the commit point, in printed order.
 */
export type Cost = AdditionalCost | EnergyXCost;

/** "Cost: Effect" — an ability its controller activates; it goes on the stack. */
export interface ActivatedAbility {
  readonly kind: "activated";
  readonly costs: readonly Cost[];
  readonly effect: Effect;
  readonly speed: Speed;
  readonly oncePerTurn?: boolean;
}

/**
 * "To play this card, …" or "You may … to play this card": costs a card adds
 * to its printed energy cost. They are chosen and paid with it, after it.
 */
export interface AdditionalCostAbility {
  readonly kind: "additionalCost";
  readonly costs: readonly AdditionalCost[];
}

/** The named (▸) triggers: each concerns the ability's own card or its controller's phase. */
export type NamedTrigger = "materialized" | "dawn" | "dusk" | "night" | "challenge" | "dissolved";

/** The cards a "when" trigger concerns: the ability's own card, or characters matching a selector. */
export type TriggerSubject = "self" | CharacterSelector;

/** What makes a triggered ability trigger (rules § Ability Types → Triggered abilities). */
export type Trigger =
  | { readonly on: NamedTrigger }
  /** "When you play your `nth` … this turn" counts only the plays that match. */
  | { readonly on: "play"; readonly player: PlayerRef; readonly filter: CardFilter; readonly nth?: number }
  | { readonly on: "materialize"; readonly subject: TriggerSubject }
  | { readonly on: "draw"; readonly player: PlayerRef; readonly nth?: number }
  | { readonly on: "discard"; readonly player: PlayerRef; readonly filter: CardFilter }
  | { readonly on: "abandon"; readonly player: PlayerRef; readonly filter: CardFilter }
  | { readonly on: "leavesPlay"; readonly subject: TriggerSubject }
  /** "When … scores ⍟": a challenge converts the character's spark into points. */
  | { readonly on: "scores"; readonly subject: TriggerSubject }
  /** "When the opponent scores ⍟": a character the opponent controls scores. */
  | { readonly on: "opponentScores" }
  | { readonly on: "leavesVoid"; readonly player: PlayerRef; readonly filter: CardFilter }
  /** "When you challenge with N or more …": once, as challengers are designated (C10). */
  | { readonly on: "challengeWith"; readonly count: number; readonly selector: CharacterSelector }
  | { readonly on: "startOfTurn" }
  | { readonly on: "startOfFirstTurn" }
  /** Combined triggers such as "▸Materialized, ▸Dawn" fire on each occasion. */
  | { readonly on: "either"; readonly triggers: readonly Trigger[] };

/**
 * Where a triggered ability works: in play, or the functional zones "void",
 * "hand", and "any" (play, void, hand, and deck). An emblem's abilities
 * always work.
 */
export type FunctionalZone = "play" | "void" | "hand" | "any";

/** "When …, …": an ability that triggers on an event and resolves without the stack (D14). */
export interface TriggeredAbility {
  readonly kind: "triggered";
  readonly trigger: Trigger;
  readonly effect: Effect;
  readonly zone: FunctionalZone;
  /** An intervening "if": checked when the ability triggers and again as it resolves. */
  readonly condition?: Condition;
  /** Triggers at most once each turn. */
  readonly oncePerTurn?: boolean;
}

export type Ability =
  | { readonly kind: "event"; readonly effect: Effect }
  | AdditionalCostAbility
  | { readonly kind: "keyword"; readonly keyword: Keyword }
  | ActivatedAbility
  | TriggeredAbility;

/** A card's abilities for a variant; the amplified flag selects amplified text's behavior. */
export type AbilityList = (variant: Variant) => readonly Ability[];
