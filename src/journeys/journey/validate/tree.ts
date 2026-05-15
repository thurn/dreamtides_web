// Decision-tree validator.
//
// Ported verbatim from the CLI's `src/journey/validate/tree.ts`. Shape
// plugins whose topology is `decision_tree` route their tree-validator slot
// through `validateDecisionTree` so the tree-invariant ruleset stays in one
// place. The `decisionTreeValidator` exported from `shapes/shared.ts`
// delegates here.
//
// Rules covered (each surfaces a distinct ruleId):
//   - `missing_decision_tree`
//   - `missing_tree_levels`
//   - `invalid_tree_root`
//   - `missing_tree_branches`
//   - `invalid_tree_branch`
//   - `missing_random_odds`
//   - `invalid_tree_transition`
//   - `missing_terminal_outcome`
//
// Pure module: no I/O, no Node imports. Browser-safe.

import type { JourneyContext } from "../context";
import type { GeneratedObjectDefinition, JourneyManifest } from "../manifest";
import { fail, type ValidationResult } from "./result";

export function validateDecisionTree(
  manifest: JourneyManifest,
  _context: JourneyContext,
  _generatedObjects: readonly GeneratedObjectDefinition[] = [],
): ValidationResult {
  if (!manifest.tree) {
    return fail("missing_decision_tree", "Decision-tree shapes require complete tree data");
  }

  if (manifest.tree.nodes.length === 0) {
    return fail("missing_tree_levels", "Decision trees require at least one level");
  }

  const nodeIds = new Set(manifest.tree.nodes.map((node) => node.id));

  if (!nodeIds.has(manifest.tree.rootNodeId)) {
    return fail("invalid_tree_root", "Decision tree root must reference an existing node");
  }

  for (const node of manifest.tree.nodes) {
    const hasRandomOutcomes = node.branches.some((branch) =>
      branch.kind === "random_chance"
    );

    if (node.branches.length === 0) {
      return fail("missing_tree_branches", `${node.id} must have outgoing branches`);
    }

    for (const branch of node.branches) {
      if (!branch.text || !branch.label) {
        return fail("invalid_tree_branch", `${node.id} has an unlabeled branch`);
      }

      if (branch.kind === "random_chance" && !branch.odds) {
        return fail("missing_random_odds", `${branch.id} must expose odds`);
      }

      if (branch.nextNodeId && !nodeIds.has(branch.nextNodeId)) {
        return fail("invalid_tree_transition", `${branch.id} points to a missing node`);
      }

      if (
        !branch.nextNodeId &&
        !branch.terminal &&
        !(branch.kind === "player_choice" && branch.odds && hasRandomOutcomes)
      ) {
        return fail("missing_terminal_outcome", `${branch.id} must end or transition`);
      }
    }
  }

  return { ok: true };
}
