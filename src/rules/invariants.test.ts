import { describe, expect, it } from "vitest";

import { LayerName } from "../types/layer-name";
import type { DreamscapeNode } from "../types/journey";
import { genesisFoldState } from "./fold-state";
import {
  FoldInvariantError,
  assertFoldInvariants,
  foldInvariantViolations,
} from "./invariants";

const GENESIS = {
  seed: "invariant-test",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: {
    poolVariant: "tides4",
  },
};

function node(
  id: string,
  layer: LayerName,
  state: DreamscapeNode["state"],
  dreamscapeId: string | null,
  forwardIds: string[] = [],
): DreamscapeNode {
  return {
    id,
    layer,
    indexInLayer: 0,
    dreamscapeId,
    sites: [],
    position: { x: 0, y: 0 },
    state,
    enhancedSiteType: null,
    forwardIds,
    backwardIds: [],
    knownDreamsignId: null,
  };
}

function postVictoryState() {
  const base = genesisFoldState(GENESIS);
  return {
    ...base,
    journey: {
      ...base.journey,
      runId: "journey:1",
      completionLevel: 1,
      screen: { type: "atlas" as const },
      atlas: {
        ...base.journey.atlas,
        layers: [["node-one"], ["node-two-a", "node-two-b"]],
        nodes: {
          "node-one": node(
            "node-one",
            LayerName.One,
            "completed",
            "dreamscape-one",
            ["node-two-a", "node-two-b"],
          ),
          "node-two-a": node(
            "node-two-a",
            LayerName.Two,
            "available",
            "dreamscape-two-a",
          ),
          "node-two-b": node(
            "node-two-b",
            LayerName.Two,
            "available",
            "dreamscape-two-b",
          ),
        },
        startingNodeId: "node-one",
        bossNodeId: "node-two-a",
        currentNodeId: "node-one",
      },
    },
  };
}

describe("fold invariants", () => {
  it("accepts a complete atomic post-victory handoff", () => {
    expect(foldInvariantViolations(postVictoryState())).toEqual([]);
    expect(() => assertFoldInvariants(postVictoryState())).not.toThrow();
  });

  it("rejects the production failure shape where completion advanced but the Atlas did not", () => {
    const state = postVictoryState();
    state.journey.atlas.nodes["node-one"].state = "available";
    state.journey.atlas.nodes["node-two-a"].state = "unrevealed";
    state.journey.atlas.nodes["node-two-a"].dreamscapeId = null;
    state.journey.atlas.nodes["node-two-b"].state = "unrevealed";
    state.journey.atlas.nodes["node-two-b"].dreamscapeId = null;

    const violations = foldInvariantViolations(state);
    expect(violations.map((violation) => violation.code)).toEqual([
      "completion_level_atlas_mismatch",
      "atlas_frontier_missing",
    ]);
    expect(() => assertFoldInvariants(state)).toThrow(FoldInvariantError);
  });

  it("rejects available frontier nodes whose content was never assigned", () => {
    const state = postVictoryState();
    state.journey.atlas.nodes["node-two-a"].dreamscapeId = null;
    state.journey.atlas.nodes["node-two-b"].dreamscapeId = null;

    expect(
      foldInvariantViolations(state).map((violation) => violation.code),
    ).toEqual(["atlas_frontier_unseen", "atlas_frontier_unseen"]);
  });
});
