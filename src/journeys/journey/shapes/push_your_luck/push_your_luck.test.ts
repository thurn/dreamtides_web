import { describe, expect, it } from "vitest";

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
});
