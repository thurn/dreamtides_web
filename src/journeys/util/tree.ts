// Decision-tree advancement helpers.
//
// New in the port — the CLI's terminal renderer (`render/human.ts`) walks
// trees top-to-bottom for design review, but the browser UI advances through
// trees one node at a time and needs an explicit traversal helper.
//
// Two entry points:
//
//   - `advanceTree(tree, fromBranchId, precommitted)` — called when the player
//     selects a branch on the current node. Returns the next player-choice
//     node, or a terminal if the branch (or a downstream automatic/random
//     transition) ends the journey.
//
//   - `initializeTree(tree, precommitted)` — called once on JourneyScreen
//     mount. Returns the root if its branches are all `player_choice`;
//     otherwise traverses random/automatic transitions until a player-choice
//     node or terminal is reached.
//
// Random branches are resolved against `precommitted.random`. Trees that
// carry a `complete_decision_tree` envelope expose explicit
// `branches[].nextNodeId` / `branches[].terminalOutcome`, which the traversal
// follows by name; otherwise the traversal falls back to checking individual
// per-envelope kinds. When no precommit information picks a winner, the
// traversal returns the first random branch deterministically (the random
// roll is then trusted to have been encoded in branch ordering by the shape).
//
// Pure module: no I/O, no Node imports. Browser-safe.

import type {
  JourneyTree,
  JourneyTreeBranch,
  JourneyTreeNode,
  JourneyTreeTerminal,
  PrecommittedOutcomes,
  RandomPrecommittedOutcome,
} from "../journey/manifest";

export type AdvanceTreeResult = {
  /** The next player-choice node. `null` when the traversal hits a terminal. */
  nextNode: JourneyTreeNode | null;
  /** The terminal reached. `null` when the traversal stops at a node. */
  terminal: JourneyTreeTerminal | null;
};

function findBranch(
  tree: JourneyTree,
  branchId: string,
): { node: JourneyTreeNode; branch: JourneyTreeBranch } | null {
  for (const node of tree.nodes) {
    for (const branch of node.branches) {
      if (branch.id === branchId) {
        return { node, branch };
      }
    }
  }

  return null;
}

function findNode(
  tree: JourneyTree,
  nodeId: string,
): JourneyTreeNode | null {
  return tree.nodes.find((node) => node.id === nodeId) ?? null;
}

function isAllPlayerChoice(node: JourneyTreeNode): boolean {
  return node.branches.every((branch) => branch.kind === "player_choice");
}

/**
 * Walk the precommitted random envelopes and return a map of
 * `nodeId → selected branchId` for every `complete_decision_tree` envelope.
 * Trees whose shape uses a different envelope kind (push_your_luck's
 * `push_choice`, random_pool_draws' `visible_pool`, etc.) do not expose
 * per-node selections this way; the traversal falls back to following the
 * first `random_chance` branch deterministically when no map entry exists.
 */
function buildRandomBranchSelections(
  precommitted: PrecommittedOutcomes,
): Map<string, string> {
  const selections = new Map<string, string>();

  for (const envelope of precommitted.random ?? []) {
    if (!isCompleteDecisionTreeEnvelope(envelope)) {
      continue;
    }

    for (const node of envelope.nodes) {
      const winner = node.branches.find(
        (branch) =>
          branch.kind === "random_chance" &&
          (branch.nextNodeId !== undefined ||
            branch.terminalOutcome !== undefined),
      );
      if (winner) {
        selections.set(node.nodeId, winner.branchId);
      }
    }
  }

  return selections;
}

function isCompleteDecisionTreeEnvelope(
  envelope: RandomPrecommittedOutcome,
): envelope is Extract<
  RandomPrecommittedOutcome,
  { kind: "complete_decision_tree" }
> {
  return envelope.kind === "complete_decision_tree";
}

function selectRandomBranch(
  node: JourneyTreeNode,
  selections: ReadonlyMap<string, string>,
): JourneyTreeBranch | null {
  const selectedBranchId = selections.get(node.id);
  if (selectedBranchId !== undefined) {
    const branch = node.branches.find(
      (candidate) => candidate.id === selectedBranchId,
    );
    if (branch) {
      return branch;
    }
  }

  // Fall back to the first random_chance branch when no per-node selection is
  // available. Trees whose envelope encodes the winning roll in branch
  // ordering land here; the player-visible UI still surfaces the chosen
  // branch deterministically.
  return (
    node.branches.find((branch) => branch.kind === "random_chance") ?? null
  );
}

function selectAutomaticBranch(
  node: JourneyTreeNode,
): JourneyTreeBranch | null {
  return (
    node.branches.find((branch) => branch.kind === "automatic_transition") ??
    null
  );
}

function followBranch(
  tree: JourneyTree,
  branch: JourneyTreeBranch,
  selections: ReadonlyMap<string, string>,
): AdvanceTreeResult {
  if (branch.terminal) {
    return { nextNode: null, terminal: branch.terminal };
  }

  if (branch.nextNodeId === undefined) {
    return { nextNode: null, terminal: null };
  }

  const next = findNode(tree, branch.nextNodeId);
  if (!next) {
    return { nextNode: null, terminal: null };
  }

  return walkUntilPlayerChoice(tree, next, selections);
}

function walkUntilPlayerChoice(
  tree: JourneyTree,
  node: JourneyTreeNode,
  selections: ReadonlyMap<string, string>,
): AdvanceTreeResult {
  // Guard against malformed trees that cycle through automatic/random nodes
  // without ever reaching a player-choice frontier.
  const visited = new Set<string>();
  let current: JourneyTreeNode | null = node;

  while (current) {
    if (visited.has(current.id)) {
      return { nextNode: null, terminal: null };
    }
    visited.add(current.id);

    if (isAllPlayerChoice(current)) {
      return { nextNode: current, terminal: null };
    }

    const random = current.branches.some(
      (branch) => branch.kind === "random_chance",
    );
    const automatic = current.branches.some(
      (branch) => branch.kind === "automatic_transition",
    );

    let nextBranch: JourneyTreeBranch | null = null;
    if (random) {
      nextBranch = selectRandomBranch(current, selections);
    } else if (automatic) {
      nextBranch = selectAutomaticBranch(current);
    }

    if (!nextBranch) {
      // Mixed node with no random/automatic transition to follow: treat the
      // node as player-choice-bound (the player will pick among the
      // remaining branches).
      return { nextNode: current, terminal: null };
    }

    if (nextBranch.terminal) {
      return { nextNode: null, terminal: nextBranch.terminal };
    }

    if (nextBranch.nextNodeId === undefined) {
      return { nextNode: null, terminal: null };
    }

    current = findNode(tree, nextBranch.nextNodeId);
  }

  return { nextNode: null, terminal: null };
}

/**
 * Advance the tree one player choice forward.
 *
 * Locates `fromBranchId` in `tree`, then follows the resulting transition
 * (terminal, automatic, or random) until the next player-choice node or a
 * terminal is reached. Random branches consult `precommitted.random` for
 * their pre-rolled selection.
 */
export function advanceTree(
  tree: JourneyTree,
  fromBranchId: string,
  precommitted: PrecommittedOutcomes,
): AdvanceTreeResult {
  const located = findBranch(tree, fromBranchId);
  if (!located) {
    throw new Error(`Branch ${fromBranchId} not found in journey tree`);
  }

  const selections = buildRandomBranchSelections(precommitted);
  return followBranch(tree, located.branch, selections);
}

/**
 * Resolve the entry node for a freshly-rendered tree.
 *
 * Returns the root when its branches are all `player_choice`; otherwise
 * walks automatic/random transitions (using `precommitted.random`) until a
 * player-choice node or terminal is reached. Called once on JourneyScreen
 * mount so the rest of the UI sees a stable frontier.
 */
export function initializeTree(
  tree: JourneyTree,
  precommitted: PrecommittedOutcomes,
): AdvanceTreeResult {
  const root = findNode(tree, tree.rootNodeId);
  if (!root) {
    throw new Error(`Tree root node ${tree.rootNodeId} not found`);
  }

  const selections = buildRandomBranchSelections(precommitted);
  return walkUntilPlayerChoice(tree, root, selections);
}
