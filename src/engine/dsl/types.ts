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
export type Keyword = "vengeful" | "awakened";

export type Ability =
  | { readonly kind: "event"; readonly effect: Effect }
  | { readonly kind: "keyword"; readonly keyword: Keyword };

/** A card's abilities for a variant; the amplified flag selects amplified text's behavior. */
export type AbilityList = (variant: Variant) => readonly Ability[];
