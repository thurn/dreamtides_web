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
import type { SitesData } from "../types/sites-data";
import { GLOSSARY_IDS } from "../data/glossary";
import { parseAtlasNodeId } from "../types/identifiers";
import { parseArtAssetKey } from "../types/identifiers";
import {
  testAffiliationId,
  testAtlasFillProfileId,
  testContentHash,
  testDreamscapeId,
  testFoldHash,
  testGuideId,
} from "../types/test-identities";

export const EARLY_ATLAS_FILL_PROFILE_ID =
  testAtlasFillProfileId("early");
export const LATE_ATLAS_FILL_PROFILE_ID = testAtlasFillProfileId("late");

/**
 * Shared synthetic Atlas fixtures plus explicit production-bundle loaders for
 * scripts and integration tests whose purpose is to exercise the live catalog.
 */

/** Synthetic starter catalog for tests that need a structurally valid Atlas. */
export const MINIMAL_DREAMSCAPES: DreamscapeContent[] = [
  {
    id: testDreamscapeId("fixture-starter-dreamscape"),
    name: "Fixture Starter Dreamscape",
    guideId: null,
    signatureSite: "Draft",
    affiliationId: null,
    isStarter: true,
    fixedSites: ["Draft", "Draft", "Battle"],
    dreamAvatarIds: [],
  },
];

/** Synthetic catalog with one unique owner for each routed signature site. */
export const SYNTHETIC_ATLAS_DREAMSCAPES: DreamscapeContent[] = [
  ...MINIMAL_DREAMSCAPES,
  ...(
    [
      "Shop",
      "Purge",
      "Transfiguration",
      "Duplication",
      "Augury",
      "DreamsignBazaar",
      "DreamsignRevelation",
      "RandomSite",
      "Gamble",
      "Exploration",
    ] as const
  ).map((signatureSite, index) => ({
    id: testDreamscapeId(`fixture-dreamscape-${String(index)}`),
    name: `Fixture Dreamscape ${String(index)}`,
    guideId: testGuideId(
      signatureSite === "RandomSite"
        ? "fixture-random-guide"
        : `fixture-guide-${String(index)}`,
    ),
    signatureSite,
    affiliationId: testAffiliationId(`fixture-affiliation-${String(index)}`),
    isStarter: false,
    dreamAvatarIds: [],
  })),
];

const SYNTHETIC_SITE_TYPES = Object.fromEntries(
  SITE_TYPES.map((type) => [
    type,
    {
      icon: `fixture-icon-${type}`,
      glossaryId: GLOSSARY_IDS.sites[type],
      presentation:
        type === "Battle"
          ? {
              kind: "battle",
              label: "Battle",
              finalBossLabel: "Final Boss",
              lockedGuidance: "Visit the other sites first.",
            }
          : type === "Draft"
            ? { kind: "draft", label: "Draft {pickCount}x" }
            : type === "Shop"
              ? {
                  kind: "shop",
                  title: "Dream Market",
                  restocked: "Restocked",
                  restockOffersAction: "Restock Offers",
                  restockAction: "Restock",
                  freePrice: "Free",
                }
              : type === "Purge"
                ? {
                    kind: "purge",
                    title: "Purge Cards",
                    instruction:
                      "Choose any number of cards to remove from your deck for an essence cost",
                    purgeAction: "Purge {count}",
                  }
                : type === "DreamsignBazaar"
                  ? {
                      kind: "dreamsign-bazaar",
                      title: "Dreamsign Bazaar",
                      restocked: "Restocked",
                      restockOffersAction: "Restock Offers",
                      restockAction: "Restock",
                      freePrice: "Free",
                      replacementTitle: "Choose a Dreamsign to Replace",
                    }
                  : type === "DreamsignRevelation"
                    ? {
                        kind: "dreamsign-revelation",
                        loading: "Revealing Dreamsigns...",
                        exhausted: "The Dreamsign pool is exhausted.",
                      }
                    : type === "RandomSite"
                      ? { kind: "random-site", title: "Choose a Site" }
                      : null,
      rules:
        type === "Duplication"
          ? {
              kind: "duplication",
              cardChoices: { standardLimit: 3, enhancedLimit: null },
            }
          : null,
    },
  ]),
) as SitesData["siteTypes"];

/** Stable site presentation and mechanics for production-independent tests. */
export const MINIMAL_SITES_DATA: SitesData = {
  schemaVersion: 1,
  contentHash: testContentHash("c"),
  foldHash: testFoldHash("d"),
  selection: {
    minDeckForPurge: 8,
    placeableTypes: ["Shop", "Purge", "Transfiguration", "Duplication"],
  },
  siteTypes: SYNTHETIC_SITE_TYPES,
  randomSite: {
    destinations: [
      "Shop",
      "DreamsignBazaar",
      "DreamsignRevelation",
      "Transfiguration",
      "Duplication",
      "Purge",
      "Augury",
      "Gamble",
      "Exploration",
    ],
    homeChoiceCount: 3,
    insufficientDestinations: "fail",
    guideId: testGuideId("fixture-random-guide"),
  },
  guideAssignments: Object.fromEntries(
    SYNTHETIC_ATLAS_DREAMSCAPES.flatMap((dreamscape) =>
      dreamscape.guideId === null
        ? []
        : [
            [
              dreamscape.signatureSite,
              {
                guideId: dreamscape.guideId,
                homeDreamscapeId: dreamscape.id,
              },
            ],
          ],
    ),
  ),
};

/** Deterministic, production-independent Atlas rules for unit tests. */
export function makeSyntheticAtlasData(): AtlasData {
  return {
    schemaVersion: 1,
    contentHash: testContentHash("a"),
    foldHash: testFoldHash("b"),
    layers: [
      {
        name: LayerName.One,
        role: "starter",
        nodeCount: { min: 1, max: 1 },
        siteCount: null,
        fillProfile: null,
        mandatorySites: {},
      },
      {
        name: LayerName.Two,
        role: "standard",
        nodeCount: { min: 2, max: 2 },
        siteCount: { min: 6, max: 6 },
        fillProfile: EARLY_ATLAS_FILL_PROFILE_ID,
        mandatorySites: { Draft: 2, Purge: 1, Augury: 1 },
      },
      {
        name: LayerName.Three,
        role: "standard",
        nodeCount: { min: 3, max: 3 },
        siteCount: { min: 4, max: 4 },
        fillProfile: EARLY_ATLAS_FILL_PROFILE_ID,
        mandatorySites: { Draft: 1, Purge: 1 },
      },
      {
        name: LayerName.Four,
        role: "standard",
        nodeCount: { min: 3, max: 4 },
        siteCount: { min: 3, max: 6 },
        fillProfile: EARLY_ATLAS_FILL_PROFILE_ID,
        mandatorySites: { Draft: 1 },
      },
      {
        name: LayerName.Five,
        role: "standard",
        nodeCount: { min: 3, max: 5 },
        siteCount: { min: 3, max: 6 },
        fillProfile: LATE_ATLAS_FILL_PROFILE_ID,
        mandatorySites: {},
      },
      {
        name: LayerName.Six,
        role: "standard",
        nodeCount: { min: 3, max: 5 },
        siteCount: { min: 3, max: 6 },
        fillProfile: LATE_ATLAS_FILL_PROFILE_ID,
        mandatorySites: {},
      },
      {
        name: LayerName.Seven,
        role: "boss",
        nodeCount: { min: 1, max: 1 },
        siteCount: { min: 3, max: 6 },
        fillProfile: LATE_ATLAS_FILL_PROFILE_ID,
        mandatorySites: {},
      },
    ],
    graph: {
      connectionAverage: 2,
      revealLookaheadLayers: 2,
      bonusReveal: {
        min: 0,
        max: 2,
        mode: 1,
        eligibleLayers: [LayerName.Five, LayerName.Six],
      },
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
      [EARLY_ATLAS_FILL_PROFILE_ID]: {
        id: EARLY_ATLAS_FILL_PROFILE_ID,
        signatureSiteWeight: 3,
        siteWeights: { Essence: 3, Transfiguration: 1, Duplication: 1 },
      },
      [LATE_ATLAS_FILL_PROFILE_ID]: {
        id: LATE_ATLAS_FILL_PROFILE_ID,
        signatureSiteWeight: 3,
        siteWeights: { Essence: 3, Transfiguration: 5, Duplication: 5 },
      },
    },
    knownDreamsign: {
      maxPerAtlas: 2,
      eligibleLayers: [
        LayerName.Three,
        LayerName.Four,
        LayerName.Five,
        LayerName.Six,
      ],
      placementProbability: 0.5,
      earlyRevealBias: 1,
    },
    boss: {
      dreamscapeId: testDreamscapeId("fixture-boss-dreamscape"),
      place: "Fixture Boss Place",
      name: "Fixture Boss",
      fallbackTitle: "Fixture Boss Title",
      fallbackIntroduction: "A synthetic boss introduction.",
      sceneArtId: testDreamscapeId("fixture-boss-scene"),
      iconArtId: testDreamscapeId("fixture-boss-icon"),
      figureArtId: testGuideId("fixture-boss-figure"),
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
      unrevealedFrameKey: parseArtAssetKey("fixture-frame.png"),
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
  return readPublicJson<{ guides: DreamGuideContent[] }>(
    "dream-guides-data.json",
  ).guides;
}

/** The live Dream Atlas generation tuning from the compiled bundle. */
export function loadTestAtlasData(): AtlasData {
  return readPublicJson<AtlasData>("atlas-data.json");
}

/** The live site registry and deterministic mechanics from the compiled bundle. */
export function loadTestSitesData(): SitesData {
  return readPublicJson<SitesData>("sites-data.json");
}

/** Structurally complete Atlas data for tests that do not vary Atlas rules. */
export const MINIMAL_ATLAS_DATA: AtlasData = makeSyntheticAtlasData();

/**
 * Builds a single revealed `available` atlas node with the given sites, suitable
 * for tests that drive site/battle flows without a full generated atlas.
 */
export function makeTestAtlasNode(
  idSeed: string,
  sites: SiteState[],
  overrides: Partial<DreamscapeNode> = {},
): DreamscapeNode {
  return {
    id: parseAtlasNodeId(idSeed),
    layer: LayerName.One,
    indexInLayer: 0,
    dreamscapeId: testDreamscapeId("test_dreamscape"),
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
export function makeTestAtlas(node: DreamscapeNode): DreamAtlas<true> {
  return {
    layers: [[node.id]],
    nodes: { [node.id]: node },
    startingNodeId: node.id,
    bossNodeId: node.id,
    currentNodeId: node.id,
    knownDreamsignCarrierIds: [],
  };
}
