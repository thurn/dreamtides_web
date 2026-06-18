import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  additionalSiteTypesForLevel,
  advanceAtlas,
  generateSiteComposition,
  generateInitialAtlas,
  edgesCross,
  previewSiteTypes,
  revealedAtlasSite,
  rewardPreviewLabel,
  resetAtlasGenerator,
  siteTypeDescription,
  siteTypeIcon,
  type AtlasBuildContext,
  type SiteGenerationContext,
} from "./atlas-generator";
import {
  loadTestAtlasConfig,
  loadTestDreamscapes,
  makeTestAtlasNode,
} from "../__test-helpers__/atlas-fixtures";
import type {
  DreamAtlas,
  DreamscapeNode,
  SiteState,
  SiteType,
} from "../types/quest";

function defaultContext(
  overrides?: Partial<SiteGenerationContext>,
): SiteGenerationContext {
  return {
    playerHasBanes: false,
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

describe("generateSiteComposition", () => {
  it("produces 3-6 sites for level 0 first dreamscape", () => {
    for (let i = 0; i < 50; i++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(0, true, defaultContext());
      expect(sites.length).toBeGreaterThanOrEqual(3);
      expect(sites.length).toBeLessThanOrEqual(6);
    }
  });

  it("produces 3-6 sites for level 0 non-first dreamscape", () => {
    for (let i = 0; i < 50; i++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(0, false, defaultContext());
      expect(sites.length).toBeGreaterThanOrEqual(3);
      expect(sites.length).toBeLessThanOrEqual(6);
    }
  });

  it("produces 3-6 sites for level 3", () => {
    for (let i = 0; i < 50; i++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(3, false, defaultContext());
      expect(sites.length).toBeGreaterThanOrEqual(3);
      expect(sites.length).toBeLessThanOrEqual(6);
    }
  });

  it("produces 3-6 sites for level 5+", () => {
    for (let i = 0; i < 50; i++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(7, false, defaultContext());
      expect(sites.length).toBeGreaterThanOrEqual(3);
      expect(sites.length).toBeLessThanOrEqual(6);
    }
  });

  it("includes 2 draft sites at level 0", () => {
    const sites = generateSiteComposition(0, false, defaultContext());
    const drafts = sites.filter((s) => s.type === "Draft");
    expect(drafts.length).toBe(2);
  });

  it("requires clearing at least 4 non-battle sites before the first level-0 battle unlocks", () => {
    const sites = generateSiteComposition(0, true, defaultContext());
    const nonBattleSites = sites.filter((site) => site.type !== "Battle");

    expect(nonBattleSites.length).toBeGreaterThanOrEqual(4);
    expect(nonBattleSites[0].type).toBe("Draft");
    expect(nonBattleSites[1].type).toBe("Draft");
  });

  it("includes 1 draft site at level 2", () => {
    const sites = generateSiteComposition(2, false, defaultContext());
    const drafts = sites.filter((s) => s.type === "Draft");
    expect(drafts.length).toBe(1);
  });

  it("includes 0 draft sites at level 5", () => {
    const sites = generateSiteComposition(5, false, defaultContext());
    const drafts = sites.filter((s) => s.type === "Draft");
    expect(drafts.length).toBe(0);
  });

  it("always ends with a Battle site", () => {
    for (let level = 0; level <= 7; level++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(level, false, defaultContext());
      expect(sites[sites.length - 1].type).toBe("Battle");
    }
  });

  it("includes exactly one Purge site in the first dreamscape", () => {
    const sites = generateSiteComposition(0, true, defaultContext());
    expect(sites.filter((s) => s.type === "Purge").length).toBe(1);
  });

  it("includes exactly one Purge site at every level", () => {
    for (let level = 0; level <= 7; level++) {
      for (let i = 0; i < 20; i++) {
        resetAtlasGenerator();
        const sites = generateSiteComposition(
          level,
          false,
          defaultContext({ playerHasBanes: true }),
        );
        expect(sites.filter((s) => s.type === "Purge").length).toBe(1);
      }
    }
  });

  it("has at least 2 non-draft non-battle sites for hover preview", () => {
    for (let i = 0; i < 50; i++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(0, true, defaultContext());
      const previewable = sites.filter(
        (s) => s.type !== "Battle" && s.type !== "Draft",
      );
      expect(previewable.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("assigns unique IDs to all sites", () => {
    const sites = generateSiteComposition(0, true, defaultContext());
    const ids = sites.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never repeats a non-Draft site type within a dreamscape", () => {
    for (let level = 0; level <= 7; level++) {
      for (let i = 0; i < 50; i++) {
        resetAtlasGenerator();
        const sites = generateSiteComposition(
          level,
          false,
          defaultContext({ playerHasBanes: true }),
        );
        const counts: Partial<Record<SiteType, number>> = {};
        for (const site of sites) {
          counts[site.type] = (counts[site.type] ?? 0) + 1;
        }
        for (const [type, count] of Object.entries(counts)) {
          if (type === "Draft") {
            expect(count).toBeLessThanOrEqual(2);
          } else {
            expect(count).toBeLessThanOrEqual(1);
          }
        }
      }
    }
  });

  it("leaves Reward sites unresolved until the player enters them", () => {
    let foundReward = false;
    for (let i = 0; i < 100; i++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(0, false, defaultContext());
      const reward = sites.find((s) => s.type === "Reward");
      if (reward) {
        foundReward = true;
        expect(reward.data).toBeUndefined();
        break;
      }
    }
    expect(foundReward).toBe(true);
  });

  it("excludes Cleanse sites when player has no banes", () => {
    for (let i = 0; i < 100; i++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(
        0,
        false,
        defaultContext({ playerHasBanes: false }),
      );
      const cleanse = sites.filter((s) => s.type === "Cleanse");
      expect(cleanse.length).toBe(0);
    }
  });

  it("can include Cleanse sites when player has banes", () => {
    let foundCleanse = false;
    for (let i = 0; i < 200; i++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(
        0,
        false,
        defaultContext({ playerHasBanes: true }),
      );
      if (sites.some((s) => s.type === "Cleanse")) {
        foundCleanse = true;
        break;
      }
    }
    expect(foundCleanse).toBe(true);
  });

  it("first dreamscape always has exactly 2x Draft, 1x DreamsignDraft, 1x DreamJourney, 1x Purge, 1x Battle regardless of seed", () => {
    const seeds = [0, 0.123, 0.337, 0.5, 0.728, 0.999];
    for (const seed of seeds) {
      resetAtlasGenerator();
      let counter = seed;
      const randomSpy = vi.spyOn(Math, "random").mockImplementation(() => {
        counter = (counter * 9301 + 49297) % 233280;
        return counter / 233280;
      });
      try {
        const sites = generateSiteComposition(0, true, defaultContext());
        expect(sites).toHaveLength(6);
        const counts: Record<string, number> = {};
        for (const site of sites) {
          counts[site.type] = (counts[site.type] ?? 0) + 1;
        }
        expect(counts).toEqual({
          Draft: 2,
          DreamsignDraft: 1,
          DreamJourney: 1,
          Purge: 1,
          Battle: 1,
        });
        expect(sites[sites.length - 1].type).toBe("Battle");
      } finally {
        randomSpy.mockRestore();
      }
    }
  });

  it("first dreamscape composition is independent of completionLevel and banes", () => {
    for (const level of [0, 1, 2, 3, 4, 5, 7]) {
      for (const playerHasBanes of [false, true]) {
        resetAtlasGenerator();
        const sites = generateSiteComposition(
          level,
          true,
          defaultContext({ playerHasBanes }),
        );
        expect(sites.map((s) => s.type)).toEqual([
          "Draft",
          "Draft",
          "DreamsignDraft",
          "DreamJourney",
          "Purge",
          "Battle",
        ]);
      }
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
      { id: "s4", type: "DreamJourney", isEnhanced: false, isVisited: false },
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
      makeSite("s3", "DreamJourney"),
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
      makeSite("d", "DreamJourney"),
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

const ALL_SITE_TYPES: SiteType[] = [
  "Battle",
  "Draft",
  "Shop",
  "SpecialtyShop",
  "DreamsignOffering",
  "DreamsignDraft",
  "DreamJourney",
  "Purge",
  "Essence",
  "Transfiguration",
  "Duplication",
  "Reward",
  "Cleanse",
];

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
  it("returns a Boxicons class name (not an emoji) for every site type", () => {
    for (const t of ALL_SITE_TYPES) {
      const icon = siteTypeIcon(t);
      expect(icon).toMatch(/^bx bx-[a-z0-9-]+$/);
    }
  });

  it("assigns a distinct icon to every site type", () => {
    const icons = ALL_SITE_TYPES.map((t) => siteTypeIcon(t));
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe("additionalSiteTypesForLevel", () => {
  it("returns the available additional site types for a level", () => {
    const types = additionalSiteTypesForLevel(0, defaultContext());
    expect(types).toContain("Shop");
    expect(types).toContain("Essence");
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
