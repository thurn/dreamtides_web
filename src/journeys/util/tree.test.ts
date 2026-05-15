// Decision-tree advancement tests.
//
// Three checks:
//
//   1. Following a player_choice branch whose target is a random_chance node
//      walks through the random transition (selecting via the precommitted
//      envelope) and stops at the next player-choice node.
//
//   2. Following a branch whose target is a terminal returns the terminal and
//      `nextNode === null`.
//
//   3. `initializeTree` on a tree whose root is already a player-choice node
//      returns the root unchanged.
//
// Bug class guarded against: traversal getting stuck on a random or automatic
// node, or accidentally jumping past a player-choice frontier.

import { describe, expect, it } from "vitest";

import { advanceTree, initializeTree } from "./tree";
import type {
  JourneyTree,
  JourneyTreeBranch,
  JourneyTreeNode,
  JourneyTreeTerminal,
  PrecommittedOutcomes,
} from "../journey/manifest";

function emptyArrays() {
  return {
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    routeEffects: [],
  };
}

function branch(
  overrides: Partial<JourneyTreeBranch> & {
    id: string;
    kind: JourneyTreeBranch["kind"];
  },
): JourneyTreeBranch {
  return {
    label: overrides.id,
    text: overrides.id,
    triggers: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 0,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 0,
    locked: false,
    ...emptyArrays(),
    ...overrides,
  };
}

function terminal(
  outcome: JourneyTreeTerminal["outcome"],
): JourneyTreeTerminal {
  return {
    text: `Terminal ${outcome}`,
    outcome,
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    routeEffects: [],
  };
}

function node(id: string, branches: JourneyTreeBranch[]): JourneyTreeNode {
  return { id, levelLabel: id, branches };
}

function buildTree(): JourneyTree {
  const rootNode = node("root", [
    branch({
      id: "Continue",
      kind: "player_choice",
      nextNodeId: "random_child",
    }),
    branch({
      id: "Stop",
      kind: "player_choice",
      terminal: terminal("leave"),
    }),
  ]);

  const randomChildNode = node("random_child", [
    branch({
      id: "Success",
      kind: "random_chance",
      odds: { numerator: 70, denominator: 100, percent: 70 },
      nextNodeId: "grandchild",
    }),
    branch({
      id: "Failure",
      kind: "random_chance",
      odds: { numerator: 30, denominator: 100, percent: 30 },
      terminal: terminal("failure"),
    }),
  ]);

  const grandchildNode = node("grandchild", [
    branch({
      id: "ClaimReward",
      kind: "player_choice",
      terminal: terminal("claim"),
    }),
    branch({
      id: "Walk",
      kind: "player_choice",
      terminal: terminal("end"),
    }),
  ]);

  return {
    rootNodeId: "root",
    nodes: [rootNode, randomChildNode, grandchildNode],
  };
}

function precommitWithRandomWinner(): PrecommittedOutcomes {
  return {
    random: [
      {
        kind: "complete_decision_tree",
        motif: "push_your_luck",
        nodes: [
          {
            nodeId: "random_child",
            levelLabel: "random_child",
            branches: [
              {
                branchId: "Success",
                label: "Success",
                kind: "random_chance",
                odds: { numerator: 70, denominator: 100, percent: 70 },
                nextNodeId: "grandchild",
                operationCount: 0,
              },
              {
                branchId: "Failure",
                label: "Failure",
                kind: "random_chance",
                odds: { numerator: 30, denominator: 100, percent: 30 },
                operationCount: 0,
              },
            ],
          },
        ],
        stopBranchIds: [],
        failureBranchIds: ["Failure"],
        rewardBranchIds: ["Success"],
      },
    ],
  };
}

describe("advanceTree", () => {
  it("walks through a random child node to the next player-choice node", () => {
    const tree = buildTree();
    const precommitted = precommitWithRandomWinner();

    const result = advanceTree(tree, "Continue", precommitted);

    expect(result.terminal).toBeNull();
    expect(result.nextNode?.id).toBe("grandchild");
  });

  it("returns the terminal when the chosen branch terminates the journey", () => {
    const tree = buildTree();
    const precommitted = precommitWithRandomWinner();

    const result = advanceTree(tree, "Stop", precommitted);

    expect(result.nextNode).toBeNull();
    expect(result.terminal?.outcome).toBe("leave");
  });

  it("throws when the chosen branch is missing from the tree", () => {
    const tree = buildTree();

    expect(() => advanceTree(tree, "nonexistent", {})).toThrow(
      /nonexistent/,
    );
  });
});

describe("initializeTree", () => {
  it("returns the root node when its branches are all player_choice", () => {
    const tree = buildTree();
    const precommitted = precommitWithRandomWinner();

    const result = initializeTree(tree, precommitted);

    expect(result.terminal).toBeNull();
    expect(result.nextNode?.id).toBe("root");
  });

  it("walks past a non-player_choice root via the precommitted envelope", () => {
    const tree: JourneyTree = {
      rootNodeId: "auto_root",
      nodes: [
        node("auto_root", [
          branch({
            id: "auto",
            kind: "automatic_transition",
            nextNodeId: "player_root",
          }),
        ]),
        node("player_root", [
          branch({
            id: "PlayerPick",
            kind: "player_choice",
            terminal: terminal("end"),
          }),
        ]),
      ],
    };

    const result = initializeTree(tree, {});

    expect(result.terminal).toBeNull();
    expect(result.nextNode?.id).toBe("player_root");
  });
});
