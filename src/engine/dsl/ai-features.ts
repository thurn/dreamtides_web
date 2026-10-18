/**
 * Expert AST features (phase-7-ai § 7.3, D27): what a card's printed
 * abilities do, read from the ability AST rather than by resolving it. Each
 * classified node yields one contribution to a feature (cards drawn, energy,
 * points, spark, removal, recursion, tempo, trigger value), kept apart by
 * the ability it belongs to, the player it applies to and how it is
 * qualified: optional, conditional, modal, deferred or dynamic. A
 * contribution with no qualifier is immediate. Amounts are exact numbers,
 * dynamic value expressions, or one per matching character; a node the
 * extractor does not classify is listed as unclassified with its
 * qualifiers, never counted as an exact 0. A card whose amplified text
 * changes its features reports the amplified features beside the base ones.
 */
import type { EngineCardDefinition } from "../catalog";
import type { Effect } from "../effects/registry";
import { primitiveDefinition } from "../effects/registry";
import { abilityEffect } from "./abilities";
import { BASE_VARIANT, type Ability, type CharacterRef, type PlayerRef, type StackTargetSpec, type ValueExpr, type Variant } from "./types";

/** The quantities the Expert's valuation reads from the AST; `draw` is net cards into hand, so a discard is negative. */
export type AiFeature = "draw" | "energy" | "points" | "spark" | "removal" | "recursion" | "tempo" | "trigger";

/**
 * How a contribution is qualified: `optional` for "you may" and payment
 * choices, `conditional` for "if" and "unless", `modal` for one of several
 * modes or a chosen player, `deferred` for a triggered ability or a delayed
 * or floating effect, `dynamic` for an amount read at resolution.
 */
export type FeatureQualifier = "optional" | "conditional" | "modal" | "deferred" | "dynamic";

/** A contribution's quantity, signed: a loss is negative. */
export type FeatureAmount =
  | { readonly kind: "exact"; readonly value: number }
  /** Read at resolution from this expression, negated when `sign` is -1. */
  | { readonly kind: "dynamic"; readonly expr: ValueExpr; readonly sign: 1 | -1 }
  /** One for each character the effect's selector matches as it resolves. */
  | { readonly kind: "perMatch" }
  /** Changed by an amount the AST does not state, such as doubling or setting a value. */
  | { readonly kind: "unknown" };

/**
 * Whom a contribution applies to, relative to the ability's controller:
 * `each` is every player in turn, `any` a character of either side.
 */
export type FeaturePlayer = "you" | "opponent" | "each" | "any";

export interface FeatureContribution {
  readonly feature: AiFeature;
  readonly amount: FeatureAmount;
  readonly player: FeaturePlayer;
  /** In walk order and without repeats; empty for an immediate contribution. */
  readonly qualifiers: readonly FeatureQualifier[];
  /** The effect primitive it comes from, or `ability` for a triggered ability's own trigger value. */
  readonly op: string;
}

/** A node the extractor does not classify, with the qualifiers it sits under. */
export interface UnclassifiedNode {
  readonly op: string;
  readonly qualifiers: readonly FeatureQualifier[];
}

export interface AbilityFeatures {
  /** The ability's index in its card's ability list. */
  readonly index: number;
  readonly kind: Ability["kind"];
  readonly contributions: readonly FeatureContribution[];
  readonly unclassified: readonly UnclassifiedNode[];
}

export interface CardFeatures {
  /** The abilities with an effect, for the base variant. */
  readonly base: readonly AbilityFeatures[];
  /** The amplified variant's abilities, present only when its features differ from the base. */
  readonly amplified?: readonly AbilityFeatures[];
}

const AMPLIFIED: Variant = { ...BASE_VARIANT, amplified: true };

interface Walk {
  readonly qualifiers: readonly FeatureQualifier[];
  /** Inside "each player": a `you` reference names each player in turn. */
  readonly eachPlayer: boolean;
  readonly contributions: FeatureContribution[];
  readonly unclassified: UnclassifiedNode[];
}

function qualified(walk: Walk, ...added: FeatureQualifier[]): Walk {
  const qualifiers = [...walk.qualifiers];
  for (const qualifier of added) if (!qualifiers.includes(qualifier)) qualifiers.push(qualifier);
  return { ...walk, qualifiers };
}

function player(walk: Walk, ref: PlayerRef): FeaturePlayer {
  return walk.eachPlayer ? "each" : ref;
}

function characterPlayer(walk: Walk, subject: CharacterRef | StackTargetSpec): FeaturePlayer {
  switch (subject.kind) {
    case "target":
    case "all":
    case "randomCharacter":
    case "stackTarget":
      return subject.selector.controller === "any" ? "any" : player(walk, subject.selector.controller);
    case "lastMaterialized":
      return player(walk, subject.player);
    case "self":
    case "supported":
    case "highestSpark":
      return player(walk, "you");
    case "subject":
      return "any";
  }
}

function characterCount(subject: CharacterRef | StackTargetSpec): FeatureAmount {
  return subject.kind === "all" ? { kind: "perMatch" } : { kind: "exact", value: 1 };
}

function amountOf(value: ValueExpr, sign: 1 | -1): FeatureAmount {
  return typeof value === "number" ? { kind: "exact", value: sign * value } : { kind: "dynamic", expr: value, sign };
}

function add(walk: Walk, feature: AiFeature, amount: FeatureAmount, who: FeaturePlayer, op: string): void {
  const qualifiers = amount.kind === "dynamic" ? qualified(walk, "dynamic").qualifiers : walk.qualifiers;
  walk.contributions.push({ feature, amount, player: who, qualifiers, op });
}

const ONE: FeatureAmount = { kind: "exact", value: 1 };
const UNKNOWN: FeatureAmount = { kind: "unknown" };

/** Descends into a node's nested effects as its primitive declares them: `deferred` ones are deferred. */
function descend(node: Effect, walk: Walk): void {
  const definition = primitiveDefinition(node.op);
  for (const child of definition.children?.(node) ?? []) visit(child as Effect, walk);
  for (const child of definition.deferred?.(node) ?? []) visit(child as Effect, qualified(walk, "deferred"));
}

function visit(node: Effect, walk: Walk): void {
  switch (node.op) {
    case "sequence":
      for (const effect of node.effects) visit(effect, walk);
      return;
    case "optional":
      visit(node.effect, qualified(walk, "optional"));
      return;
    case "payTo":
      visit(node.effect, qualified(walk, "optional"));
      return;
    case "ifThen":
      visit(node.then, qualified(walk, "conditional"));
      if (node.otherwise !== null) visit(node.otherwise, qualified(walk, "conditional"));
      return;
    case "unlessPays":
      visit(node.effect, qualified(walk, "conditional"));
      return;
    case "chooseOne":
      for (const mode of node.modes) visit(mode, qualified(walk, "modal"));
      return;
    case "choosePlayer":
      visit(node.you, qualified(walk, "modal"));
      visit(node.opponent, qualified(walk, "modal"));
      return;
    case "eachPlayer":
      visit(node.effect, { ...walk, eachPlayer: true });
      return;
    case "repeat":
      visit(node.effect, typeof node.times === "number" && node.times === 1 ? walk : qualified(walk, "dynamic"));
      return;
    case "forDuration":
      visit(node.effect, qualified(walk, "deferred"));
      return;
    case "floatingTrigger":
      add(qualified(walk, "deferred"), "trigger", ONE, player(walk, "you"), node.op);
      visit(node.effect, qualified(walk, "deferred"));
      return;
    case "draw":
      add(walk, "draw", amountOf(node.count, 1), player(walk, node.player), node.op);
      return;
    case "drawMatching":
      add(walk, "draw", ONE, player(walk, node.player), node.op);
      return;
    case "drawThenIf":
      add(walk, "draw", ONE, player(walk, node.player), node.op);
      visit(node.then, qualified(walk, "conditional"));
      return;
    case "discard":
      add(walk, "draw", amountOf(node.count, -1), player(walk, node.player), node.op);
      return;
    case "discardChosen":
      add(walk, "draw", { kind: "exact", value: -1 }, player(walk, "you"), node.op);
      return;
    case "gainEnergy":
    case "gainMaxEnergy":
      add(walk, "energy", amountOf(node.amount, 1), player(walk, node.player), node.op);
      return;
    case "loseEnergy":
      add(walk, "energy", amountOf(node.amount, -1), player(walk, node.player), node.op);
      return;
    case "doubleEnergy":
    case "drawDreamwell":
      add(walk, "energy", UNKNOWN, player(walk, node.player), node.op);
      return;
    case "gainPoints":
      add(walk, "points", amountOf(node.amount, 1), player(walk, node.player), node.op);
      return;
    case "losePoints":
      add(walk, "points", amountOf(node.amount, -1), player(walk, node.player), node.op);
      return;
    case "gainSpark":
    case "gainAdditionalSpark":
    case "sparkModifier":
      add(walk, "spark", amountOf(node.amount, 1), characterPlayer(walk, node.subject), node.op);
      return;
    case "setBaseSpark":
      add(walk, "spark", UNKNOWN, characterPlayer(walk, node.subject), node.op);
      return;
    case "dissolve":
    case "banish":
    case "banishUntil":
    case "gainControl":
    case "returnToHand":
    case "prevent":
      add(walk, "removal", characterCount(node.subject), characterPlayer(walk, node.subject), node.op);
      return;
    case "abandon":
      add(walk, "removal", ONE, player(walk, node.chooser), node.op);
      return;
    case "exhaust":
    case "awaken":
      add(walk, "tempo", characterCount(node.subject), characterPlayer(walk, node.subject), node.op);
      return;
    case "takeExtraTurn":
      add(walk, "tempo", ONE, player(walk, "you"), node.op);
      return;
    case "materialize":
    case "materializeChosen":
    case "materializeFigmentCopy":
      add(walk, "tempo", ONE, player(walk, "you"), node.op);
      return;
    case "rematerialize":
      add(walk, "tempo", characterCount(node.subject), characterPlayer(walk, node.subject), node.op);
      return;
    case "discover":
      if (node.to === undefined) add(walk, "draw", ONE, player(walk, "you"), node.op);
      else walk.unclassified.push({ op: node.op, qualifiers: walk.qualifiers });
      return;
    case "materializeFigments":
      add(walk, "tempo", amountOf(node.count, 1), player(walk, node.player), node.op);
      return;
    case "returnFromVoid":
    case "grantReclaim":
    case "reclaimNotBanished":
      add(walk, "recursion", ONE, player(walk, "you"), node.op);
      descend(node, walk);
      return;
    case "playFromZone":
      add(walk, node.zone === "void" ? "recursion" : "draw", ONE, player(walk, node.player), node.op);
      return;
    case "triggerAbility":
      add(walk, "trigger", ONE, characterPlayer(walk, node.subject), node.op);
      return;
    case "repeatTriggeringAbility":
      add(walk, "trigger", ONE, player(walk, "you"), node.op);
      return;
    default:
      walk.unclassified.push({ op: node.op, qualifiers: walk.qualifiers });
      descend(node, walk);
  }
}

/** The features of one ability, or `null` for an ability with no effect, such as a keyword or a cost. */
export function abilityFeatures(ability: Ability, index: number): AbilityFeatures | null {
  const effect = abilityEffect(ability);
  if (effect === null) return null;
  const walk: Walk = { qualifiers: ability.kind === "triggered" ? ["deferred"] : [], eachPlayer: false, contributions: [], unclassified: [] };
  if (ability.kind === "triggered") add(walk, "trigger", ONE, "you", "ability");
  visit(effect, ability.kind === "triggered" && ability.condition !== undefined ? qualified(walk, "conditional") : walk);
  return { index, kind: ability.kind, contributions: walk.contributions, unclassified: walk.unclassified };
}

function variantFeatures(card: EngineCardDefinition, variant: Variant): AbilityFeatures[] {
  return card.abilities(variant).flatMap((ability, index) => abilityFeatures(ability, index) ?? []);
}

/** The features of a card's printed abilities, base and, when they differ, amplified. */
export function cardFeatures(card: EngineCardDefinition): CardFeatures {
  const base = variantFeatures(card, BASE_VARIANT);
  const amplified = variantFeatures(card, AMPLIFIED);
  return JSON.stringify(amplified) === JSON.stringify(base) ? { base } : { base, amplified };
}
