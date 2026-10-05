/**
 * The primitive registry. Every export of primitives/index.ts that is a
 * PrimitiveDefinition is registered by its `op`, and the Effect union is the
 * union of their node types, so adding a primitive adds its module and one
 * `export *` line to the index.
 */
import * as primitives from "./primitives";
import type { EffectNode, PrimitiveDefinition } from "./types";

type Exports = typeof primitives;

/** Every DSL effect node. */
export type Effect = {
  [K in keyof Exports]: Exports[K] extends PrimitiveDefinition<infer N> ? N : never;
}[keyof Exports];

function isPrimitive(value: unknown): value is PrimitiveDefinition<EffectNode> {
  return (
    typeof value === "object" &&
    value !== null &&
    "op" in value &&
    "resolve" in value &&
    typeof value.resolve === "function"
  );
}

const DEFINITIONS: Readonly<Record<string, PrimitiveDefinition<EffectNode>>> = Object.fromEntries(
  (Object.values(primitives) as unknown[])
    .filter(isPrimitive)
    .map((definition) => [definition.op, definition]),
);

export function primitiveDefinition(op: string): PrimitiveDefinition<EffectNode> {
  const definition = DEFINITIONS[op];
  if (definition === undefined) {
    throw new Error(`Unknown effect primitive ${op}`);
  }
  return definition;
}

/** Every registered primitive op. */
export function primitiveOps(): readonly string[] {
  return Object.keys(DEFINITIONS);
}
