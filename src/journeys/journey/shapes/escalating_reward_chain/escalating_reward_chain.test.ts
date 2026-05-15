import { describe, expect, it } from "vitest";

import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { escalatingRewardChainPlugin } from "./index";

describe("escalating_reward_chain shape", () => {
  it("produces a structurally valid filled tree on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = escalatingRewardChainPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });

    // Decision-tree topology emits no flat options.
    expect(filled.options.length).toBe(0);

    // Tree presence + non-empty nodes.
    expect(filled.tree).toBeDefined();
    const tree = filled.tree!;
    expect(tree.nodes.length).toBeGreaterThan(0);

    // rootNodeId must reference a real node.
    const nodeIds = tree.nodes.map((node) => node.id);
    expect(nodeIds).toContain(tree.rootNodeId);

    // Every branch is well-formed.
    for (const node of tree.nodes) {
      expect(node.branches.length).toBeGreaterThan(0);
      for (const branch of node.branches) {
        expect(branch.label.length).toBeGreaterThan(0);
        expect(typeof branch.locked).toBe("boolean");
      }
    }

    // Each level pairs a Stop and a Take branch.
    for (const node of tree.nodes) {
      const labels = node.branches.map((b) => b.label);
      expect(labels).toEqual(["Stop", "Take"]);
    }

    // nextNodeId references must resolve to real nodes.
    const nodeIdSet = new Set(nodeIds);
    for (const node of tree.nodes) {
      for (const branch of node.branches) {
        if (branch.nextNodeId) {
          expect(nodeIdSet.has(branch.nextNodeId)).toBe(true);
        }
      }
    }

    // The chain's deterministic player choices leave the precommitted random
    // bundle empty — nothing to roll ahead of time.
    expect(filled.precommitted.random ?? []).toEqual([]);
  });
});
