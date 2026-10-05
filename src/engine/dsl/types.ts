/**
 * The ability DSL: typed, declarative ability data (D5). Each entity's
 * abilities sit beside its printed text in its content module, and one
 * interpreter executes them. Effect nodes come from the primitive registry
 * (effects/primitives/); later phases add trigger, cost, and static kinds.
 */
import type { CardSubtype } from "../../types/card-identity";
import type { Effect } from "../effects/registry";

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

/** The characters a character effect applies to. */
export type CharacterRef = TargetSpec | AllSpec | SelfSpec;

/** Any target chosen at play time: characters in play or cards on the stack. */
export type PlayTimeTarget = TargetSpec | StackTargetSpec;

/** A number an effect reads when it resolves. */
export type ValueExpr =
  | number
  | { readonly value: "x" }
  | { readonly value: "count"; readonly of: CharacterSelector }
  | { readonly value: "handSize"; readonly player: PlayerRef };

/** How long a change lasts. Phase 3.6 adds the remaining duration kinds. */
export type Duration = "permanent" | "untilEndOfTurn";

/** A condition an effect checks when it resolves. */
export type Condition =
  | { readonly cond: "controls"; readonly selector: CharacterSelector; readonly atLeast: number }
  | { readonly cond: "energyAtLeast"; readonly amount: number };

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

/**
 * One cost of an activated ability or a card (engine-design § Costs). Choices
 * among costs are play-time prompts; payment happens after the commit point.
 */
export type Cost =
  | EnergyCost
  | EnergyXCost
  /** ☾: exhausts the source, a ready back-rank character or the avatar. */
  | { readonly cost: "exhaustSelf" }
  /** Abandon characters you control that match the selector. */
  | { readonly cost: "abandon"; readonly selector: CharacterSelector; readonly count: number }
  /** Discard cards from your hand. */
  | { readonly cost: "discard"; readonly count: number };

/** "Cost: Effect" — an ability its controller activates; it goes on the stack. */
export interface ActivatedAbility {
  readonly kind: "activated";
  readonly costs: readonly Cost[];
  readonly effect: Effect;
  readonly speed: Speed;
  readonly oncePerTurn?: boolean;
}

export type Ability =
  | { readonly kind: "event"; readonly effect: Effect }
  | { readonly kind: "keyword"; readonly keyword: Keyword }
  | ActivatedAbility;

/** A card's abilities for a variant; the amplified flag selects amplified text's behavior. */
export type AbilityList = (variant: Variant) => readonly Ability[];
