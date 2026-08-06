import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  additionalSiteTypesForLevel,
  advanceAtlas,
  generateSiteComposition,
  generateInitialAtlas,
  edgesCross,
  regenerateAtlasForProgress,
  revealedAtlasSite,
  resetAtlasGenerator,
  type AtlasBuildContext,
  type SiteGenerationContext,
} from "./atlas-generator";
import {
  makeSyntheticAtlasData,
  makeTestAtlasNode,
  SYNTHETIC_ATLAS_DREAMSCAPES,
} from "../__test-helpers__/atlas-fixtures";
import type {
  AtlasNodeState,
  DreamAtlas,
  DreamscapeNode,
  SiteState,
  SiteType,
} from "../types/journey";
import {
  LayerName,
  layerAtOrdinal,
  layerOrdinal,
} from "../types/layer-name";

function defaultContext(
  overrides?: Partial<SiteGenerationContext>,
): SiteGenerationContext {
  return {
    ...overrides,
  };
}

const TEST_DREAMSCAPES = SYNTHETIC_ATLAS_DREAMSCAPES;
const TEST_ATLAS_DATA = makeSyntheticAtlasData();
// Dreamsign ids the known-dreamsign placement can draw from; arbitrary unique
// strings so the tests do not depend on any real dreamsign data.
const TEST_DREAMSIGN_POOL = Array.from(
  { length: 8 },
  (_, i) => `test-dreamsign-${String(i)}`,
);

let fixtureRandomState = 1;

function nextFixtureRandom(): number {
  fixtureRandomState = (fixtureRandomState * 1664525 + 1013904223) >>> 0;
  return fixtureRandomState / 0x100000000;
}

function buildContext(
  overrides?: Partial<AtlasBuildContext>,
): AtlasBuildContext {
  return {
    dreamscapes: TEST_DREAMSCAPES,
    atlasData: TEST_ATLAS_DATA,
    dreamsignPoolIds: TEST_DREAMSIGN_POOL,
    ...overrides,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  fixtureRandomState = 1;
  vi.spyOn(Math, "random").mockImplementation(nextFixtureRandom);
  resetAtlasGenerator();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

// ---------------------------------------------------------------------------
// Synthetic site-composition fixtures exercise the stable AtlasData contract.
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
  { length: TEST_ATLAS_DATA.layers.length - 1 },
  (_, i) => i + 1,
);

/** Expected mandatory draft count for a 0-indexed atlas layer (doc table). */
function expectedDraftCount(layer: number): number {
  return TEST_ATLAS_DATA.layers[layer]?.mandatorySites.Draft ?? 0;
}

/** Layers where Purge is mandatory (0-indexed 1 and 2; doc layers 2 and 3). */
function expectsMandatoryPurge(layer: number): boolean {
  return (TEST_ATLAS_DATA.layers[layer]?.mandatorySites.Purge ?? 0) > 0;
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
    layer: layerAtOrdinal(layer) ?? LayerName.One,
    dreamscape,
    dreamscapes: TEST_DREAMSCAPES,
    atlasData: TEST_ATLAS_DATA,
    context: defaultContext(),
    hasKnownDreamsign: overrides?.hasKnownDreamsign,
    rng: nextFixtureRandom,
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
  it("persists the configured pick target on generated Draft sites", () => {
    const home = { ...NON_STARTER_DREAMSCAPES[0], signatureSite: "Draft" as const };
    const result = generateSiteComposition({
      layer: LayerName.Two,
      dreamscape: home,
      dreamscapes: TEST_DREAMSCAPES,
      atlasData: TEST_ATLAS_DATA,
      context: { draftPickCount: 7 },
      rng: nextFixtureRandom,
    });
    const draftSites = result.sites.filter((site) => site.type === "Draft");
    expect(draftSites.length).toBeGreaterThan(0);
    for (const site of draftSites) {
      expect(site.data?.draftPickCount).toBe(7);
    }
  });

  it("builds the presenting guide's home Random Site with a distinct eligible candidate pool", () => {
    const home = NON_STARTER_DREAMSCAPES.find(
      (dreamscape) => dreamscape.signatureSite === "RandomSite",
    );
    if (home === undefined) throw new Error("expected a Random Site dreamscape");
    const sites = composeFor(home, 4);
    const randomSite = sites.find((site) => site.type === "RandomSite");
    expect(randomSite?.isEnhanced).toBe(true);
    expect(randomSite?.randomSite?.mode).toBe("homeChoice");
    expect(randomSite?.randomSite?.candidateSiteTypes.length).toBeGreaterThanOrEqual(3);
    expect(new Set(randomSite?.randomSite?.candidateSiteTypes).size).toBe(
      randomSite?.randomSite?.candidateSiteTypes.length,
    );
    const visibleTypes = new Set(sites.map((site) => site.type));
    for (const candidate of randomSite?.randomSite?.candidateSiteTypes ?? []) {
      expect(visibleTypes.has(candidate)).toBe(false);
    }
  });

  it("excludes hard-removed destinations from the Random Site candidate pool", () => {
    const home = NON_STARTER_DREAMSCAPES.find(
      (dreamscape) => dreamscape.signatureSite === "RandomSite",
    );
    if (home === undefined) throw new Error("expected a Random Site dreamscape");
    const result = generateSiteComposition({
      layer: LayerName.Five,
      dreamscape: home,
      dreamscapes: TEST_DREAMSCAPES,
      atlasData: TEST_ATLAS_DATA,
      context: {
        dreamscapeModifiers: [{
          kind: "remove_shop_sites",
          dreamscapesRemaining: 1,
          source: "fixture",
        }],
      },
      rng: nextFixtureRandom,
    });
    const randomSite = result.sites.find((site) => site.type === "RandomSite");
    expect(randomSite?.randomSite?.candidateSiteTypes).not.toContain("Shop");
  });
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
          // The presenting guide's hidden destination is also enhanced when Random Site fills
          // a different guide's dreamscape.
          expect(sites.filter((s) => s.isEnhanced)).toHaveLength(
            1 + (sites.some((site) => site.type === "RandomSite" && site !== signature[0]) ? 1 : 0),
          );
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

  it("guarantees an Augury in Layer II (0-indexed layer 1)", () => {
    for (const dreamscape of NON_STARTER_DREAMSCAPES) {
      for (const layer of NON_STARTER_LAYERS) {
        let allHadAugury = true;
        for (let i = 0; i < 30; i++) {
          const sites = composeFor(dreamscape, layer);
          const hasAugury = sites.some((s) => s.type === "Augury");
          if (layer === 1 && !hasAugury) {
            allHadAugury = false;
          }
          // Augury, when present, is never duplicated.
          expect(
            sites.filter((s) => s.type === "Augury").length,
          ).toBeLessThanOrEqual(1);
        }
        if (layer === 1) {
          expect(allHadAugury).toBe(true);
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

  it("uses the selected fill profile's exact weights", () => {
    const weightedProfiles = {
      early: {
        id: "early",
        signatureSiteWeight: 0,
        siteWeights: { Transfiguration: 1, Duplication: 10 },
      },
      late: {
        id: "late",
        signatureSiteWeight: 0,
        siteWeights: { Transfiguration: 10, Duplication: 1 },
      },
    };

    function bossFill(fillProfile: "early" | "late"): SiteType {
      const atlasData = makeSyntheticAtlasData();
      atlasData.fillProfiles = weightedProfiles;
      atlasData.layers = atlasData.layers.map((layer) =>
        layer.role === "boss"
          ? {
              ...layer,
              fillProfile,
              siteCount: { min: 2, max: 2 },
            }
          : layer,
      );
      resetAtlasGenerator();
      const atlas = generateInitialAtlas(
        0,
        defaultContext(),
        buildContext({ atlasData }),
        { logEvents: false, rng: () => 0.6 },
      );
      return atlas.nodes[atlas.bossNodeId].sites[0].type;
    }

    expect(bossFill("early")).toBe("Duplication");
    expect(bossFill("late")).toBe("Transfiguration");
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
        layer: LayerName.One,
        dreamscape: STARTER_DREAMSCAPE,
        dreamscapes: TEST_DREAMSCAPES,
        atlasData: TEST_ATLAS_DATA,
        context: defaultContext(),
        hasKnownDreamsign: false,
        rng: nextFixtureRandom,
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
        const spec = TEST_ATLAS_DATA.layers[layer].nodeCount;
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
      TEST_ATLAS_DATA.knownDreamsign.eligibleLayers.map(layerOrdinal),
    );
    for (let iter = 0; iter < 60; iter++) {
      const atlas = freshAtlas();
      const carriers = atlas.knownDreamsignCarrierIds;
      expect(carriers.length).toBeLessThanOrEqual(
        TEST_ATLAS_DATA.knownDreamsign.maxPerAtlas,
      );
      const grantedIds = new Set<string>();
      for (const carrierId of carriers) {
        const node = atlas.nodes[carrierId];
        expect(node.knownDreamsignId).not.toBeNull();
        expect(eligibleLayers.has(layerOrdinal(node.layer))).toBe(true);
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

  it("draws known dreamsigns from random positions in the available pool", () => {
    const atlasData = {
      ...TEST_ATLAS_DATA,
      knownDreamsign: {
        ...TEST_ATLAS_DATA.knownDreamsign,
        maxPerAtlas: 1,
        placementProbability: 1,
      },
    };

    vi.mocked(Math.random).mockReturnValue(0);
    const firstDraw = generateInitialAtlas(
      0,
      defaultContext(),
      buildContext({ atlasData }),
      { logEvents: false },
    );
    const firstCarrier = firstDraw.knownDreamsignCarrierIds[0];
    expect(firstDraw.nodes[firstCarrier].knownDreamsignId).toBe(
      TEST_DREAMSIGN_POOL[0],
    );

    vi.mocked(Math.random).mockReturnValue(0.999999);
    const lastDraw = generateInitialAtlas(
      0,
      defaultContext(),
      buildContext({ atlasData }),
      { logEvents: false },
    );
    const lastCarrier = lastDraw.knownDreamsignCarrierIds[0];
    expect(lastDraw.nodes[lastCarrier].knownDreamsignId).toBe(
      TEST_DREAMSIGN_POOL[TEST_DREAMSIGN_POOL.length - 1],
    );
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
        TEST_ATLAS_DATA.graph.bonusReveal.min,
      );
      expect(bonusCount).toBeLessThanOrEqual(TEST_ATLAS_DATA.graph.bonusReveal.max);
    }
  });

  it("assigns the starter dreamscape to layer I and configured Limbo to the boss", () => {
    const starter = TEST_DREAMSCAPES.find((d) => d.isStarter);
    expect(starter).toBeDefined();
    for (let iter = 0; iter < 30; iter++) {
      const atlas = freshAtlas();
      expect(atlas.nodes[atlas.startingNodeId].dreamscapeId).toBe(starter?.id);
      const boss = atlas.nodes[atlas.bossNodeId];
      expect(boss.dreamscapeId).toBe(TEST_ATLAS_DATA.boss.dreamscapeId);
      expect(boss.biomeName).toBe(TEST_ATLAS_DATA.boss.place);
      expect(boss.enhancedSiteType).toBeNull();
      expect(boss.sites[boss.sites.length - 1]?.type).toBe("Battle");
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
      const layer1Spec = TEST_ATLAS_DATA.layers[1].nodeCount;
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

  it("never assigns the same dreamscape twice within one layer", () => {
    for (let iter = 0; iter < 60; iter++) {
      const atlas = freshAtlas();
      // Complete the starter (reveals layer 1 as the available frontier), then
      // complete a layer-1 node, which fully reveals layer 3 — the layer where a
      // same-layer duplicate was observed. Every revealed node in a layer must
      // carry a distinct dreamscape.
      const afterStart = advanceAtlas(
        atlas,
        atlas.startingNodeId,
        1,
        defaultContext(),
        buildContext(),
        { logEvents: false },
      );
      const firstChoice = afterStart.layers[1].find(
        (id) => afterStart.nodes[id].state === "available",
      );
      expect(firstChoice).toBeDefined();
      const afterLayer1 = advanceAtlas(
        afterStart,
        firstChoice ?? atlas.startingNodeId,
        2,
        defaultContext(),
        buildContext(),
        { logEvents: false },
      );

      for (const layerIds of afterLayer1.layers) {
        const revealedDreamscapeIds = layerIds
          .map((id) => afterLayer1.nodes[id].dreamscapeId)
          .filter((id): id is string => id !== null && id !== undefined);
        expect(new Set(revealedDreamscapeIds).size).toBe(
          revealedDreamscapeIds.length,
        );
      }
    }
  });
});

describe("advanceAtlas", () => {
  it("is byte-identical across optimistic and confirmed refolds in one runtime", () => {
    const atlas = freshAtlas();
    const options = { logEvents: false, rng: () => 0.25 };
    const first = advanceAtlas(
      atlas,
      atlas.startingNodeId,
      1,
      defaultContext(),
      buildContext(),
      options,
    );
    const second = advanceAtlas(
      atlas,
      atlas.startingNodeId,
      1,
      defaultContext(),
      buildContext(),
      options,
    );

    expect(second).toEqual(first);
  });

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
  // the run — stranding journey progression. This drives the full graph from start
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
  it("produces every AtlasNodeState across a played-through journey", () => {
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
    // starter — the same shape a brand-new journey begins with.
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
      .map((node) => layerOrdinal(node.layer));
    const deepestCompleted = Math.max(...completedLayers);
    const availableLayers = Object.values(atlas.nodes)
      .filter((node) => node.state === "available")
      .map((node) => layerOrdinal(node.layer));
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

  // The invariant the `?goto=atlasN` jump and the Debug Regenerate button both
  // depend on: a replayed atlas must look like a real playthrough, where the
  // completed dreamscapes form a single connected route the player actually
  // walked. A layout with disconnected `completed` segments is unreachable in
  // the live game, so the replay must never produce one — at any depth, on any
  // random roll. This is a structural check (edges and lifecycle states only);
  // it makes no assumptions about which dreamscapes the production TOML defines.
  describe("completed path is always a connected route", () => {
    /**
     * Walks forward edges from the starter, hopping to the single completed
     * successor at each step, and returns the ids reached. If the completed
     * nodes form one connected chain, this visits every completed node.
     */
    const walkCompletedChainFromStart = (atlas: DreamAtlas): string[] => {
      const visited: string[] = [];
      let current: string | null = atlas.startingNodeId;
      while (current !== null) {
        const node: DreamscapeNode | undefined = atlas.nodes[current];
        if (node === undefined || node.state !== "completed") {
          break;
        }
        visited.push(current);
        const forwardIds: readonly string[] = node.forwardIds ?? [];
        current =
          forwardIds.find((id) => atlas.nodes[id]?.state === "completed") ??
          null;
      }
      return visited;
    };

    it("connects every completed node in one chain from the starter", () => {
      for (let trial = 0; trial < 100; trial++) {
        for (const depth of [1, 2, 3, 4, 5, 6]) {
          const atlas = regenerateAtlasForProgress(
            depth,
            defaultContext(),
            buildContext(),
            { logEvents: false },
          );
          const completedIds = Object.values(atlas.nodes)
            .filter((node) => node.state === "completed")
            .map((node) => node.id);
          const reachedByWalk = walkCompletedChainFromStart(atlas);
          // Every completed node is reached by walking forward edges from the
          // starter: no orphaned `completed` node sits off the traversed route.
          expect(reachedByWalk.slice().sort()).toEqual(
            completedIds.slice().sort(),
          );
          // The chain starts at the starter and holds exactly one completed
          // node per layer it passes through (the player never completes two
          // dreamscapes in the same layer).
          expect(reachedByWalk[0]).toBe(atlas.startingNodeId);
          const layersOnChain = reachedByWalk.map((id) =>
            layerOrdinal(atlas.nodes[id].layer),
          );
          expect(new Set(layersOnChain).size).toBe(layersOnChain.length);
        }
      }
    });
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
      makeSite("s3", "Augury"),
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
      makeSite("d", "Augury"),
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

describe("additionalSiteTypesForLevel", () => {
  it("returns the fill candidate site types for a dreamscape layer", () => {
    const dreamscape = NON_STARTER_DREAMSCAPES[0];
    const types = additionalSiteTypesForLevel(
      LayerName.Four,
      dreamscape.signatureSite,
      TEST_DREAMSCAPES,
      defaultContext(),
      TEST_ATLAS_DATA,
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
