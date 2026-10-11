import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  advanceAtlas,
  regenerateAtlasForProgress,
  resetAtlasGenerator,
} from "./atlas-generator";
import { setLogSink } from "../logging";
import type { DreamAtlas, DreamscapeNode } from "../types/journey";
import { layerOrdinal } from "../types/layer-name";
import type { AtlasNodeId } from "../types/identifiers";
import { parseAtlasNodeId } from "../types/identifiers";
import {
  SEEDS,
  buildContext,
  options,
  freshAtlas,
  advance,
  nodesIn,
  countOf,
} from "./atlas-generator-test-fixtures";

beforeEach(() => {
  resetAtlasGenerator();
});

afterEach(() => {
  setLogSink(null);
  vi.restoreAllMocks();
});

describe("advanceAtlas", () => {
  it("is identical across optimistic and confirmed refolds in one runtime", () => {
    const atlas = freshAtlas();
    const fold = () =>
      advanceAtlas(atlas, atlas.startingNodeId, 1, {}, buildContext(), {
        logEvents: false,
        rng: () => 0.25,
      });

    expect(fold()).toEqual(fold());
  });

  it("completes the node, opens its targets, forgoes siblings, and reveals two layers ahead", () => {
    const atlas = freshAtlas();
    const afterStart = advance(atlas, atlas.startingNodeId, 1);
    expect(afterStart.currentNodeId).toBe(atlas.startingNodeId);
    expect(afterStart.nodes[atlas.startingNodeId].state).toBe("completed");
    for (const id of atlas.nodes[atlas.startingNodeId].forwardIds) {
      expect(afterStart.nodes[id].state).toBe("available");
    }
    for (const id of afterStart.layers[2]) {
      expect(afterStart.nodes[id].state).not.toBe("unrevealed");
    }

    const [chosen, ...siblings] = afterStart.layers[1];
    const advanced = advance(afterStart, chosen, 2);
    expect(advanced.nodes[chosen].state).toBe("completed");
    expect(siblings.length).toBeGreaterThan(0);
    for (const id of siblings) {
      expect(advanced.nodes[id].state).toBe("forgone");
    }
  });

  it("returns the atlas unchanged for an unknown node id", () => {
    const atlas = freshAtlas();

    expect(advance(atlas, parseAtlasNodeId("nonexistent"), 1)).toBe(atlas);
  });

  // Persistence drops every empty array (the boss's `forwardIds`, the
  // start's `backwardIds`, unrevealed nodes' `sites`), and the boss advance
  // runs on the winning battle, so the walk must survive the stripped shape.
  it("advances a fully empty-array-stripped atlas through every layer including the boss", () => {
    const original = freshAtlas();
    const path: AtlasNodeId[] = [original.startingNodeId];
    while (original.nodes[path[path.length - 1]].forwardIds.length > 0) {
      path.push(original.nodes[path[path.length - 1]].forwardIds[0]);
    }
    expect(path[path.length - 1]).toBe(original.bossNodeId);

    const strip = <T extends object>(value: T): T =>
      Object.fromEntries(
        Object.entries(value).filter(
          ([, field]) => !(Array.isArray(field) && field.length === 0),
        ),
      ) as T;
    let atlas = strip({
      ...original,
      nodes: Object.fromEntries(
        Object.entries(original.nodes).map(([id, node]) => [id, strip(node)]),
      ),
    });
    expect(atlas.nodes[original.bossNodeId]).not.toHaveProperty("forwardIds");

    path.forEach((nodeId, index) => {
      atlas = advance(atlas, nodeId, index);
    });

    expect(atlas.nodes[original.bossNodeId].state).toBe("completed");
  });

  // A persisted snapshot drops stored nulls, so an unrevealed node can arrive
  // with `dreamscapeId` absent; advancing must still fully reveal it.
  it("reveals forward nodes whose dreamscapeId arrived absent", () => {
    const original = freshAtlas();
    const snapshot: DreamAtlas<true> = {
      ...original,
      nodes: Object.fromEntries(
        Object.entries(original.nodes).map(([id, node]) => {
          if (node.dreamscapeId !== null) return [id, node];
          const { dreamscapeId: _dropped, ...rest } = node;
          return [id, { ...rest, sites: [] } as unknown as DreamscapeNode];
        }),
      ),
    };
    const targets = original.nodes[original.startingNodeId].forwardIds;
    expect(snapshot.nodes[targets[0]]).not.toHaveProperty("dreamscapeId");

    const advanced = advance(snapshot, snapshot.startingNodeId, 1);

    for (const id of targets) {
      const node = advanced.nodes[id];
      expect(node.state).toBe("available");
      expect(node.dreamscapeId ?? null).not.toBeNull();
      expect(countOf(node.sites, "Battle")).toBe(1);
    }
  });
});

describe("regenerateAtlasForProgress", () => {
  /** Follows forward edges through completed nodes from the starter. */
  function completedChain(atlas: DreamAtlas<true>): AtlasNodeId[] {
    const chain: AtlasNodeId[] = [];
    let current: AtlasNodeId | undefined = atlas.startingNodeId;
    while (current !== undefined && atlas.nodes[current].state === "completed") {
      chain.push(current);
      current = (atlas.nodes[current].forwardIds ?? []).find(
        (id) => atlas.nodes[id]?.state === "completed",
      );
    }
    return chain;
  }

  it("replays one completion per level as a single connected route ending at a live frontier", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      for (const depth of [0, 1, 2, 3, 4, 5, 6]) {
        const atlas = regenerateAtlasForProgress(
          depth,
          {},
          buildContext(),
          options(seed),
        );
        const completed = nodesIn(atlas, "completed").map((node) => node.id);
        expect(completed).toHaveLength(depth);
        const chain = completedChain(atlas);
        expect([...chain].sort()).toEqual([...completed].sort());
        const chainLayers = chain.map((id) => layerOrdinal(atlas.nodes[id].layer));
        expect(new Set(chainLayers).size).toBe(chainLayers.length);

        const available = nodesIn(atlas, "available");
        expect(available.length).toBeGreaterThan(0);
        expect(
          Math.min(...available.map((node) => layerOrdinal(node.layer))),
        ).toBeGreaterThan(Math.max(-1, ...chainLayers));
        if (depth < atlas.layers.length - 1) {
          // A locked layer ahead stays visible until the boss is the frontier.
          expect(nodesIn(atlas, "revealedLocked").length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("stops at the boss when the requested depth exceeds the graph", () => {
    const atlas = regenerateAtlasForProgress(100, {}, buildContext(), options(3));

    expect(nodesIn(atlas, "completed")).toHaveLength(atlas.layers.length);
  });
});
