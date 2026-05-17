import { describe, expect, it } from "vitest";

import {
  narrowSharedCostPayload,
  narrowSharedRewardPayload,
} from "../../../apply/payloads";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { randomPoolDrawsPlugin } from "./index";

describe("random_pool_draws shape", () => {
  it("produces a structurally valid filled tree on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = randomPoolDrawsPlugin.fill({
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

    // Each branch is well-formed.
    for (const node of tree.nodes) {
      expect(node.branches.length).toBeGreaterThan(0);
      for (const branch of node.branches) {
        expect(branch.label.length).toBeGreaterThan(0);
        expect(typeof branch.locked).toBe("boolean");
      }
    }

    // Each level pairs a Stop and a Draw branch.
    for (const node of tree.nodes) {
      const labels = node.branches.map((b) => b.label);
      expect(labels).toEqual(["Stop", "Draw"]);
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

    // The precommit bundle ships both the visible pool and the committed
    // draw schedule.
    const random = filled.precommitted.random ?? [];
    expect(random.length).toBe(2);
    const visiblePool = random.find((entry) => entry.kind === "visible_pool");
    const repeated = random.find((entry) => entry.kind === "repeated_pool_draws");
    expect(visiblePool).toBeDefined();
    expect(repeated).toBeDefined();

    // The committed draw schedule matches the level count and references
    // rewards drawn from the visible pool.
    const repeatedEntry = repeated as {
      drawCount: number;
      rewards: readonly unknown[];
      committedDraws: readonly (readonly unknown[])[];
    };
    expect(repeatedEntry.drawCount).toBe(tree.nodes.length);
    expect(repeatedEntry.committedDraws.length).toBe(tree.nodes.length);
    for (const committed of repeatedEntry.committedDraws) {
      expect(committed.length).toBeGreaterThan(0);
      for (const draw of committed) {
        expect(repeatedEntry.rewards).toContain(draw);
      }
    }

    // The reward pool is exposed alongside the tree.
    expect(filled.rewardPool).toBeDefined();
    expect(filled.rewardPool!.rewards.length).toBeGreaterThan(0);
  });

  it("emits dispatchable pay costs and committed reward effects on draw branches", () => {
    const ctx = buildFixtureContext();
    const filled = randomPoolDrawsPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });
    const tree = filled.tree!;
    const repeated = (filled.precommitted.random ?? []).find(
      (entry) => entry.kind === "repeated_pool_draws",
    ) as {
      committedDraws: readonly (readonly unknown[])[];
    };

    tree.nodes.forEach((node, index) => {
      const draw = node.branches[1];
      expect(draw.text).toContain(`Pay ${draw.costConvertedEssence} essence`);

      const cost = narrowSharedCostPayload(draw.costs[0]);
      expect(cost?.templateId).toBe("pay_essence");
      expect(cost?.params).toEqual({ x: draw.costConvertedEssence });
      expect(cost?.convertedEssence).toBe(draw.costConvertedEssence);

      expect(draw.effects).toEqual(repeated.committedDraws[index]);
      for (const effect of draw.effects) {
        expect(narrowSharedRewardPayload(effect)).not.toBeNull();
      }
    });
  });

  it("precommits a reward envelope for every 4-level draw without replacement", () => {
    const ctx = buildFixtureContext();
    const filled = randomPoolDrawsPlugin.fill({
      context: ctx,
      drawContext: {
        seed: "seed-6",
        contentVersion: "test",
        rootJourneyIndex: 0,
      },
      stage: "mid",
    });
    const tree = filled.tree!;
    const repeated = (filled.precommitted.random ?? []).find(
      (entry) => entry.kind === "repeated_pool_draws",
    ) as {
      replacement: "with_replacement" | "without_replacement";
      committedDraws: readonly (readonly unknown[])[];
    };

    expect(tree.nodes).toHaveLength(4);
    expect(repeated.replacement).toBe("without_replacement");
    expect(repeated.committedDraws).toHaveLength(4);

    for (const node of tree.nodes) {
      const draw = node.branches[1];
      expect(draw.label).toBe("Draw");
      expect(draw.effects.length).toBeGreaterThan(0);
      for (const effect of draw.effects) {
        expect(narrowSharedRewardPayload(effect)).not.toBeNull();
      }
    }
  });
});
