import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  edgesCross,
  generateInitialAtlas,
  resetAtlasGenerator,
} from "./atlas-generator";
import { setLogSink } from "../logging";
import { layerOrdinal } from "../types/layer-name";
import type { AtlasNodeId } from "../types/identifiers";
import {
  DREAMSCAPES,
  ATLAS_DATA,
  DREAMSIGN_POOL,
  STARTER,
  SEEDS,
  buildContext,
  freshAtlas,
  advance,
  nodesIn,
} from "./atlas-generator-test-fixtures";

beforeEach(() => {
  resetAtlasGenerator();
});

afterEach(() => {
  setLogSink(null);
  vi.restoreAllMocks();
});

describe("generateInitialAtlas", () => {
  it("builds a connected, non-crossing, seven-layer graph with valid reveals and dreamsigns", () => {
    const eligibleLayers = new Set(
      ATLAS_DATA.knownDreamsign.eligibleLayers.map(layerOrdinal),
    );
    for (const seed of SEEDS) {
      const atlas = freshAtlas(seed);
      expect(atlas.layers).toHaveLength(7);
      atlas.layers.forEach((layer, index) => {
        const spec = ATLAS_DATA.layers[index].nodeCount;
        expect(layer.length).toBeGreaterThanOrEqual(spec.min);
        expect(layer.length).toBeLessThanOrEqual(spec.max);
      });
      expect(atlas.layers[0]).toHaveLength(1);
      expect(atlas.layers[6]).toHaveLength(1);

      // Every node is reachable forward from the start.
      const reached = new Set<AtlasNodeId>([atlas.startingNodeId]);
      const queue = [atlas.startingNodeId];
      for (let id = queue.shift(); id !== undefined; id = queue.shift()) {
        for (const next of atlas.nodes[id].forwardIds) {
          if (!reached.has(next)) {
            reached.add(next);
            queue.push(next);
          }
        }
      }
      expect(reached.size).toBe(Object.keys(atlas.nodes).length);

      for (const node of Object.values(atlas.nodes)) {
        if (node.id !== atlas.bossNodeId) {
          expect(node.forwardIds.length).toBeGreaterThan(0);
        }
        if (node.id !== atlas.startingNodeId) {
          expect(node.backwardIds.length).toBeGreaterThan(0);
        }
        for (const neighborId of [...node.forwardIds, ...node.backwardIds]) {
          const neighbor = atlas.nodes[neighborId].dreamscapeId;
          if (node.dreamscapeId !== null && neighbor !== null) {
            expect(neighbor).not.toBe(node.dreamscapeId);
          }
        }
      }

      for (const layer of atlas.layers.slice(0, -1)) {
        const edges = layer.flatMap((fromId) =>
          atlas.nodes[fromId].forwardIds.map((toId) => [
            atlas.nodes[fromId].indexInLayer,
            atlas.nodes[toId].indexInLayer,
          ]),
        );
        for (let a = 0; a < edges.length; a++) {
          for (let b = a + 1; b < edges.length; b++) {
            expect(
              edgesCross(edges[a][0], edges[a][1], edges[b][0], edges[b][1]),
            ).toBe(false);
          }
        }
      }

      const start = atlas.nodes[atlas.startingNodeId];
      const boss = atlas.nodes[atlas.bossNodeId];
      expect(start.state).toBe("available");
      expect(start.dreamscapeId).toBe(STARTER?.id);
      expect(boss.state).toBe("revealedLocked");
      expect(boss.dreamscapeId).toBe(ATLAS_DATA.boss.dreamscapeId);
      expect(boss.enhancedSiteType).toBeNull();
      expect(boss.sites[boss.sites.length - 1]?.type).toBe("Battle");
      const bonus = nodesIn(atlas, "revealedLocked").length - 1;
      expect(bonus).toBeGreaterThanOrEqual(ATLAS_DATA.graph.bonusReveal.min);
      expect(bonus).toBeLessThanOrEqual(ATLAS_DATA.graph.bonusReveal.max);

      const carriers = atlas.knownDreamsignCarrierIds;
      expect(carriers.length).toBeLessThanOrEqual(
        ATLAS_DATA.knownDreamsign.maxPerAtlas,
      );
      const granted = carriers.map((id) => atlas.nodes[id].knownDreamsignId);
      expect(new Set(granted).size).toBe(granted.length);
      for (const carrierId of carriers) {
        const node = atlas.nodes[carrierId];
        expect(DREAMSIGN_POOL).toContain(node.knownDreamsignId);
        expect(eligibleLayers.has(layerOrdinal(node.layer))).toBe(true);
      }
      expect(
        Object.values(atlas.nodes).filter((n) => n.knownDreamsignId !== null),
      ).toHaveLength(carriers.length);
    }
  });

  it.each([
    { roll: 0, expected: DREAMSIGN_POOL[0] },
    { roll: 0.999999, expected: DREAMSIGN_POOL[DREAMSIGN_POOL.length - 1] },
  ])("draws the known dreamsign at roll $roll from that pool position", ({ roll, expected }) => {
    const atlasData = {
      ...ATLAS_DATA,
      knownDreamsign: {
        ...ATLAS_DATA.knownDreamsign,
        maxPerAtlas: 1,
        placementProbability: 1,
      },
    };
    const atlas = generateInitialAtlas(0, {}, buildContext({ atlasData }), {
      logEvents: false,
      rng: () => roll,
    });
    const carrier = atlas.knownDreamsignCarrierIds[0];
    expect(atlas.nodes[carrier].knownDreamsignId).toBe(expected);
  });

  it("reveals distinct dreamscapes within each layer as the journey advances", () => {
    for (const seed of SEEDS) {
      const atlas = freshAtlas(seed);
      const afterStart = advance(atlas, atlas.startingNodeId, 1, seed);
      const layer1 = afterStart.layers[1].map((id) => afterStart.nodes[id]);
      expect(layer1.length).toBeGreaterThanOrEqual(2);
      for (const node of layer1) {
        expect(node.state).toBe("available");
        expect(node.dreamscapeId).not.toBeNull();
      }
      // The two first choices show different signature sites.
      const signatures = layer1.map(
        (node) =>
          DREAMSCAPES.find((d) => d.id === node.dreamscapeId)?.signatureSite,
      );
      expect(new Set(signatures).size).toBe(signatures.length);

      const afterLayer1 = advance(afterStart, layer1[0].id, 2, seed);
      for (const layer of afterLayer1.layers) {
        const revealed = layer
          .map((id) => afterLayer1.nodes[id].dreamscapeId)
          .filter((id) => id !== null && id !== undefined);
        expect(new Set(revealed).size).toBe(revealed.length);
      }
    }
  });
});
