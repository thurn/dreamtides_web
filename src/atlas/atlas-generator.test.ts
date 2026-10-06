import { beforeEach, describe, expect, it } from "vitest";
import {
  additionalSiteTypesForLevel,
  advanceAtlas,
  edgesCross,
  generateInitialAtlas,
  generateSiteComposition,
  regenerateAtlasForProgress,
  resetAtlasGenerator,
  revealedAtlasSite,
  type AtlasBuildContext,
  type AtlasGenerationOptions,
} from "./atlas-generator";
import {
  EARLY_ATLAS_FILL_PROFILE_ID,
  LATE_ATLAS_FILL_PROFILE_ID,
  makeSyntheticAtlasData,
  makeTestAtlasNode,
  MINIMAL_SITES_DATA,
  SYNTHETIC_ATLAS_DREAMSCAPES,
} from "../testing/atlas-fixtures";
import { gambleFixture } from "../testing/gamble-fixture";
import { makeRng } from "../draft/pool/rng";
import type {
  DreamAtlas,
  DreamscapeNode,
  SiteState,
  SiteType,
} from "../types/journey";
import { LayerName, layerAtOrdinal, layerOrdinal } from "../types/layer-name";
import type { AtlasFillProfileId, AtlasNodeId } from "../types/identifiers";
import { parseAtlasNodeId, parseSiteId } from "../types/identifiers";
import {
  testDreamsignId,
  testJourneyMutationSource,
} from "../types/test-identities";

// Every generation call takes an explicit seeded stream, so each property
// sweep below is deterministic and needs no ambient-randomness mock.

const DREAMSCAPES = SYNTHETIC_ATLAS_DREAMSCAPES;
const ATLAS_DATA = makeSyntheticAtlasData();
const DREAMSIGN_POOL = Array.from({ length: 8 }, (_, i) =>
  testDreamsignId(`test-dreamsign-${String(i)}`),
);
const STARTER = DREAMSCAPES.find((d) => d.isStarter);
const NON_STARTERS = DREAMSCAPES.filter((d) => !d.isStarter);
const NON_STARTER_LAYERS = Array.from(
  { length: ATLAS_DATA.layers.length - 1 },
  (_, i) => i + 1,
);
const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

function buildContext(
  overrides?: Partial<AtlasBuildContext>,
): AtlasBuildContext {
  return {
    dreamscapes: DREAMSCAPES,
    atlasData: ATLAS_DATA,
    sitesData: MINIMAL_SITES_DATA,
    gambleData: gambleFixture(),
    dreamsignPoolIds: DREAMSIGN_POOL,
    apollyonIncarnations: [],
    ...overrides,
  };
}

function options(seed: number): AtlasGenerationOptions {
  return { logEvents: false, rng: makeRng(seed) };
}

function freshAtlas(seed = 1): DreamAtlas<true> {
  return generateInitialAtlas(0, {}, buildContext(), options(seed));
}

function advance(
  atlas: DreamAtlas<true>,
  nodeId: AtlasNodeId,
  completionLevel: number,
  seed = 1,
): DreamAtlas<true> {
  return advanceAtlas(
    atlas,
    nodeId,
    completionLevel,
    {},
    buildContext(),
    options(seed),
  );
}

function nodesIn(atlas: DreamAtlas<true>, state: DreamscapeNode["state"]) {
  return Object.values(atlas.nodes).filter((node) => node.state === state);
}

function countOf(sites: readonly SiteState[], type: SiteType): number {
  return sites.filter((site) => site.type === type).length;
}

beforeEach(() => {
  resetAtlasGenerator();
});

describe("generateSiteComposition", () => {
  function compose(
    dreamscape: (typeof NON_STARTERS)[number],
    layer: number,
    hasKnownDreamsign: boolean,
    seed: number,
  ): SiteState[] {
    resetAtlasGenerator();
    return generateSiteComposition({
      layer: layerAtOrdinal(layer) ?? LayerName.One,
      dreamscape,
      dreamscapes: DREAMSCAPES,
      atlasData: ATLAS_DATA,
      sitesData: MINIMAL_SITES_DATA,
      context: {},
      hasKnownDreamsign,
      rng: makeRng(seed),
    }).sites;
  }

  it("meets every per-layer composition rule for every non-starter dreamscape", () => {
    const eligibleForDreamsign = new Set(
      ATLAS_DATA.knownDreamsign.eligibleLayers.map(layerOrdinal),
    );
    for (const dreamscape of NON_STARTERS) {
      for (const layer of NON_STARTER_LAYERS) {
        const mandatory = ATLAS_DATA.layers[layer].mandatorySites;
        for (const seed of SEEDS.slice(0, 8)) {
          for (const hasKnownDreamsign of eligibleForDreamsign.has(layer)
            ? [false, true]
            : [false]) {
            const sites = compose(dreamscape, layer, hasKnownDreamsign, seed);
            expect(sites.length).toBeGreaterThanOrEqual(3);
            expect(sites.length).toBeLessThanOrEqual(6);
            expect(countOf(sites, "Battle")).toBe(1);
            expect(sites[sites.length - 1].type).toBe("Battle");
            expect(countOf(sites, "Draft")).toBe(mandatory.Draft ?? 0);
            if ((mandatory.Purge ?? 0) > 0) {
              expect(countOf(sites, "Purge")).toBe(1);
            }
            if (layer === 1) {
              expect(countOf(sites, "Augury")).toBe(1);
            }
            expect(countOf(sites, "Reward")).toBe(hasKnownDreamsign ? 1 : 0);
            for (const type of new Set(sites.map((site) => site.type))) {
              expect(countOf(sites, type)).toBeLessThanOrEqual(
                type === "Draft" ? 2 : 1,
              );
            }
            const signature = sites.filter(
              (site) => site.type === dreamscape.signatureSite,
            );
            expect(signature).toHaveLength(1);
            expect(signature[0].isEnhanced).toBe(true);
            // A Random Site filling another guide's dreamscape is the only
            // other enhanced site.
            const hiddenRandom = sites.some(
              (site) => site.type === "RandomSite" && site !== signature[0],
            );
            expect(sites.filter((site) => site.isEnhanced)).toHaveLength(
              hiddenRandom ? 2 : 1,
            );
            const ids = sites.map((site) => site.id);
            expect(new Set(ids).size).toBe(ids.length);
          }
        }
      }
    }
  });

  it("builds the home Random Site from distinct hidden candidates, honoring hard removals", () => {
    const home = NON_STARTERS.find((d) => d.signatureSite === "RandomSite");
    if (home === undefined) throw new Error("expected a Random Site home");
    for (const removeShops of [false, true]) {
      const { sites } = generateSiteComposition({
        layer: LayerName.Five,
        dreamscape: home,
        dreamscapes: DREAMSCAPES,
        atlasData: ATLAS_DATA,
        sitesData: MINIMAL_SITES_DATA,
        context: removeShops
          ? {
              dreamscapeModifiers: [
                {
                  kind: "remove_shop_sites",
                  dreamscapesRemaining: 1,
                  source: testJourneyMutationSource("fixture"),
                },
              ],
            }
          : {},
        rng: makeRng(7),
      });
      const randomSite = sites.find((site) => site.type === "RandomSite");
      expect(randomSite?.isEnhanced).toBe(true);
      expect(randomSite?.randomSite?.mode).toBe("homeChoice");
      const candidates = randomSite?.randomSite?.candidateSiteTypes ?? [];
      expect(candidates.length).toBeGreaterThanOrEqual(3);
      expect(new Set(candidates).size).toBe(candidates.length);
      const visible = new Set(sites.map((site) => site.type));
      expect(candidates.filter((type) => visible.has(type))).toEqual([]);
      if (removeShops) {
        expect(candidates).not.toContain("Shop");
      }
    }
  });

  it("uses the selected fill profile's exact weights", () => {
    function bossFill(fillProfile: AtlasFillProfileId): SiteType {
      const atlasData = makeSyntheticAtlasData();
      atlasData.fillProfiles = {
        [EARLY_ATLAS_FILL_PROFILE_ID]: {
          id: EARLY_ATLAS_FILL_PROFILE_ID,
          signatureSiteWeight: 0,
          siteWeights: { Transfiguration: 1, Duplication: 10 },
        },
        [LATE_ATLAS_FILL_PROFILE_ID]: {
          id: LATE_ATLAS_FILL_PROFILE_ID,
          signatureSiteWeight: 0,
          siteWeights: { Transfiguration: 10, Duplication: 1 },
        },
      };
      atlasData.layers = atlasData.layers.map((layer) =>
        layer.role === "boss"
          ? { ...layer, fillProfile, siteCount: { min: 2, max: 2 } }
          : layer,
      );
      const atlas = generateInitialAtlas(0, {}, buildContext({ atlasData }), {
        logEvents: false,
        rng: () => 0.6,
      });
      return atlas.nodes[atlas.bossNodeId].sites[0].type;
    }

    expect(bossFill(EARLY_ATLAS_FILL_PROFILE_ID)).toBe("Duplication");
    expect(bossFill(LATE_ATLAS_FILL_PROFILE_ID)).toBe("Transfiguration");
  });

  it("returns the starter's fixed site list with no enhancement", () => {
    if (STARTER === undefined) throw new Error("expected a starter");
    for (const seed of SEEDS.slice(0, 4)) {
      const { sites, enhancedSiteType } = generateSiteComposition({
        layer: LayerName.One,
        dreamscape: STARTER,
        dreamscapes: DREAMSCAPES,
        atlasData: ATLAS_DATA,
        sitesData: MINIMAL_SITES_DATA,
        context: {},
        hasKnownDreamsign: false,
        rng: makeRng(seed),
      });
      expect(sites.map((site) => site.type)).toEqual(STARTER.fixedSites);
      expect(sites.some((site) => site.isEnhanced)).toBe(false);
      expect(enhancedSiteType).toBeNull();
    }
  });
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

describe("edgesCross", () => {
  it.each([
    [0, 1, 1, 0, true],
    [0, 0, 1, 1, false],
    [0, 0, 0, 2, false],
  ])("(%i->%i) x (%i->%i) crosses: %s", (a, b, c, d, expected) => {
    expect(edgesCross(a, b, c, d)).toBe(expected);
  });
});

describe("revealedAtlasSite", () => {
  const site = (
    label: string,
    type: SiteType,
    isEnhanced = false,
  ): SiteState => ({
    id: parseSiteId(label),
    type,
    isEnhanced,
    isVisited: false,
  });
  const node = (
    label: string,
    sites: SiteState[],
    enhancedSiteType: SiteType | null = null,
  ): DreamscapeNode => makeTestAtlasNode(label, sites, { enhancedSiteType });

  it("reveals the enhanced site when the dreamscape has one", () => {
    const revealed = revealedAtlasSite(
      node(
        "dreamscape-1",
        [site("a", "Shop"), site("b", "Essence", true), site("c", "Battle")],
        "Essence",
      ),
    );

    expect(revealed?.id).toBe("b");
  });

  it.each([
    { name: "an enhanced Battle", enhanced: "Battle" as const, battleEnhanced: true },
    { name: "an enhanced type with no marked site", enhanced: "Reward" as const, battleEnhanced: false },
    { name: "no enhanced site", enhanced: null, battleEnhanced: false },
  ])(
    "never reveals Battle or Draft for $name, and is stable per node id",
    ({ enhanced, battleEnhanced }) => {
      for (let i = 0; i < 20; i++) {
        const sites = [
          site("a", "Draft"),
          site("b", "Draft"),
          site("c", "Shop"),
          site("d", "Essence"),
          site("e", "Battle", battleEnhanced),
        ];
        const revealed = revealedAtlasSite(
          node(`dreamscape-${String(i)}`, sites, enhanced),
        );
        expect(["Shop", "Essence"]).toContain(revealed?.type);
        const clone = node(`dreamscape-${String(i)}`, [...sites], enhanced);
        expect(revealedAtlasSite(clone)?.id).toBe(revealed?.id);
      }
    },
  );

  it("returns null for nodes with no sites", () => {
    expect(revealedAtlasSite(node("empty-node", []))).toBeNull();
  });
});

describe("additionalSiteTypesForLevel", () => {
  it("offers Essence and other guides' signature sites, never the dreamscape's own", () => {
    const [dreamscape] = NON_STARTERS;
    const types = additionalSiteTypesForLevel(
      LayerName.Four,
      dreamscape.signatureSite,
      DREAMSCAPES,
      {},
      ATLAS_DATA,
    );
    const other = NON_STARTERS.find(
      (d) => d.signatureSite !== dreamscape.signatureSite,
    );

    expect(types).toContain("Essence");
    expect(types).not.toContain(dreamscape.signatureSite);
    expect(types).toContain(other?.signatureSite);
  });
});
