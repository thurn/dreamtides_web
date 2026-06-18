import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { DreamscapeContent } from "../types/content";
import type {
  AtlasConfig,
  DreamAtlas,
  DreamscapeNode,
  SiteState,
} from "../types/quest";

/**
 * Shared atlas test fixtures. These read the live compiled bundles
 * (`public/{dreamscapes,atlas-config}-data.json`) so tests stay in sync with the
 * production TOML rather than hardcoding dreamscape names, counts, or tuning that
 * authoring edits would invalidate. Run `npm run setup-assets` first in a fresh
 * worktree to emit the bundles.
 */

/**
 * A self-contained atlas config for tests that only need a structurally valid
 * `QuestContent` and never invoke the generator. Reads no files. Generation
 * invariant tests use {@link loadTestAtlasConfig} against the live bundle.
 */
export const MINIMAL_ATLAS_CONFIG: AtlasConfig = {
  layerSpecs: [
    { min: 1, max: 1 },
    { min: 2, max: 2 },
    { min: 3, max: 3 },
    { min: 3, max: 4 },
    { min: 3, max: 5 },
    { min: 3, max: 5 },
    { min: 1, max: 1 },
  ],
  connectionAverage: 2,
  bonusReveal: { min: 0, max: 2, mode: 1 },
  repeatDiscourageStrength: 2,
  knownDreamsign: {
    maxPerAtlas: 2,
    eligibleLayers: [3, 4, 5, 6],
    placementProbability: 0.5,
    earlyRevealBias: 1,
  },
};

/** Empty dreamscape list for tests that only need a structurally valid context. */
export const MINIMAL_DREAMSCAPES: DreamscapeContent[] = [];

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "public");

function readPublicJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, filename), "utf8")) as T;
}

/** The live dreamscape definitions from the compiled bundle. */
export function loadTestDreamscapes(): DreamscapeContent[] {
  return readPublicJson<DreamscapeContent[]>("dreamscapes-data.json");
}

/** The live Dream Atlas generation tuning from the compiled bundle. */
export function loadTestAtlasConfig(): AtlasConfig {
  return readPublicJson<AtlasConfig>("atlas-config-data.json");
}

/**
 * Builds a single revealed `available` atlas node with the given sites, suitable
 * for tests that drive site/battle flows without a full generated atlas.
 */
export function makeTestAtlasNode(
  id: string,
  sites: SiteState[],
  overrides: Partial<DreamscapeNode> = {},
): DreamscapeNode {
  return {
    id,
    layer: 0,
    indexInLayer: 0,
    dreamscapeId: "test_dreamscape",
    biomeName: "Test Dreamscape",
    biomeColor: "#112233",
    sites,
    position: { x: 0, y: 0 },
    state: "available",
    enhancedSiteType: null,
    forwardIds: [],
    backwardIds: [],
    knownDreamsignId: null,
    ...overrides,
  };
}

/**
 * Builds a minimal single-node atlas around `node` for tests that only need the
 * quest state to reference a current dreamscape and its sites.
 */
export function makeTestAtlas(node: DreamscapeNode): DreamAtlas {
  return {
    layers: [[node.id]],
    nodes: { [node.id]: node },
    startingNodeId: node.id,
    bossNodeId: node.id,
    currentNodeId: node.id,
    knownDreamsignCarrierIds: [],
  };
}
