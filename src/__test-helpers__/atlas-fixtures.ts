import { readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AffiliationContent,
  DreamGuideContent,
  DreamscapeContent,
} from "../types/content";
import type {
  AtlasData,
  DreamAtlas,
  DreamscapeNode,
  SiteState,
} from "../types/journey";
import { LayerName } from "../types/layer-name";
import { SITE_TYPES } from "../types/site-type";

/**
 * Shared synthetic Atlas fixtures plus explicit production-bundle loaders for
 * scripts and integration tests whose purpose is to exercise the live catalog.
 */

/** Synthetic starter catalog for tests that need a structurally valid Atlas. */
export const MINIMAL_DREAMSCAPES: DreamscapeContent[] = [{
  id: "fixture-starter-dreamscape",
  name: "Fixture Starter Dreamscape",
  aesthetic: "A synthetic test region.",
  guideId: null,
  signatureSite: "Draft",
  affiliationId: null,
  isStarter: true,
  fixedSites: ["Draft", "Draft", "Battle"],
  dreamAvatarIds: [],
}];

/** Synthetic catalog with one unique owner for each routed signature site. */
export const SYNTHETIC_ATLAS_DREAMSCAPES: DreamscapeContent[] = [
  ...MINIMAL_DREAMSCAPES,
  ...([
    "Shop",
    "Purge",
    "Essence",
    "Transfiguration",
    "Duplication",
    "Augury",
    "DreamsignMarket",
    "DreamsignRevelation",
    "RandomSite",
    "Gamble",
  ] as const).map((signatureSite, index) => ({
    id: `fixture-dreamscape-${String(index)}`,
    name: `Fixture Dreamscape ${String(index)}`,
    aesthetic: "A synthetic test region.",
    guideId: signatureSite === "RandomSite"
      ? "fixture-random-guide"
      : `fixture-guide-${String(index)}`,
    signatureSite,
    affiliationId: `fixture-affiliation-${String(index)}`,
    isStarter: false,
    dreamAvatarIds: [],
  })),
];

const SYNTHETIC_SITE_TYPES = Object.fromEntries(
  SITE_TYPES.map((type) => [type, {
    icon: `fixture-icon-${type}`,
    glossaryId: {
      Battle: "site-battle",
      Draft: "site-draft",
      Shop: "site-shop",
      Purge: "site-purge",
      Essence: "site-essence",
      Transfiguration: "site-transfiguration",
      Duplication: "site-duplication",
      Reward: "site-reward",
      Augury: "site-augury",
      DreamsignMarket: "site-dreamsign-market",
      DreamsignRevelation: "site-dreamsign-revelation",
      RandomSite: "site-random-site",
      Gamble: "site-gamble",
      Exploration: "site-exploration",
    }[type],
  }]),
) as AtlasData["siteTypes"];

/** Deterministic, production-independent Atlas rules for unit tests. */
export function makeSyntheticAtlasData(): AtlasData {
  return {
    schemaVersion: 1,
    contentHash: "a".repeat(64),
    foldHash: "b".repeat(64),
    layers: [
      { name: LayerName.One, role: "starter", nodeCount: { min: 1, max: 1 }, siteCount: null, fillProfile: null, mandatorySites: {} },
      { name: LayerName.Two, role: "standard", nodeCount: { min: 2, max: 2 }, siteCount: { min: 6, max: 6 }, fillProfile: "early", mandatorySites: { Draft: 2, Purge: 1, Augury: 1 } },
      { name: LayerName.Three, role: "standard", nodeCount: { min: 3, max: 3 }, siteCount: { min: 4, max: 4 }, fillProfile: "early", mandatorySites: { Draft: 1, Purge: 1 } },
      { name: LayerName.Four, role: "standard", nodeCount: { min: 3, max: 4 }, siteCount: { min: 3, max: 6 }, fillProfile: "early", mandatorySites: { Draft: 1 } },
      { name: LayerName.Five, role: "standard", nodeCount: { min: 3, max: 5 }, siteCount: { min: 3, max: 6 }, fillProfile: "late", mandatorySites: {} },
      { name: LayerName.Six, role: "standard", nodeCount: { min: 3, max: 5 }, siteCount: { min: 3, max: 6 }, fillProfile: "late", mandatorySites: {} },
      { name: LayerName.Seven, role: "boss", nodeCount: { min: 1, max: 1 }, siteCount: { min: 3, max: 6 }, fillProfile: "late", mandatorySites: {} },
    ],
    graph: {
      connectionAverage: 2,
      revealLookaheadLayers: 2,
      bonusReveal: { min: 0, max: 2, mode: 1, eligibleLayers: [LayerName.Five, LayerName.Six] },
    },
    dreamscapeSelection: {
      baseWeight: 1,
      repeatDiscourageStrength: 2,
      excludeConnectedRepeats: true,
      excludeSameLayerRepeats: true,
      exhaustionFallback: "allow-repeats",
    },
    siteComposition: {
      uniqueNonDraftSites: true,
      knownDreamsignSite: "Reward",
      mandatoryCapacityBehavior: "omit-fill",
    },
    fillProfiles: {
      early: { id: "early", signatureSiteWeight: 3, siteWeights: { Essence: 3, Transfiguration: 1, Duplication: 1 } },
      late: { id: "late", signatureSiteWeight: 3, siteWeights: { Essence: 3, Transfiguration: 5, Duplication: 5 } },
    },
    knownDreamsign: {
      maxPerAtlas: 2,
      eligibleLayers: [LayerName.Three, LayerName.Four, LayerName.Five, LayerName.Six],
      placementProbability: 0.5,
      earlyRevealBias: 1,
    },
    randomSite: {
      destinations: ["Shop", "DreamsignMarket", "DreamsignRevelation", "Transfiguration", "Duplication", "Purge", "Augury", "Gamble", "Exploration"],
      homeChoiceCount: 3,
      awayChoiceCount: 1,
      guideLine: "Fixture guide line.",
      guideId: "fixture-random-guide",
    },
    siteTypes: SYNTHETIC_SITE_TYPES,
    fallbackSiteType: {
      icon: "fixture-fallback-icon",
      name: "Fixture Site",
      description: "A synthetic fallback site.",
    },
    boss: {
      dreamscapeId: "fixture-boss-dreamscape",
      place: "Fixture Boss Place",
      name: "Fixture Boss",
      fallbackTitle: "Fixture Boss Title",
      fallbackIntroduction: "A synthetic boss introduction.",
      sceneArtId: "fixture-boss-scene",
      iconArtId: "fixture-boss-icon",
      figureArtId: "fixture-boss-figure",
    },
    presentation: {
      unseenTitle: "Fixture unseen title",
      unseenBody: "Fixture unseen body",
      starterBody: "Fixture starter body",
      affiliationTitleTemplate: "Fixture affiliation {name}",
      affiliationBodyTemplate: "Fixture theme {card-theme}",
    },
    assets: {
      unrevealedFrameSource: "fixture-frame.png",
      unrevealedFrameKey: "fixture-frame.png",
      bossSceneSource: "fixture-boss-scene.png",
      bossIconSource: "fixture-boss-icon.png",
      bossFigureSource: "fixture-boss-figure.png",
    },
  };
}

const PUBLIC_DIR = join(import.meta.dirname, "..", "..", "public");

function readPublicJson<T>(filename: string): T {
  return JSON.parse(readFileSync(join(PUBLIC_DIR, filename), "utf8")) as T;
}

/** The live dreamscape definitions from the compiled bundle. */
export function loadTestDreamscapes(): DreamscapeContent[] {
  return readPublicJson<DreamscapeContent[]>("dreamscapes-data.json");
}

/** The live affiliation definitions from the compiled bundle. */
export function loadTestAffiliations(): AffiliationContent[] {
  return readPublicJson<AffiliationContent[]>("affiliations-data.json");
}

/** The live Dream Guide definitions from the compiled bundle. */
export function loadTestDreamGuides(): DreamGuideContent[] {
  return readPublicJson<DreamGuideContent[]>("dream-guides-data.json");
}

/** The live Dream Atlas generation tuning from the compiled bundle. */
export function loadTestAtlasData(): AtlasData {
  return readPublicJson<AtlasData>("atlas-data.json");
}

/** Structurally complete Atlas data for tests that do not vary Atlas rules. */
export const MINIMAL_ATLAS_DATA: AtlasData = makeSyntheticAtlasData();

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
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: "test_dreamscape",
    biomeName: "Test Dreamscape",
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
 * journey state to reference a current dreamscape and its sites.
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
