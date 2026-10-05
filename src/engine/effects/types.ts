import type { InstanceId, Side } from "../state/ids";
import type { StepContext } from "../steps/types";
import type { TargetSpec, Variant } from "../dsl/types";

/** The shape every effect node has; the registry narrows it to the primitive union. */
export interface EffectNode {
  readonly op: string;
}

/** What a primitive sees while it resolves. */
export interface EffectEnv {
  readonly source: InstanceId;
  readonly controller: Side;
  readonly variant: Variant;
  /** The value chosen for X, or `null`. */
  readonly x: number | null;
  /** The targets chosen at play time for a target spec in this effect, or `null` if none were chosen. */
  targetsOf(spec: TargetSpec): readonly InstanceId[] | null;
  /** Resolves a nested effect, for flow primitives. */
  run(effect: EffectNode): void;
}

/**
 * Registry entry for one DSL primitive. Each primitive is defined,
 * interpreted, and tested in its own module and listed by one line in
 * effects/primitives/index.ts.
 */
export interface PrimitiveDefinition<N extends EffectNode> {
  readonly op: N["op"];
  /** Nested effects, walked in order to collect play-time targets. */
  children?(node: N): readonly EffectNode[];
  /** Target specs held directly by this node, in order. */
  targets?(node: N): readonly TargetSpec[];
  resolve(ctx: StepContext, node: N, env: EffectEnv): void;
}

/** Declares a primitive; the identity keeps the node type checked. */
export function definePrimitive<N extends EffectNode>(
  definition: PrimitiveDefinition<N>,
): PrimitiveDefinition<N> {
  return definition;
}
