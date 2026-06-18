import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  additionalSiteTypesForLevel,
  advanceAtlas,
  generateSiteComposition,
  generateInitialAtlas,
  edgesCross,
  previewSiteTypes,
  regenerateAtlasForProgress,
  revealedAtlasSite,
  rewardPreviewLabel,
  resetAtlasGenerator,
  siteTypeDescription,
  siteTypeIcon,
  ALL_SITE_TYPES,
  type AtlasBuildContext,
  type SiteGenerationContext,
} from "./atlas-generator";
import {
  loadTestAtlasConfig,
  loadTestDreamscapes,
  makeTestAtlasNode,
} from "../__test-helpers__/atlas-fixtures";
import type {
  AtlasNodeState,
  DreamAtlas,
  DreamscapeNode,
  SiteState,
  SiteType,
} from "../types/quest";

function defaultContext(
  overrides?: Partial<SiteGenerationContext>,
): SiteGenerationContext {
  return {
    ...overrides,
  };
}

const TEST_DREAMSCAPES = loadTestDreamscapes();
const TEST_ATLAS_CONFIG = loadTestAtlasConfig();
// Dreamsign ids the known-dreamsign placement can draw from; arbitrary unique
// strings so the tests do not depend on any real dreamsign data.
const TEST_DREAMSIGN_POOL = Array.from(
  { length: 8 },
  (_, i) => `test-dreamsign-${String(i)}`,
);

function buildContext(
  overrides?: Partial<AtlasBuildContext>,
): AtlasBuildContext {
  return {
    dreamscapes: TEST_DREAMSCAPES,
    atlasConfig: TEST_ATLAS_CONFIG,
    dreamsignPoolIds: TEST_DREAMSIGN_POOL,
    ...overrides,
  };
}

beforeEach(() => {
  resetAtlasGenerator();
  vi.restoreAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Site composition fixtures derived from the live dreamscape data, so the tests
// never hardcode dreamscape names, signature sites, or layer counts that an
// authoring edit could invalidate.
// ---------------------------------------------------------------------------

const STARTER_DREAMSCAPE = (() => {
  const starter = TEST_DREAMSCAPES.find((d) => d.isStarter);
  if (starter === undefined) {
    throw new Error("test data has no starter dreamscape");
  }
  return starter;
})();

const NON_STARTER_DREAMSCAPES = TEST_DREAMSCAPES.filter((d) => !d.isStarter);

/** Layers a non-starter dreamscape can occupy: 0-indexed atlas layers 1..6. */
const NON_STARTER_LAYERS = Array.from(
  { length: TEST_ATLAS_CONFIG.layerSpecs.length - 1 },
  (_, i) => i + 1,
);

/** Expected mandatory draft count for a 0-indexed atlas layer (doc table). */
function expectedDraftCount(layer: number): number {
  if (layer <= 1) return 2;
  if (layer <= 3) return 1;
  return 0;
}

/** Layers where Purge is mandatory (0-indexed 1 and 2; doc layers 2 and 3). */
function expectsMandatoryPurge(layer: number): boolean {
  return layer === 1 || layer === 2;
}

function composeFor(
  dreamscape: (typeof NON_STARTER_DREAMSCAPES)[number],
  layer: number,
  overrides?: Partial<{
    hasKnownDreamsign: boolean;
  }>,
): SiteState[] {
  resetAtlasGenerator();
  return generateSiteComposition({
    layer,
    dreamscape,
    dreamscapes: TEST_DREAMSCAPES,
    context: defaultContext(),
    hasKnownDreamsign: overrides?.hasKnownDreamsign,
  }).sites;
}

function counts(sites: SiteState[]): Partial<Record<SiteType, number>> {
  const out: Partial<Record<SiteType, number>> = {};
  for (const site of sites) {
    out[site.type] = (out[site.type] ?? 0) + 1;
  }
  return out;
}

describe("generateSiteComposition", () => {
  it("produces 3-6 sites per non-starter dreamscape at every layer", () => {
    for (const dreamscape of NON_STARTER_DREAMSCAPES) {
      for (const layer of NON_STARTER_LAYERS) {
        for (let i = 0; i < 20; i++) {
          const sites = composeFor(dreamscape, layer);
          expect(sites.length).toBeGreaterThanOrEqual(3);
          expect(sites.length).toBeLessThanOrEqual(6);
        }
      }
    }
  });

  it("places exactly one Battle, always last in visit order", () => {
    for (const dreamscape of NON_STARTER_DREAMSCAPES) {
      for (const layer of NON_STARTER_LAYERS) {
        for (let i = 0; i < 20; i++) {
          const sites = composeFor(dreamscape, layer);
          expect(sites.filter((s) => s.type === "Battle")).toHaveLength(1);
          expect(sites[sites.length - 1].type).toBe("Battle");
        }
      }
    }
  });

  it("includes the home guide's signature site, marked enhanced", () => {
    for (const dreamscape of NON_STARTER_DREAMSCAPES) {
      for (const layer of NON_STARTER_LAYERS) {
        for (let i = 0; i < 20; i++) {
          const sites = composeFor(dreamscape, layer);
          const signature = sites.filter(
            (s) => s.type === dreamscape.signatureSite,
          );
          expect(signature).toHaveLength(1);
          expect(signature[0].isEnhanced).toBe(true);
          // It is the only enhanced site.
          expect(sites.filter((s) => s.isEnhanced)).toHaveLength(1);
        }
      }
    }
  });

  it("matches the per-layer draft count from the doc table", () => {
    for (const dreamscape of NON_STARTER_DREAMSCAPES) {
      for (const layer of NON_STARTER_LAYERS) {
        for (let i = 0; i < 20; i++) {
          const sites = composeFor(dreamscape, layer);
          const drafts = sites.filter((s) => s.type === "Draft");
          expect(drafts).toHaveLength(expectedDraftCount(layer));
        }
      }
    }
  });

  it("guarantees Purge in the early layers (and allows it only as fill later)", () => {
    for (const dreamscape of NON_STARTER_DREAMSCAPES) {
      for (const layer of NON_STARTER_LAYERS) {
        let mandatoryAllHadPurge = true;
        for (let i = 0; i < 30; i++) {
          const sites = composeFor(dreamscape, layer);
          const hasPurge = sites.some((s) => s.type === "Purge");
          if (expectsMandatoryPurge(layer) && !hasPurge) {
            mandatoryAllHadPurge = false;
          }
          // Purge, when present, is never duplicated.
          expect(sites.filter((s) => s.type === "Purge").length).toBeLessThanOrEqual(1);
        }
        if (expectsMandatoryPurge(layer)) {
          expect(mandatoryAllHadPurge).toBe(true);
        }
      }
    }
  });

  it("keeps each non-Draft type to at most one and Draft to at most two", () => {
    for (const dreamscape of NON_STARTER_DREAMSCAPES) {
      for (const layer of NON_STARTER_LAYERS) {
        for (let i = 0; i < 30; i++) {
          const sites = composeFor(dreamscape, layer, {
            hasKnownDreamsign: true,
          });
          for (const [type, count] of Object.entries(counts(sites))) {
            if (type === "Draft") {
              expect(count).toBeLessThanOrEqual(2);
            } else {
              expect(count).toBeLessThanOrEqual(1);
            }
          }
        }
      }
    }
  });

  it("gives a known-dreamsign carrier exactly one Dreamsign Reward site", () => {
    for (const dreamscape of NON_STARTER_DREAMSCAPES) {
      for (const layer of NON_STARTER_LAYERS) {
        for (let i = 0; i < 20; i++) {
          const sites = composeFor(dreamscape, layer, {
            hasKnownDreamsign: true,
          });
          expect(sites.filter((s) => s.type === "Reward")).toHaveLength(1);
        }
      }
    }
  });

  it("does not add a Dreamsign Reward when the node carries no known dreamsign", () => {
    // A node without a known dreamsign can still randomly roll a Reward only if
    // Reward were in the fill pool; it is not, so Reward never appears.
    for (const dreamscape of NON_STARTER_DREAMSCAPES) {
      for (const layer of NON_STARTER_LAYERS) {
        for (let i = 0; i < 20; i++) {
          const sites = composeFor(dreamscape, layer, {
            hasKnownDreamsign: false,
          });
          expect(sites.some((s) => s.type === "Reward")).toBe(false);
        }
      }
    }
  });

  it("weights Transfiguration and Duplication up in later layers", () => {
    // Statistical: over many late-layer draws, the card-shaping sites appear more
    // often than in early layers. Pick a dreamscape whose own signature site is
    // neither, so both stay in its fill pool.
    const dreamscape = NON_STARTER_DREAMSCAPES.find(
      (d) =>
        d.signatureSite !== "Transfiguration" &&
        d.signatureSite !== "Duplication",
    );
    expect(dreamscape).toBeDefined();
    const cardShaping = new Set<SiteType>(["Transfiguration", "Duplication"]);
    function rate(layer: number): number {
      let hits = 0;
      const trials = 400;
      for (let i = 0; i < trials; i++) {
        const sites = composeFor(dreamscape!, layer);
        if (sites.some((s) => cardShaping.has(s.type))) {
          hits += 1;
        }
      }
      return hits / trials;
    }
    expect(rate(5)).toBeGreaterThan(rate(2));
  });

  it("leaves Draft site data attached and other sites unresolved", () => {
    const dreamscape = NON_STARTER_DREAMSCAPES[0];
    const sites = composeFor(dreamscape, 1, { hasKnownDreamsign: true });
    for (const site of sites) {
      if (site.type === "Draft") {
        expect(site.data).toBeDefined();
      } else {
        expect(site.data).toBeUndefined();
      }
    }
  });

  it("assigns unique IDs to all sites", () => {
    const sites = composeFor(NON_STARTER_DREAMSCAPES[0], 1, {
      hasKnownDreamsign: true,
    });
    const ids = sites.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("returns the starter's fixed site list with no enhancement and no fill", () => {
    expect(STARTER_DREAMSCAPE.fixedSites).toBeDefined();
    for (let i = 0; i < 20; i++) {
      resetAtlasGenerator();
      const { sites, enhancedSiteType } = generateSiteComposition({
        layer: 0,
        dreamscape: STARTER_DREAMSCAPE,
        dreamscapes: TEST_DREAMSCAPES,
        context: defaultContext(),
        hasKnownDreamsign: false,
      });
      expect(sites.map((s) => s.type)).toEqual(STARTER_DREAMSCAPE.fixedSites);
      expect(sites.some((s) => s.isEnhanced)).toBe(false);
      expect(enhancedSiteType).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// 7-layer atlas generation invariants
// ---------------------------------------------------------------------------

/** Builds a fresh atlas with logging suppressed. */
function freshAtlas(): DreamAtlas {
  return generateInitialAtlas(0, defaultContext(), buildContext(), {
    logEvents: false,
  });
}

/** Returns every node in `atlas` reachable from the start via forward edges. */
function reachableFromStart(atlas: DreamAtlas): Set<string> {
  const seen = new Set<string>([atlas.startingNodeId]);
  const queue = [atlas.startingNodeId];
  while (queue.length > 0) {
    const id = queue.shift();
    if (id === undefined) break;
    for (const next of atlas.nodes[id].forwardIds) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return seen;
}

describe("generateInitialAtlas structural invariants", () => {
  it("produces exactly 7 layers with valid widths every iteration", () => {
    for (let iter = 0; iter < 60; iter++) {
      const atlas = freshAtlas();
      expect(atlas.layers).toHaveLength(7);
      expect(atlas.layers[0]).toHaveLength(1);
      expect(atlas.layers[6]).toHaveLength(1);
      for (let layer = 0; layer < 7; layer++) {
        const spec = TEST_ATLAS_CONFIG.layerSpecs[layer];
        expect(atlas.layers[layer].length).toBeGreaterThanOrEqual(spec.min);
        expect(atlas.layers[layer].length).toBeLessThanOrEqual(spec.max);
      }
    }
  });

  it("keeps every non-boss node with a forward edge and every non-starter with a backward edge", () => {
    for (let iter = 0; iter < 60; iter++) {
      const atlas = freshAtlas();
      for (const node of Object.values(atlas.nodes)) {
        if (node.id !== atlas.bossNodeId) {
          expect(node.forwardIds.length).toBeGreaterThanOrEqual(1);
        }
        if (node.id !== atlas.startingNodeId) {
          expect(node.backwardIds.length).toBeGreaterThanOrEqual(1);
        }
      }
    }
  });

  it("keeps the boss reachable from the start via forward edges", () => {
    for (let iter = 0; iter < 60; iter++) {
      const atlas = freshAtlas();
      const reachable = reachableFromStart(atlas);
      expect(reachable.has(atlas.bossNodeId)).toBe(true);
      // Every node should be reachable forward from the start.
      for (const id of Object.keys(atlas.nodes)) {
        expect(reachable.has(id)).toBe(true);
      }
    }
  });

  it("never wires two crossing forward edges within a layer gap", () => {
    for (let iter = 0; iter < 60; iter++) {
      const atlas = freshAtlas();
      for (let layer = 0; layer < atlas.layers.length - 1; layer++) {
        const edges: Array<[number, number]> = [];
        for (const fromId of atlas.layers[layer]) {
          const fromNode = atlas.nodes[fromId];
          for (const toId of fromNode.forwardIds) {
            const toNode = atlas.nodes[toId];
            edges.push([fromNode.indexInLayer, toNode.indexInLayer]);
          }
        }
        for (let a = 0; a < edges.length; a++) {
          for (let b = a + 1; b < edges.length; b++) {
            expect(
              edgesCross(edges[a][0], edges[a][1], edges[b][0], edges[b][1]),
            ).toBe(false);
          }
        }
      }
    }
  });

  it("never places a revealed dreamscape adjacent to a copy of itself", () => {
    for (let iter = 0; iter < 60; iter++) {
      const atlas = freshAtlas();
      for (const node of Object.values(atlas.nodes)) {
        if (node.dreamscapeId === null) {
          continue;
        }
        for (const neighborId of [...node.forwardIds, ...node.backwardIds]) {
          const neighbor = atlas.nodes[neighborId];
          if (neighbor.dreamscapeId === null) {
            continue;
          }
          expect(neighbor.dreamscapeId).not.toBe(node.dreamscapeId);
        }
      }
    }
  });

  it("places at most 2 known dreamsigns, only in eligible layers, with unique pool ids", () => {
    const eligibleLayers = new Set(
      TEST_ATLAS_CONFIG.knownDreamsign.eligibleLayers.map((l) => l - 1),
    );
    for (let iter = 0; iter < 60; iter++) {
      const atlas = freshAtlas();
      const carriers = atlas.knownDreamsignCarrierIds;
      expect(carriers.length).toBeLessThanOrEqual(
        TEST_ATLAS_CONFIG.knownDreamsign.maxPerAtlas,
      );
      const grantedIds = new Set<string>();
      for (const carrierId of carriers) {
        const node = atlas.nodes[carrierId];
        expect(node.knownDreamsignId).not.toBeNull();
        expect(eligibleLayers.has(node.layer)).toBe(true);
        expect(TEST_DREAMSIGN_POOL).toContain(node.knownDreamsignId);
        // Unique per atlas.
        expect(grantedIds.has(node.knownDreamsignId ?? "")).toBe(false);
        grantedIds.add(node.knownDreamsignId ?? "");
      }
      // Every node carrying a known dreamsign is listed as a carrier.
      const nodesWithDreamsign = Object.values(atlas.nodes).filter(
        (n) => n.knownDreamsignId !== null,
      );
      expect(nodesWithDreamsign).toHaveLength(carriers.length);
    }
  });

  it("reveals the boss and starter at start, with a small bonus reveal", () => {
    for (let iter = 0; iter < 60; iter++) {
      const atlas = freshAtlas();
      expect(atlas.nodes[atlas.startingNodeId].state).toBe("available");
      expect(atlas.nodes[atlas.bossNodeId].state).toBe("revealedLocked");

      const revealedLocked = Object.values(atlas.nodes).filter(
        (n) => n.state === "revealedLocked",
      );
      // Boss plus 0-2 bonus reveals.
      const bonusCount = revealedLocked.length - 1;
      expect(bonusCount).toBeGreaterThanOrEqual(
        TEST_ATLAS_CONFIG.bonusReveal.min,
      );
      expect(bonusCount).toBeLessThanOrEqual(TEST_ATLAS_CONFIG.bonusReveal.max);
    }
  });

  it("assigns the starter dreamscape to layer 0 and a non-starter to the boss", () => {
    const starter = TEST_DREAMSCAPES.find((d) => d.isStarter);
    expect(starter).toBeDefined();
    for (let iter = 0; iter < 30; iter++) {
      const atlas = freshAtlas();
      expect(atlas.nodes[atlas.startingNodeId].dreamscapeId).toBe(starter?.id);
      const boss = atlas.nodes[atlas.bossNodeId];
      expect(boss.dreamscapeId).not.toBe(starter?.id);
      expect(boss.dreamscapeId).not.toBeNull();
    }
  });

  it("places the starting dreamscape at the left edge (x=0)", () => {
    const atlas = freshAtlas();
    expect(atlas.nodes[atlas.startingNodeId].position.x).toBe(0);
  });

  it("gives the two layer-1 choices out of the starter different dreamscapes (and signature site icons)", () => {
    const dreamscapesById = new Map(
      TEST_DREAMSCAPES.map((d) => [d.id, d]),
    );
    for (let iter = 0; iter < 60; iter++) {
      const atlas = freshAtlas();
      // Layer 1 is the first choice out of Firstlight Meadow. Derive its
      // expected width from the live config rather than hardcoding it; the
      // layer-1-distinct feature inherently needs at least 2 nodes. Reveal both
      // nodes the way consumers do: completing the starter makes its forward
      // targets available, which reveals their dreamscapes.
      const layer1 = atlas.layers[1];
      const layer1Spec = TEST_ATLAS_CONFIG.layerSpecs[1];
      expect(layer1Spec.min).toBeGreaterThanOrEqual(2);
      expect(layer1.length).toBeGreaterThanOrEqual(layer1Spec.min);
      expect(layer1.length).toBeLessThanOrEqual(layer1Spec.max);
      const advanced = advanceAtlas(
        atlas,
        atlas.startingNodeId,
        1,
        defaultContext(),
        buildContext(),
        { logEvents: false },
      );

      const [a, b] = layer1.map((id) => advanced.nodes[id]);
      expect(a.state).toBe("available");
      expect(b.state).toBe("available");
      expect(a.dreamscapeId).not.toBeNull();
      expect(b.dreamscapeId).not.toBeNull();

      // Different dreamscapes...
      expect(a.dreamscapeId).not.toBe(b.dreamscapeId);
      // ...and therefore different signature site icons, since each dreamscape
      // has a unique signature site.
      const siteA = dreamscapesById.get(a.dreamscapeId ?? "")?.signatureSite;
      const siteB = dreamscapesById.get(b.dreamscapeId ?? "")?.signatureSite;
      expect(siteA).toBeDefined();
      expect(siteB).toBeDefined();
      expect(siteA).not.toBe(siteB);
    }
  });
});

describe("advanceAtlas", () => {
  it("marks the completed node completed and its forward targets available", () => {
    const atlas = freshAtlas();
    const advanced = advanceAtlas(
      atlas,
      atlas.startingNodeId,
      1,
      defaultContext(),
      buildContext(),
      { logEvents: false },
    );
    expect(advanced.nodes[atlas.startingNodeId].state).toBe("completed");
    for (const targetId of atlas.nodes[atlas.startingNodeId].forwardIds) {
      expect(advanced.nodes[targetId].state).toBe("available");
    }
    expect(advanced.currentNodeId).toBe(atlas.startingNodeId);
  });

  it("forgoes sibling nodes in the completed node's layer", () => {
    const atlas = freshAtlas();
    // Pick a layer-1 node to complete (layer 1 always has 2 nodes), so it has a
    // sibling to forgo. First advance through layer 0.
    const afterStart = advanceAtlas(
      atlas,
      atlas.startingNodeId,
      1,
      defaultContext(),
      buildContext(),
      { logEvents: false },
    );
    const layer1 = afterStart.layers[1];
    expect(layer1.length).toBeGreaterThanOrEqual(2);
    const chosen = layer1[0];
    const advanced = advanceAtlas(
      afterStart,
      chosen,
      2,
      defaultContext(),
      buildContext(),
      { logEvents: false },
    );
    expect(advanced.nodes[chosen].state).toBe("completed");
    for (const siblingId of layer1) {
      if (siblingId !== chosen) {
        expect(advanced.nodes[siblingId].state).toBe("forgone");
      }
    }
  });

  it("reveals the layer two ahead of the completed layer", () => {
    const atlas = freshAtlas();
    const advanced = advanceAtlas(
      atlas,
      atlas.startingNodeId,
      1,
      defaultContext(),
      buildContext(),
      { logEvents: false },
    );
    // Completing layer 0 reveals layer 2.
    for (const nodeId of advanced.layers[2]) {
      expect(advanced.nodes[nodeId].state).not.toBe("unrevealed");
    }
  });

  it("returns the atlas unchanged for an unknown node id", () => {
    const atlas = freshAtlas();
    const result = advanceAtlas(
      atlas,
      "nonexistent",
      1,
      defaultContext(),
      buildContext(),
      { logEvents: false },
    );
    expect(result).toBe(atlas);
  });

  // Realtime Database drops empty arrays on write, so an unrevealed node that
  // carries no sites yet round-trips back with `sites` absent. advanceAtlas
  // syncs its id counters across every node up front, so it must tolerate a
  // persisted node whose `sites` array is missing rather than throwing — a
  // throw here strands the post-victory atlas handoff and blocks progression.
  it("advances a persisted atlas whose unrevealed nodes lack a sites array", () => {
    const atlas = freshAtlas();
    const persisted: DreamAtlas = {
      ...atlas,
      nodes: Object.fromEntries(
        Object.entries(atlas.nodes).map(([id, node]) => {
          if (node.state !== "unrevealed") {
            return [id, node];
          }
          const { sites: _sites, ...withoutSites } = node;
          return [id, withoutSites as typeof node];
        }),
      ),
    };

    expect(() =>
      advanceAtlas(
        persisted,
        persisted.startingNodeId,
        1,
        defaultContext(),
        buildContext(),
        { logEvents: false },
      ),
    ).not.toThrow();

    const advanced = advanceAtlas(
      persisted,
      persisted.startingNodeId,
      1,
      defaultContext(),
      buildContext(),
      { logEvents: false },
    );
    expect(advanced.nodes[persisted.startingNodeId].state).toBe("completed");
  });

  // Realtime Database drops EVERY empty array on write, not just `sites`. The
  // boss node carries `forwardIds: []` and the starting node carries
  // `backwardIds: []`, so a round-tripped atlas loses those keys too. advanceAtlas
  // runs on every victory including the final boss (isFinalBoss only gates the
  // screen change, not the advance), so an unguarded `forwardIds` iteration
  // throws `forwardIds is not iterable` at the worst possible moment — winning
  // the run — stranding quest progression. This drives the full graph from start
  // through every layer up to and INCLUDING the boss on an atlas with all empty
  // arrays stripped, asserting no throw and that the boss ends completed.
  it("advances a fully RTDB-stripped atlas through every layer including the boss", () => {
    const original = freshAtlas();

    // Capture the navigation path off the intact atlas before stripping, since a
    // stripped atlas can no longer report a node's forward targets. Always take
    // the first forward edge so the walk follows a real start-to-boss route.
    const path: string[] = [original.startingNodeId];
    let walkId: string = original.startingNodeId;
    while (original.nodes[walkId].forwardIds.length > 0) {
      walkId = original.nodes[walkId].forwardIds[0];
      path.push(walkId);
    }
    const bossId = path[path.length - 1];
    expect(bossId).toBe(original.bossNodeId);

    // Simulate RTDB stripping: delete every empty array on every node and at the
    // atlas level. Non-empty arrays survive; empty ones vanish entirely.
    const stripEmptyArrays = <T extends object>(obj: T): T => {
      const next = { ...obj } as Record<string, unknown>;
      for (const [key, value] of Object.entries(next)) {
        if (Array.isArray(value) && value.length === 0) {
          delete next[key];
        }
      }
      return next as T;
    };

    const strippedNodes: Record<string, DreamscapeNode> = {};
    for (const [id, node] of Object.entries(original.nodes)) {
      strippedNodes[id] = stripEmptyArrays(node);
    }
    const stripped = stripEmptyArrays({
      ...original,
      nodes: strippedNodes,
    });

    // Sanity: the boss node really did lose its forwardIds, and the start lost
    // its backwardIds — the exact shape that crashes the unguarded path.
    expect(
      (stripped.nodes[bossId] as Partial<DreamscapeNode>).forwardIds,
    ).toBeUndefined();
    expect(
      (stripped.nodes[stripped.startingNodeId] as Partial<DreamscapeNode>)
        .backwardIds,
    ).toBeUndefined();

    let atlas = stripped;
    let completionLevel = 0;
    expect(() => {
      for (const nodeId of path) {
        atlas = advanceAtlas(
          atlas,
          nodeId,
          completionLevel,
          defaultContext(),
          buildContext(),
          { logEvents: false },
        );
        completionLevel += 1;
      }
    }).not.toThrow();

    // The boss advance applied: the boss node is completed.
    expect(atlas.nodes[bossId].state).toBe("completed");
  });

  // The Atlas UI styles all five AtlasNodeState values distinctly. If a played
  // run could never produce one of those states, the corresponding UI treatment
  // would be dead code that silently masks a regression. This drives the real
  // generator + advance logic from start through every layer (always taking the
  // first available forward node) and asserts that every AtlasNodeState value
  // shows up somewhere across the run, so the UI always has each state to render.
  it("produces every AtlasNodeState across a played-through quest", () => {
    let atlas = freshAtlas();
    const seenStates = new Set<AtlasNodeState>();

    const recordStates = (a: DreamAtlas) => {
      for (const node of Object.values(a.nodes)) {
        seenStates.add(node.state);
      }
    };
    recordStates(atlas);

    // Walk forward layer by layer: complete the current node, then step to one of
    // its now-available forward targets, until the boss (a node with no forward
    // edges) is completed.
    let currentId: string = atlas.startingNodeId;
    let completionLevel = 0;
    // Bounded by the fixed 7-layer depth; the guard prevents an infinite loop if
    // the graph were ever malformed.
    for (let step = 0; step < atlas.layers.length + 2; step++) {
      atlas = advanceAtlas(
        atlas,
        currentId,
        completionLevel,
        defaultContext(),
        buildContext(),
        { logEvents: false },
      );
      recordStates(atlas);
      completionLevel += 1;

      const forwardIds = atlas.nodes[currentId].forwardIds;
      if (forwardIds.length === 0) {
        break;
      }
      // Prefer an available forward node; the generator marks forward targets of
      // a completed node available.
      const nextId =
        forwardIds.find((id) => atlas.nodes[id].state === "available") ??
        forwardIds[0];
      currentId = nextId;
    }

    const allStates: AtlasNodeState[] = [
      "unrevealed",
      "revealedLocked",
      "available",
      "completed",
      "forgone",
    ];
    for (const expected of allStates) {
      expect(seenStates).toContain(expected);
    }
  });

  // The atlas snapshot the battle-completion bridge hands to `advanceAtlas` comes
  // off persisted state, where Realtime Database has dropped every stored `null`
  // and `structuredClone` has dropped every `undefined`-valued key — so an
  // unrevealed node arrives with `dreamscapeId` absent (`undefined`) rather than
  // `null`. If the reveal guard only treats a strict `null` as "needs revealing",
  // the just-completed node's forward targets are flipped to `available` but never
  // get a dreamscape or sites, stranding the player on a blank, dead-end
  // dreamscape with no battle to advance the run. This reproduces that snapshot
  // shape and asserts the advance fully reveals the forward (and look-ahead)
  // nodes.
  it("reveals forward nodes whose dreamscapeId arrived as undefined (RTDB null-drop)", () => {
    const original = freshAtlas();

    // Reshape every still-unrevealed node the way a persist/snapshot round-trip
    // does: drop `dreamscapeId` entirely (RTDB strips the stored `null`), clear
    // the name, and drop the empty `sites` array. Revealed nodes (start/boss/
    // bonus) keep their assigned dreamscape and sites.
    const snapshotNodes: Record<string, DreamscapeNode> = {};
    for (const [id, node] of Object.entries(original.nodes)) {
      if (node.dreamscapeId === null) {
        const { dreamscapeId: _dropped, ...rest } = node;
        // The `dreamscapeId` key is intentionally absent to mirror the persisted
        // snapshot shape (RTDB drops the stored `null`); cast through `unknown`
        // since the literal deliberately omits a required field.
        snapshotNodes[id] = {
          ...rest,
          biomeName: "",
          sites: [],
        } as unknown as DreamscapeNode;
      } else {
        snapshotNodes[id] = node;
      }
    }
    const snapshot: DreamAtlas = { ...original, nodes: snapshotNodes };

    // Sanity: the layer-1 forward targets really did lose their dreamscapeId key.
    const forwardTargets = original.nodes[original.startingNodeId].forwardIds;
    expect(forwardTargets.length).toBeGreaterThan(0);
    for (const id of forwardTargets) {
      expect(
        (snapshot.nodes[id] as Partial<DreamscapeNode>).dreamscapeId,
      ).toBeUndefined();
    }

    const advanced = advanceAtlas(
      snapshot,
      snapshot.startingNodeId,
      1,
      defaultContext(),
      buildContext(),
      { logEvents: false },
    );

    // Every newly-available forward node is fully revealed: it carries a real
    // dreamscape, a name, and a non-empty site list ending in a Battle so the
    // player can actually clear it and progress.
    for (const id of forwardTargets) {
      const node = advanced.nodes[id];
      expect(node.state).toBe("available");
      expect(node.dreamscapeId).not.toBeNull();
      expect(node.dreamscapeId).not.toBeUndefined();
      expect(node.biomeName).not.toBe("");
      expect(node.sites.length).toBeGreaterThan(0);
      expect(node.sites.some((s) => s.type === "Battle")).toBe(true);
    }
  });
});

describe("regenerateAtlasForProgress", () => {
  const countCompleted = (atlas: DreamAtlas) =>
    Object.values(atlas.nodes).filter((node) => node.state === "completed")
      .length;
  const countAvailable = (atlas: DreamAtlas) =>
    Object.values(atlas.nodes).filter((node) => node.state === "available")
      .length;

  it("rebuilds a fresh, unprogressed atlas at zero depth", () => {
    const atlas = regenerateAtlasForProgress(0, defaultContext(), buildContext(), {
      logEvents: false,
    });

    // No dreamscape has been completed yet, and the only entry point is the
    // starter — the same shape a brand-new quest begins with.
    expect(countCompleted(atlas)).toBe(0);
    expect(atlas.nodes[atlas.startingNodeId].state).toBe("available");
    expect(countAvailable(atlas)).toBeGreaterThan(0);
  });

  it("replays one completion per progress level", () => {
    for (const depth of [1, 2, 3]) {
      const atlas = regenerateAtlasForProgress(
        depth,
        defaultContext(),
        buildContext(),
        { logEvents: false },
      );
      // Each replayed level completes exactly one dreamscape, reproducing the
      // player's progress depth.
      expect(countCompleted(atlas)).toBe(depth);
      // The frontier is preserved: there is always somewhere to continue from.
      expect(countAvailable(atlas)).toBeGreaterThan(0);
    }
  });

  it("places the player at the current frontier with revealed layers ahead", () => {
    const atlas = regenerateAtlasForProgress(
      2,
      defaultContext(),
      buildContext(),
      { logEvents: false },
    );

    // The available frontier sits ahead of every completed node, and there is
    // at least one revealed-but-locked node further out — the layer-ahead reveal
    // that gives the player a glimpse of what is coming.
    const completedLayers = Object.values(atlas.nodes)
      .filter((node) => node.state === "completed")
      .map((node) => node.layer);
    const deepestCompleted = Math.max(...completedLayers);
    const availableLayers = Object.values(atlas.nodes)
      .filter((node) => node.state === "available")
      .map((node) => node.layer);
    expect(Math.min(...availableLayers)).toBeGreaterThan(deepestCompleted);
    expect(
      Object.values(atlas.nodes).some(
        (node) => node.state === "revealedLocked",
      ),
    ).toBe(true);
  });

  it("stops cleanly when the requested depth exceeds the reachable path", () => {
    // A depth far beyond the 7-layer atlas cannot complete more nodes than the
    // graph allows; the replay breaks out rather than looping forever.
    const atlas = regenerateAtlasForProgress(
      100,
      defaultContext(),
      buildContext(),
      { logEvents: false },
    );
    expect(countCompleted(atlas)).toBeGreaterThan(0);
    expect(countCompleted(atlas)).toBeLessThanOrEqual(
      Object.keys(atlas.nodes).length,
    );
  });
});

describe("edgesCross", () => {
  it("detects crossing and non-crossing edge pairs", () => {
    // (0->1) and (1->0) cross.
    expect(edgesCross(0, 1, 1, 0)).toBe(true);
    // (0->0) and (1->1) do not cross.
    expect(edgesCross(0, 0, 1, 1)).toBe(false);
    // Shared source never crosses.
    expect(edgesCross(0, 0, 0, 2)).toBe(false);
  });
});

describe("previewSiteTypes", () => {
  it("excludes Battle and Draft", () => {
    const node = makeTestAtlasNode("test", [
      { id: "s1", type: "Draft", isEnhanced: false, isVisited: false },
      { id: "s2", type: "Battle", isEnhanced: false, isVisited: false },
      { id: "s4", type: "Shop", isEnhanced: false, isVisited: false },
      { id: "s5", type: "Essence", isEnhanced: false, isVisited: false },
    ]);
    const preview = previewSiteTypes(node);
    expect(preview).toEqual(["Shop", "Essence"]);
  });

  it("returns at most 3 site types", () => {
    const node = makeTestAtlasNode("test", [
      { id: "s1", type: "Shop", isEnhanced: false, isVisited: false },
      { id: "s2", type: "Essence", isEnhanced: false, isVisited: false },
      { id: "s3", type: "Purge", isEnhanced: false, isVisited: false },
      { id: "s4", type: "DreamAugury", isEnhanced: false, isVisited: false },
    ]);
    const preview = previewSiteTypes(node);
    expect(preview.length).toBeLessThanOrEqual(3);
  });
});

describe("revealedAtlasSite", () => {
  function makeSite(id: string, type: SiteType, isEnhanced = false): SiteState {
    return { id, type, isEnhanced, isVisited: false };
  }

  function makeNode(
    id: string,
    sites: SiteState[],
    enhancedSiteType: SiteType | null,
  ): DreamscapeNode {
    return makeTestAtlasNode(id, sites, { enhancedSiteType });
  }

  it("never reveals the Battle site even if it is the only marked-enhanced one", () => {
    const node = makeNode(
      "dreamscape-1",
      [
        makeSite("a", "Shop"),
        makeSite("b", "Essence"),
        makeSite("c", "Battle", true),
      ],
      "Battle",
    );
    const revealed = revealedAtlasSite(node);
    expect(revealed).not.toBeNull();
    expect(revealed?.type).not.toBe("Battle");
  });

  it("reveals the enhanced site when the dreamscape has one", () => {
    const node = makeNode(
      "dreamscape-1",
      [
        makeSite("a", "Shop"),
        makeSite("b", "Essence", true),
        makeSite("c", "Battle"),
      ],
      "Essence",
    );
    const revealed = revealedAtlasSite(node);
    expect(revealed?.id).toBe("b");
    expect(revealed?.type).toBe("Essence");
  });

  it("picks deterministically from non-battle sites when there is no enhanced site", () => {
    const sites = [
      makeSite("a", "Draft"),
      makeSite("b", "Shop"),
      makeSite("c", "Essence"),
      makeSite("d", "Battle"),
    ];
    const node = makeNode("dreamscape-7", sites, null);
    const first = revealedAtlasSite(node);
    const second = revealedAtlasSite(node);
    expect(first).not.toBeNull();
    expect(first?.type).not.toBe("Battle");
    expect(second?.id).toBe(first?.id);
  });

  it("returns the same site for the same node id across calls (reload-resilient)", () => {
    const sites = [
      makeSite("s1", "Draft"),
      makeSite("s2", "Shop"),
      makeSite("s3", "DreamAugury"),
      makeSite("s4", "Essence"),
      makeSite("s5", "Battle"),
    ];
    const nodeA = makeNode("dreamscape-42", sites, null);
    const nodeAClone = makeNode("dreamscape-42", sites, null);
    expect(revealedAtlasSite(nodeA)?.id).toBe(revealedAtlasSite(nodeAClone)?.id);
  });

  it("returns different reveals for different node ids (at least sometimes)", () => {
    const sites: SiteState[] = [
      makeSite("a", "Draft"),
      makeSite("b", "Shop"),
      makeSite("c", "Essence"),
      makeSite("d", "DreamAugury"),
      makeSite("e", "Battle"),
    ];
    const distinctTypes = new Set<SiteType>();
    for (let i = 0; i < 50; i++) {
      const node = makeNode(`dreamscape-${String(i)}`, sites, null);
      const revealed = revealedAtlasSite(node);
      if (revealed) distinctTypes.add(revealed.type);
    }
    expect(distinctTypes.size).toBeGreaterThan(1);
  });

  it("never reveals a Draft site", () => {
    for (let i = 0; i < 50; i++) {
      const node = makeNode(
        `dreamscape-${String(i)}`,
        [
          makeSite("a", "Draft"),
          makeSite("b", "Draft"),
          makeSite("c", "Shop"),
          makeSite("d", "Essence"),
          makeSite("e", "Battle"),
        ],
        null,
      );
      const revealed = revealedAtlasSite(node);
      expect(revealed?.type).not.toBe("Draft");
      expect(revealed?.type).not.toBe("Battle");
    }
  });

  it("returns null for nodes with no sites", () => {
    const node = makeNode("empty-node", [], null);
    expect(revealedAtlasSite(node)).toBeNull();
  });

  it("falls back to deterministic pick if enhancedSiteType is set but no site is marked isEnhanced", () => {
    const node = makeNode(
      "dreamscape-9",
      [
        makeSite("a", "Shop"),
        makeSite("b", "Essence"),
        makeSite("c", "Battle"),
      ],
      "Reward",
    );
    const revealed = revealedAtlasSite(node);
    expect(revealed).not.toBeNull();
    expect(revealed?.type).not.toBe("Battle");
  });
});

describe("siteTypeDescription", () => {
  it("returns a non-empty string for every site type", () => {
    for (const t of ALL_SITE_TYPES) {
      const desc = siteTypeDescription(t);
      expect(typeof desc).toBe("string");
      expect(desc.length).toBeGreaterThan(0);
    }
  });
});

describe("siteTypeIcon", () => {
  it("returns an icon class (not an emoji) for every site type", () => {
    // Site icons are Boxicons 3 filled (`bxf bx-*`); Transfiguration is the
    // lone Font Awesome exception because Boxicons has no hammer glyph.
    for (const t of ALL_SITE_TYPES) {
      const icon = siteTypeIcon(t);
      expect(icon).toMatch(/^(bxf? bx-[a-z0-9-]+|fa-solid fa-[a-z0-9-]+)$/);
    }
  });

  it("assigns a distinct icon to every site type", () => {
    const icons = ALL_SITE_TYPES.map((t) => siteTypeIcon(t));
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe("additionalSiteTypesForLevel", () => {
  it("returns the fill candidate site types for a dreamscape layer", () => {
    const dreamscape = NON_STARTER_DREAMSCAPES[0];
    const types = additionalSiteTypesForLevel(
      3,
      dreamscape.signatureSite,
      TEST_DREAMSCAPES,
      defaultContext(),
    );
    // Essence is always an eligible fill option.
    expect(types).toContain("Essence");
    // The dreamscape's own signature site is excluded from its fill.
    expect(types).not.toContain(dreamscape.signatureSite);
    // Another dreamscape's signature site is an eligible fill option.
    const otherSignature = NON_STARTER_DREAMSCAPES.find(
      (d) => d.signatureSite !== dreamscape.signatureSite,
    )?.signatureSite;
    expect(otherSignature).toBeDefined();
    if (otherSignature !== undefined) {
      expect(types).toContain(otherSignature);
    }
  });
});

describe("rewardPreviewLabel", () => {
  it("returns null for reward sites so the caller does not duplicate 'Reward'", () => {
    const site: SiteState = {
      id: "s1",
      type: "Reward",
      isEnhanced: false,
      isVisited: false,
    };
    expect(rewardPreviewLabel(site)).toBeNull();
  });

  it("returns null for non-reward sites", () => {
    const site: SiteState = {
      id: "s2",
      type: "Shop",
      isEnhanced: false,
      isVisited: false,
    };
    expect(rewardPreviewLabel(site)).toBeNull();
  });
});
