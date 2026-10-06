import type { EngineCatalog } from "../catalog";
import type { PromptPurpose, PromptRole } from "../prompts/types";
import type { AbilitySource, InstanceId, Side } from "../state/ids";
import type { AbilityOrigin, BattleState, ContinuousChange, Expiry } from "../state/types";
import type { StepContext } from "../steps/types";
import type { CharacterRef, PlayTimeTarget, SelfSpec, StackTargetSpec, SubjectSpec, TargetSpec, ValueExpr, Variant } from "../dsl/types";

/**
 * The card a copy copies: a chosen character in play or card on the stack,
 * the card the triggering event concerns ("copy it"), or the source, in
 * whatever zone it is.
 */
export type CardRef = TargetSpec | StackTargetSpec | SubjectSpec | SelfSpec;

/** The shape every effect node has; the registry narrows it to the primitive union. */
export interface EffectNode {
  readonly op: string;
}

/**
 * The duration of one `forDuration` node, shared by every change made inside
 * it so they end together: an "until the opponent pays" node is one payable
 * effect covering all its changes and every character they affect.
 */
export interface SharedDuration {
  /** The expiry of changes to `affects` made inside the node; `null` when the duration is already over. */
  join(ctx: StepContext, affects: readonly InstanceId[]): Expiry | null;
  /** Registers the node's payable effect, if it has one, once every change inside it has started. */
  finish(ctx: StepContext): void;
}

/** What a primitive sees while it resolves. */
export interface EffectEnv {
  /** The card or emblem whose ability this is. */
  readonly source: AbilitySource;
  /** Where the ability's definition comes from. */
  readonly origin: AbilityOrigin;
  /** The ability's index in its source's ability list. */
  readonly ability: number;
  /** The ability's whole effect tree, which floating and delayed triggers index into. */
  readonly root: EffectNode;
  /** The card the triggering event concerns, for a trigger; otherwise `null`. */
  readonly subject: InstanceId | null;
  readonly controller: Side;
  readonly variant: Variant;
  /** The value chosen for X, or `null`. */
  readonly x: number | null;
  /** Whether each optional cost of the item was paid, in printed order (the `costPaid` condition). */
  readonly optionalPaid: readonly boolean[];
  /** The duration a `forDuration` node gives the continuous primitives inside it; `null` outside one. */
  readonly duration: SharedDuration | null;
  /** The mode chosen at play time for a modal node of this effect, or `null` for a node off the chosen path. */
  modeOf(node: EffectNode): number | null;
  /** The targets chosen at play time for a target spec in this effect, or `null` if none were chosen. */
  targetsOf(spec: PlayTimeTarget): readonly InstanceId[] | null;
  /** Resolves a nested effect, for flow primitives. */
  run(effect: EffectNode): void;
  /** The purpose of a prompt this ability raises, with the given role. */
  purpose(role: PromptRole): PromptPurpose;
}

/**
 * Registry entry for one DSL primitive. Each primitive is defined,
 * interpreted, and tested in its own module and listed by one line in
 * effects/primitives/index.ts.
 */
export interface PrimitiveDefinition<N extends EffectNode> {
  readonly op: N["op"];
  /** Every nested effect resolved with this node, in order; validation walks them all. */
  children?(node: N): readonly EffectNode[];
  /**
   * Nested effects that resolve later, as a floating or delayed trigger:
   * validation and node indexing walk them, but play-time choices never
   * reach into them; their choices are made as they resolve.
   */
  deferred?(node: N): readonly EffectNode[];
  /**
   * For a modal node, its modes: one is chosen at play time, before targets,
   * and only the chosen mode's targets are collected and resolved.
   */
  modes?(node: N): readonly EffectNode[];
  /** Target specs held directly by this node, in order. */
  targets?(node: N): readonly PlayTimeTarget[];
  resolve(ctx: StepContext, node: N, env: EffectEnv): void;
  /**
   * Whether resolving the node puts characters into play: a card or ability
   * holding one cannot be played or activated while its controller's back
   * rank would be full (rules § Battlefield Capacity).
   */
  readonly entersPlay?: boolean;
  /** For a continuous primitive, the layer it applies in and its changes while a static ability holds it. */
  readonly continuous?: ContinuousDefinition<N>;
}

/**
 * The layers of the continuous-effects evaluation, in order (engine-design §
 * Continuous effects). Layer 1, copiable values, has no primitives.
 */
export type Layer = 2 | 3 | 4 | 5 | 6;

/**
 * What a static ability's continuous primitive sees: its source and
 * controller, with selectors and values read live, against the
 * characteristics the layers before its own produced.
 */
export interface StaticEnv {
  readonly state: BattleState;
  readonly catalog: EngineCatalog;
  readonly source: AbilitySource;
  readonly controller: Side;
  /** The characters a reference covers now; a target or the triggering card covers none. */
  characters(ref: CharacterRef): InstanceId[];
  value(expr: ValueExpr): number;
}

export interface ContinuousDefinition<N extends EffectNode> {
  readonly layer: Layer;
  /** The changes the node makes while a static ability applies it. */
  changes(node: N, env: StaticEnv): ContinuousChange[];
}

/** Declares a primitive; the identity keeps the node type checked. */
export function definePrimitive<N extends EffectNode>(
  definition: PrimitiveDefinition<N>,
): PrimitiveDefinition<N> {
  return definition;
}
