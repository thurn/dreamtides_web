import {
  advanceAtlas,
  generateInitialAtlas,
  type AtlasBuildContext,
  type AtlasGenerationOptions,
} from "./atlas-generator";
import {
  makeSyntheticAtlasData,
  MINIMAL_SITES_DATA,
  SYNTHETIC_ATLAS_DREAMSCAPES,
} from "../testing/atlas-fixtures";
import { gambleFixture } from "../testing/gamble-fixture";
import { makeRng } from "../draft/pool/rng";
import type { DreamAtlas, DreamscapeNode, SiteState, SiteType } from "../types/journey";
import type { AtlasNodeId } from "../types/identifiers";
import { testDreamsignId } from "../types/test-identities";

// Every generation call takes an explicit seeded stream, so each property
// sweep below is deterministic and needs no ambient-randomness mock.

export const DREAMSCAPES = SYNTHETIC_ATLAS_DREAMSCAPES;

export const ATLAS_DATA = makeSyntheticAtlasData();

export const DREAMSIGN_POOL = Array.from({ length: 8 }, (_, i) =>
  testDreamsignId(`test-dreamsign-${String(i)}`),
);

export const STARTER = DREAMSCAPES.find((d) => d.isStarter);

export const NON_STARTERS = DREAMSCAPES.filter((d) => !d.isStarter);

export const SEEDS = Array.from({ length: 24 }, (_, i) => i + 1);

export function buildContext(
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

export function options(seed: number): AtlasGenerationOptions {
  return { logEvents: false, rng: makeRng(seed) };
}

export function freshAtlas(seed = 1): DreamAtlas<true> {
  return generateInitialAtlas(0, {}, buildContext(), options(seed));
}

export function advance(
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

export function nodesIn(atlas: DreamAtlas<true>, state: DreamscapeNode["state"]) {
  return Object.values(atlas.nodes).filter((node) => node.state === state);
}

export function countOf(sites: readonly SiteState[], type: SiteType): number {
  return sites.filter((site) => site.type === type).length;
}
