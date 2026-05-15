// Precommit / envelope predicate helpers.
//
// Ported verbatim from the CLI's `src/journey/validate/precommitRules.ts`.
// Shape plugins call these to assert their shape-specific precommit
// constraints exist on the manifest; the helpers are intentionally tiny
// because the real work is in `randomContracts.ts` and the per-shape
// precommit validators.
//
// Pure module: no I/O, no Node imports. Browser-safe.

import type { JourneyManifest } from "../manifest";
import { isRecord } from "./guards";

export function hasPrecommitted(
  precommitted: unknown[] | Record<string, unknown> | undefined,
): boolean {
  if (Array.isArray(precommitted)) {
    return precommitted.length > 0;
  }

  return isRecord(precommitted) && Object.keys(precommitted).length > 0;
}

export function hasEnvelopeConstraint(
  value: Record<string, unknown>,
  shapeId: JourneyManifest["shapeId"],
  ruleId: string,
): boolean {
  return Array.isArray(value.constraints) &&
    value.constraints.some((constraint) =>
      isRecord(constraint) &&
      constraint.constraintKind === "shape_invariant" &&
      constraint.shapeId === shapeId &&
      constraint.ruleId === ruleId
    );
}
