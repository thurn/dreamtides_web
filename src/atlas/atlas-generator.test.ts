import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  additionalSiteTypesForLevel,
  generateSiteComposition,
  generateInitialAtlas,
  generateNewNodes,
  regenerateAtlasForProgress,
  assignBiome,
  previewSiteTypes,
  revealedAtlasSite,
  rewardPreviewLabel,
  resetAtlasGenerator,
  siteTypeDescription,
  siteTypeIcon,
  type SiteGenerationContext,
} from "./atlas-generator";
import type { DreamAtlas, DreamscapeNode, SiteState, SiteType } from "../types/quest";

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

  it("uses active site appearance boosts as additive percentage weight increases", () => {
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.87)
      .mockReturnValueOnce(0);

    const sites = generateSiteComposition(0, false, defaultContext({
      dreamscapeModifiers: [
        {
          kind: "boost_site_appearance",
          siteType: "SpecialtyShop",
          percent: 50,
          dreamscapesRemaining: 2,
          source: "test:boost-one",
        },
        {
          kind: "boost_site_appearance",
          siteType: "SpecialtyShop",
          percent: 50,
          dreamscapesRemaining: 1,
          source: "test:boost-two",
        },
      ],
    }));

    randomSpy.mockRestore();
    expect(sites.some((site) => site.type === "SpecialtyShop")).toBe(true);
  });

  it("does not apply a single lower boost as if it were already fully combined", () => {
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.87)
      .mockReturnValueOnce(0);

    const sites = generateSiteComposition(0, false, defaultContext({
      dreamscapeModifiers: [
        {
          kind: "boost_site_appearance",
          siteType: "SpecialtyShop",
          percent: 50,
          dreamscapesRemaining: 2,
          source: "test:boost-one",
        },
      ],
    }));

    randomSpy.mockRestore();
    expect(sites.some((site) => site.type === "SpecialtyShop")).toBe(false);
  });

  it("excludes Shop and SpecialtyShop while a shop-removal modifier is active", () => {
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0);

    const sites = generateSiteComposition(5, false, defaultContext({
      dreamscapeModifiers: [
        {
          kind: "remove_shop_sites",
          dreamscapesRemaining: 1,
          source: "test:remove-shop",
        },
      ],
    }));

    randomSpy.mockRestore();
    expect(sites.some((site) => site.type === "Shop")).toBe(false);
    expect(sites.some((site) => site.type === "SpecialtyShop")).toBe(false);
  });

  it("excludes DreamsignOffering and DreamsignDraft while a dreamsign-removal modifier is active", () => {
    for (let i = 0; i < 50; i++) {
      resetAtlasGenerator();
      const sites = generateSiteComposition(
        0,
        false,
        defaultContext({
          dreamscapeModifiers: [
            {
              kind: "remove_dreamsign_sites",
              dreamscapesRemaining: 1,
              source: "test:remove-dreamsign",
            },
          ],
        }),
      );

      expect(sites.some((site) => site.type === "DreamsignOffering")).toBe(false);
      expect(sites.some((site) => site.type === "DreamsignDraft")).toBe(false);
    }
  });

  it("keeps DreamsignOffering and DreamsignDraft eligible when the dreamsign-removal modifier has expired", () => {
    const types = additionalSiteTypesForLevel(
      0,
      defaultContext({
        dreamscapeModifiers: [
          {
            kind: "remove_dreamsign_sites",
            dreamscapesRemaining: 0,
            source: "test:expired-remove-dreamsign",
          },
        ],
      }),
    );

    expect(types).toContain("DreamsignOffering");
    expect(types).toContain("DreamsignDraft");
  });

  it("keeps Shop eligible when the shop-removal modifier has expired", () => {
    const randomSpy = vi
      .spyOn(Math, "random")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0);

    const sites = generateSiteComposition(0, false, defaultContext({
      dreamscapeModifiers: [
        {
          kind: "remove_shop_sites",
          dreamscapesRemaining: 0,
          source: "test:expired-remove-shop",
        },
      ],
    }));

    randomSpy.mockRestore();
    expect(sites.some((site) => site.type === "Shop")).toBe(true);
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

describe("generateInitialAtlas", () => {
  /** Direct neighbours of `nodeId` via the atlas edge list. */
  function neighborIds(atlas: DreamAtlas, nodeId: string): string[] {
    const result = new Set<string>();
    for (const [a, b] of atlas.edges) {
      if (a === nodeId) result.add(b);
      if (b === nodeId) result.add(a);
    }
    return [...result];
  }

  it("creates a two-deep binary tree: start plus 2 children plus 4 grandchildren", () => {
    for (let i = 0; i < 20; i++) {
      const atlas = generateInitialAtlas(0, defaultContext());
      const nodeCount = Object.keys(atlas.nodes).length;
      // 1 starting + 2 children + (2 grandchildren per child) = 7.
      expect(nodeCount).toBe(7);
    }
  });

  it("places the starting dreamscape at (0,0)", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const starting = atlas.nodes[atlas.startingNodeId];
    expect(starting).toBeDefined();
    expect(starting.position.x).toBe(0);
    expect(starting.position.y).toBe(0);
  });

  it("marks only the starting dreamscape available; every other node begins unavailable", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    for (const [id, node] of Object.entries(atlas.nodes)) {
      if (id === atlas.startingNodeId) {
        expect(node.status).toBe("available");
      } else {
        expect(node.status).toBe("unavailable");
      }
    }
  });

  it("connects the starting dreamscape to exactly 2 children, each leading to 2 more", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const children = neighborIds(atlas, atlas.startingNodeId);
    expect(children).toHaveLength(2);

    for (const childId of children) {
      // A child's neighbours are the start plus its own 2 grandchildren.
      const childNeighbors = neighborIds(atlas, childId).filter(
        (id) => id !== atlas.startingNodeId,
      );
      expect(childNeighbors).toHaveLength(2);
      // Grandchildren are not directly connected to the start.
      for (const grandId of childNeighbors) {
        expect(neighborIds(atlas, grandId)).not.toContain(
          atlas.startingNodeId,
        );
      }
    }
  });

  it("gives the two starting choices distinct revealed atlas icons", () => {
    for (let i = 0; i < 50; i++) {
      const atlas = generateInitialAtlas(0, defaultContext(), {
        logEvents: false,
      });
      const children = neighborIds(atlas, atlas.startingNodeId).map(
        (id) => atlas.nodes[id],
      );
      expect(children).toHaveLength(2);
      const icons = children.map((child) => {
        const revealed = revealedAtlasSite(child);
        return revealed === null ? null : siteTypeIcon(revealed.type);
      });
      expect(icons[0]).not.toBeNull();
      expect(icons[0]).not.toBe(icons[1]);
    }
  });

  it("never places two dreamscapes on top of each other", () => {
    for (let i = 0; i < 30; i++) {
      const atlas = generateInitialAtlas(0, defaultContext(), {
        logEvents: false,
      });
      const positions = Object.values(atlas.nodes).map((n) => n.position);
      for (let a = 0; a < positions.length; a++) {
        for (let b = a + 1; b < positions.length; b++) {
          const dx = positions[a].x - positions[b].x;
          const dy = positions[a].y - positions[b].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          // Nodes render at radius ~28-34; a comfortable floor well above any
          // visual overlap.
          expect(dist).toBeGreaterThan(80);
        }
      }
    }
  });

  it("does not generate any node labelled 'Nexus'", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    for (const node of Object.values(atlas.nodes)) {
      expect(node.biomeName).not.toBe("Nexus");
      expect(node.id).not.toBe("nexus");
    }
  });

  it("positions the starting dreamscape's direct children at the base radius", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const children = neighborIds(atlas, atlas.startingNodeId);
    for (const childId of children) {
      const node = atlas.nodes[childId];
      const dist = Math.sqrt(
        node.position.x * node.position.x +
          node.position.y * node.position.y,
      );
      // Children sit near the base radius; the free-slot search may nudge them
      // outward to avoid overlap, so allow generous slack above 200.
      expect(dist).toBeGreaterThanOrEqual(180);
      expect(dist).toBeLessThan(420);
    }
  });

  it("never enhances a site in the first dreamscape", () => {
    for (let i = 0; i < 200; i++) {
      const atlas = generateInitialAtlas(0, defaultContext(), {
        logEvents: false,
      });
      const starting = atlas.nodes[atlas.startingNodeId];
      expect(starting.enhancedSiteType).toBeNull();
      expect(starting.sites.some((site) => site.isEnhanced)).toBe(false);
    }
  });

  it("assigns the first dreamscape's biome randomly, not a fixed one", () => {
    const biomeNames = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const atlas = generateInitialAtlas(0, defaultContext(), {
        logEvents: false,
      });
      biomeNames.add(atlas.nodes[atlas.startingNodeId].biomeName);
    }
    // Over many runs the starting biome varies rather than always being the
    // same one. Asserting "more than one distinct biome" stays valid no matter
    // how the biome list changes.
    expect(biomeNames.size).toBeGreaterThan(1);
  });

});

describe("generateNewNodes", () => {
  function allSiteIds(atlas: DreamAtlas): string[] {
    return Object.values(atlas.nodes).flatMap((node) =>
      node.sites.map((site) => site.id),
    );
  }

  it("adds no new nodes when completing the start, since its children already exist", () => {
    for (let i = 0; i < 40; i++) {
      const atlas = generateInitialAtlas(0, defaultContext());
      const updated = generateNewNodes(
        atlas,
        atlas.startingNodeId,
        0,
        defaultContext(),
      );
      // The two starting choices already carry their grandchildren, so the
      // two-deep look-ahead is satisfied without generating anything new.
      const newNodeCount =
        Object.keys(updated.nodes).length - Object.keys(atlas.nodes).length;
      expect(newNodeCount).toBe(0);
    }
  });

  it("makes both starting choices available when the start is completed", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const updated = generateNewNodes(
      atlas,
      atlas.startingNodeId,
      0,
      defaultContext(),
    );
    const availableNodes = Object.values(updated.nodes).filter(
      (node) => node.status === "available",
    );
    // Both dreamscapes adjacent to the completed start become available; the
    // grandchildren stay unavailable.
    expect(availableNodes).toHaveLength(2);
    for (const node of availableNodes) {
      expect(node.id).not.toBe(atlas.startingNodeId);
    }
  });

  it("tops up a newly-available dreamscape to 2 forward branches", () => {
    // Complete the start so the two choices become available, then complete one
    // of those choices: its grandchildren become available and must each sprout
    // their own 2 onward branches.
    const atlas = generateInitialAtlas(0, defaultContext());
    const afterStart = generateNewNodes(
      atlas,
      atlas.startingNodeId,
      1,
      defaultContext(),
    );
    const choice = Object.values(afterStart.nodes).find(
      (node) => node.status === "available",
    );
    expect(choice).toBeDefined();
    if (!choice) return;

    const afterChoice = generateNewNodes(
      afterStart,
      choice.id,
      2,
      defaultContext(),
    );

    const newlyAvailable = Object.values(afterChoice.nodes).filter(
      (node) =>
        node.status === "available" &&
        afterChoice.edges.some(
          ([a, b]) =>
            (a === node.id && b === choice.id) ||
            (b === node.id && a === choice.id),
        ),
    );
    expect(newlyAvailable.length).toBeGreaterThanOrEqual(1);
    for (const node of newlyAvailable) {
      const forwardBranches = afterChoice.edges.filter(([a, b]) => {
        const other = a === node.id ? b : b === node.id ? a : null;
        return other !== null && afterChoice.nodes[other].status !== "completed";
      });
      expect(forwardBranches.length).toBe(2);
    }
  });

  it("marks the completed node as completed", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const updated = generateNewNodes(
      atlas,
      atlas.startingNodeId,
      0,
      defaultContext(),
    );
    expect(updated.nodes[atlas.startingNodeId].status).toBe("completed");
  });

  it("derives expansion ids from the persisted atlas after generator state resets", () => {
    // Completing the start only promotes its pre-built children; completing one
    // of those children is what grows the atlas, so drive the expansion that
    // actually allocates new ids.
    const atlas = generateInitialAtlas(0, defaultContext());
    const afterStart = generateNewNodes(
      atlas,
      atlas.startingNodeId,
      1,
      defaultContext(),
    );
    const choice = Object.values(afterStart.nodes).find(
      (node) => node.status === "available",
    );
    expect(choice).toBeDefined();
    if (!choice) return;

    const originalNodeIds = Object.keys(afterStart.nodes);
    const originalSiteIds = allSiteIds(afterStart);

    resetAtlasGenerator();

    const updated = generateNewNodes(
      afterStart,
      choice.id,
      2,
      defaultContext(),
    );
    const updatedNodeIds = Object.keys(updated.nodes);
    const updatedSiteIds = allSiteIds(updated);

    expect(updatedNodeIds.length).toBeGreaterThan(originalNodeIds.length);
    expect(new Set(updatedNodeIds).size).toBe(updatedNodeIds.length);
    expect(new Set(updatedSiteIds).size).toBe(updatedSiteIds.length);
    expect(updated.nodes[choice.id].status).toBe("completed");
    for (const nodeId of originalNodeIds) {
      expect(updated.nodes[nodeId]).toBeDefined();
    }
    for (const siteId of originalSiteIds) {
      expect(updatedSiteIds).toContain(siteId);
    }
  });

  it("preserves the starting node id on the updated atlas", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const updated = generateNewNodes(
      atlas,
      atlas.startingNodeId,
      0,
      defaultContext(),
    );
    expect(updated.startingNodeId).toBe(atlas.startingNodeId);
  });

  it("sets correct availability on new nodes", () => {
    const atlas = generateInitialAtlas(0, defaultContext());
    const updated = generateNewNodes(
      atlas,
      atlas.startingNodeId,
      0,
      defaultContext(),
    );

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

describe("revealedAtlasSite", () => {
  function makeSite(id: string, type: SiteType, isEnhanced = false): SiteState {
    return { id, type, isEnhanced, isVisited: false };
  }

  function makeNode(
    id: string,
    sites: SiteState[],
    enhancedSiteType: SiteType | null,
  ): DreamscapeNode {
    return {
      id,
      biomeName: "Test",
      biomeColor: "#000",
      sites,
      position: { x: 0, y: 0 },
      status: "available",
      enhancedSiteType,
    };
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
    // Different ids hash to different indices, so we should observe more
    // than one distinct revealed type across 50 ids drawn from 4 candidates.
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
      // Boxicons classes start with the `bx` base class and a `bx-` glyph.
      expect(icon).toMatch(/^bx bx-[a-z0-9-]+$/);
    }
  });

  it("assigns a distinct icon to every site type", () => {
    const icons = ALL_SITE_TYPES.map((t) => siteTypeIcon(t));
    expect(new Set(icons).size).toBe(icons.length);
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

describe("regenerateAtlasForProgress", () => {
  function completedCount(atlas: DreamAtlas): number {
    return Object.values(atlas.nodes).filter(
      (node) => node.status === "completed",
    ).length;
  }

  it("replays one completion per progress step so the depth matches", () => {
    // Each replayed completion marks exactly one node completed and never
    // un-completes one, so the completed-node count equals the requested
    // progress. This is a structural invariant of the replay loop, independent
    // of biome/site TOML data.
    for (let progress = 0; progress <= 4; progress++) {
      const atlas = regenerateAtlasForProgress(progress, defaultContext());
      expect(completedCount(atlas)).toBe(progress);
    }
  });

  it("rebuilds a fresh initial-tree atlas at zero progress", () => {
    const atlas = regenerateAtlasForProgress(0, defaultContext());
    // The fresh initial atlas is the two-deep tree: start + 2 children + 4
    // grandchildren.
    expect(Object.keys(atlas.nodes)).toHaveLength(7);
    expect(completedCount(atlas)).toBe(0);
  });

  it("always leaves at least one available node to continue from", () => {
    for (let progress = 1; progress <= 4; progress++) {
      const atlas = regenerateAtlasForProgress(progress, defaultContext());
      const available = Object.values(atlas.nodes).filter(
        (node) => node.status === "available",
      );
      expect(available.length).toBeGreaterThanOrEqual(1);
    }
  });
});
