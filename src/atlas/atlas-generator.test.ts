import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generateSiteComposition,
  generateInitialAtlas,
  generateNewNodes,
  assignBiome,
  previewSiteTypes,
  rewardPreviewLabel,
  resetAtlasGenerator,
  type SiteGenerationContext,
} from "./atlas-generator";
import type { DreamscapeNode, SiteState } from "../types/quest";

function defaultContext(
  overrides?: Partial<SiteGenerationContext>,
): SiteGenerationContext {
  return {
    playerHasBanes: false,
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

  it("has at least 2 non-draft non-battle sites for hover preview", () => {
    for (let i = 0; i < 50; i++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(0, true, defaultContext());
      const previewable = sites.filter(
        (s) =>
          s.type !== "Battle" &&
          s.type !== "Draft",
      );
      expect(previewable.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("assigns unique IDs to all sites", () => {
    const sites = generateSiteComposition(0, true, defaultContext());
    const ids = sites.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
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

  it("first dreamscape always has exactly 2x Draft, 1x DreamsignDraft, 1x DreamJourney, 1x Battle regardless of seed", () => {
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
        expect(sites).toHaveLength(5);
        const counts: Record<string, number> = {};
        for (const site of sites) {
          counts[site.type] = (counts[site.type] ?? 0) + 1;
        }
        expect(counts).toEqual({
          Draft: 2,
          DreamsignDraft: 1,
          DreamJourney: 1,
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
          "Battle",
        ]);
      }
    }
  });
});

describe("generateInitialAtlas", () => {
  it("creates 2 dreamscape nodes plus the nexus", () => {
    for (let i = 0; i < 20; i++) {
      const atlas = generateInitialAtlas(0, defaultContext());
      const nodeCount = Object.keys(atlas.nodes).length;
      expect(nodeCount).toBe(3);
    }
  });

  it("places the nexus at (0,0) with status completed", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const nexus = atlas.nodes[atlas.nexusId];
    expect(nexus).toBeDefined();
    expect(nexus.position.x).toBe(0);
    expect(nexus.position.y).toBe(0);
    expect(nexus.status).toBe("completed");
  });

  it("marks all non-nexus nodes as available", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    for (const [id, node] of Object.entries(atlas.nodes)) {
      if (id !== atlas.nexusId) {
        expect(node.status).toBe("available");
      }
    }
  });

  it("creates edges from nexus to each dreamscape node", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const nonNexusIds = Object.keys(atlas.nodes).filter(
      (id) => id !== atlas.nexusId,
    );
    for (const nodeId of nonNexusIds) {
      const hasEdge = atlas.edges.some(
        ([a, b]) =>
          (a === atlas.nexusId && b === nodeId) ||
          (b === atlas.nexusId && a === nodeId),
      );
      expect(hasEdge).toBe(true);
    }
  });

  it("positions dreamscape nodes at the base radius distance from nexus", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    for (const [id, node] of Object.entries(atlas.nodes)) {
      if (id === atlas.nexusId) continue;
      const dist = Math.sqrt(
        node.position.x * node.position.x +
          node.position.y * node.position.y,
      );
      expect(dist).toBeCloseTo(200, 0);
    }
  });

});

describe("generateNewNodes", () => {
  it("generates 1 new node after the first completed dreamscape", () => {
    for (let i = 0; i < 20; i++) {
      const atlas = generateInitialAtlas(0, defaultContext());
      const completedId = Object.keys(atlas.nodes).find(
        (id) => id !== atlas.nexusId,
      )!;
      const updated = generateNewNodes(atlas, completedId, 0, defaultContext());
      const newNodeCount =
        Object.keys(updated.nodes).length - Object.keys(atlas.nodes).length;
      expect(newNodeCount).toBe(1);
    }
  });

  it("leaves exactly 2 available choices after the first dreamscape", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const completedId = Object.keys(atlas.nodes).find(
      (id) => id !== atlas.nexusId,
    )!;
    const updated = generateNewNodes(atlas, completedId, 0, defaultContext());
    const availableNodes = Object.values(updated.nodes).filter(
      (node) => node.id !== atlas.nexusId && node.status === "available",
    );

    expect(availableNodes).toHaveLength(2);
  });

  it("marks the completed node as completed", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const completedId = Object.keys(atlas.nodes).find(
      (id) => id !== atlas.nexusId,
    )!;
    const updated = generateNewNodes(atlas, completedId, 0, defaultContext());
    expect(updated.nodes[completedId].status).toBe("completed");
  });

  it("sets correct availability on new nodes", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const completedId = Object.keys(atlas.nodes).find(
      (id) => id !== atlas.nexusId,
    )!;
    const updated = generateNewNodes(atlas, completedId, 0, defaultContext());

    const completedIds = new Set(
      Object.values(updated.nodes)
        .filter((n) => n.status === "completed")
        .map((n) => n.id),
    );

    for (const [nodeId, node] of Object.entries(updated.nodes)) {
      if (node.status === "completed") continue;
      const connectedToCompleted = updated.edges.some(
        ([a, b]) =>
          (a === nodeId && completedIds.has(b)) ||
          (b === nodeId && completedIds.has(a)),
      );
      if (connectedToCompleted) {
        expect(node.status).toBe("available");
      } else {
        expect(node.status).toBe("unavailable");
      }
    }
  });

  it("returns atlas unchanged for an invalid node ID", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const result = generateNewNodes(atlas, "nonexistent", 0, defaultContext());
    expect(result).toBe(atlas);
  });
});

describe("assignBiome", () => {
  it("returns a biome with name, color, and enhancedSiteType", () => {
    const biome = assignBiome();
    expect(biome.name).toBeDefined();
    expect(typeof biome.name).toBe("string");
    expect(biome.color).toBeDefined();
    expect(biome.enhancedSiteType).toBeDefined();
  });
});

describe("previewSiteTypes", () => {
  it("excludes Battle and Draft", () => {
    const node: DreamscapeNode = {
      id: "test",
      biomeName: "Test",
      biomeColor: "#000",
      sites: [
        { id: "s1", type: "Draft", isEnhanced: false, isVisited: false },
        { id: "s2", type: "Battle", isEnhanced: false, isVisited: false },
        { id: "s4", type: "Shop", isEnhanced: false, isVisited: false },
        { id: "s5", type: "Essence", isEnhanced: false, isVisited: false },
      ],
      position: { x: 0, y: 0 },
      status: "available",
      enhancedSiteType: null,
    };
    const preview = previewSiteTypes(node);
    expect(preview).toEqual(["Shop", "Essence"]);
  });

  it("returns at most 3 site types", () => {
    const node: DreamscapeNode = {
      id: "test",
      biomeName: "Test",
      biomeColor: "#000",
      sites: [
        { id: "s1", type: "Shop", isEnhanced: false, isVisited: false },
        { id: "s2", type: "Essence", isEnhanced: false, isVisited: false },
        { id: "s3", type: "Purge", isEnhanced: false, isVisited: false },
        { id: "s4", type: "DreamJourney", isEnhanced: false, isVisited: false },
      ],
      position: { x: 0, y: 0 },
      status: "available",
      enhancedSiteType: null,
    };
    const preview = previewSiteTypes(node);
    expect(preview.length).toBeLessThanOrEqual(3);
  });
});

describe("rewardPreviewLabel", () => {
  it("returns null for reward sites so the caller does not duplicate 'Reward' (FIND-01-7)", () => {
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
