import { describe, expect, it } from "vitest";

import {
  narrowSharedCostPayload,
  narrowSharedRewardPayload,
} from "../../../apply/payloads";
import { advanceTree } from "../../../util/tree";
import { buildFixtureContext, FIXTURE_DRAW_CONTEXT } from "../__shared__/fixture";
import { pushYourLuckPlugin } from "./index";

describe("push_your_luck shape", () => {
  it("produces a structurally valid filled tree on a populated fixture", () => {
    const ctx = buildFixtureContext();
    const filled = pushYourLuckPlugin.fill({
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

    // Each branch is well-formed: non-empty label, locked is boolean.
    for (const node of tree.nodes) {
      expect(node.branches.length).toBeGreaterThan(0);
      for (const branch of node.branches) {
        expect(branch.label.length).toBeGreaterThan(0);
        expect(typeof branch.locked).toBe("boolean");
      }
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

    // Push-your-luck specifics: every level exposes a Leave + Attempt pair.
    for (const node of tree.nodes) {
      const labels = node.branches.map((b) => b.label);
      expect(labels).toEqual(["Leave", "Attempt"]);
    }

    // Precommit bundle includes a push_choice envelope whose attempt ids
    // reference real Attempt branches.
    const random = filled.precommitted.random ?? [];
    expect(random.length).toBeGreaterThan(0);
    const pushEnvelope = random.find((entry) => entry.kind === "push_choice");
    expect(pushEnvelope).toBeDefined();
    const attempts = (pushEnvelope as { attempts: ReadonlyArray<{ id: string }> }).attempts;
    expect(attempts.length).toBe(tree.nodes.length);

    const branchIds = new Set(
      tree.nodes.flatMap((node) => node.branches.map((b) => b.id)),
    );
    for (const attempt of attempts) {
      expect(branchIds.has(attempt.id)).toBe(true);
    }
  });

  it("emits dispatchable pay-essence costs on visible attempt branches and precommit attempts", () => {
    const ctx = buildFixtureContext();
    const filled = pushYourLuckPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });
    const tree = filled.tree!;
    const attempts = tree.nodes.map((node) => node.branches[1]);

    for (const branch of attempts) {
      const cost = narrowSharedCostPayload(branch.costs[0]);
      expect(cost?.templateId).toBe("pay_essence");
      expect(cost?.params).toEqual({ x: branch.costConvertedEssence });
      expect(cost?.convertedEssence).toBe(branch.costConvertedEssence);

      const reward = narrowSharedRewardPayload(branch.effects[0]);
      expect(branch.rewardTemplateIds ?? []).toContain(reward?.templateId);
      expect(reward?.convertedEssence).toBe(branch.effectConvertedEssence);
    }

    const pushEnvelope = (filled.precommitted.random ?? []).find(
      (entry) => entry.kind === "push_choice",
    ) as { attempts: ReadonlyArray<{ costs: readonly unknown[]; effects: readonly unknown[] }> };

    for (const attempt of pushEnvelope.attempts) {
      expect(narrowSharedCostPayload(attempt.costs[0])?.templateId).toBe(
        "pay_essence",
      );
      expect(narrowSharedRewardPayload(attempt.effects[0])).not.toBeNull();
    }
  });

  it("dispatches the final Attempt branch immediate envelopes once", () => {
    const ctx = buildFixtureContext();
    const filled = pushYourLuckPlugin.fill({
      context: ctx,
      drawContext: FIXTURE_DRAW_CONTEXT,
      stage: "mid",
    });
    const tree = filled.tree!;
    const finalAttempt = tree.nodes[tree.nodes.length - 1].branches[1];
    const result = advanceTree(tree, finalAttempt.id, filled.precommitted);

    expect(result.terminal).not.toBeNull();
    const appliedCosts = [
      ...finalAttempt.costs,
      ...(result.terminal?.costs ?? []),
    ].map(narrowSharedCostPayload);
    const appliedRewards = [
      ...finalAttempt.effects,
      ...(result.terminal?.effects ?? []),
    ].map(narrowSharedRewardPayload);

    expect(appliedCosts.filter(Boolean)).toHaveLength(1);
    expect(appliedRewards.filter(Boolean)).toHaveLength(1);
  });
});
