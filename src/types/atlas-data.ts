import type { LayerName } from "./layer-name";
import type { RandomSiteDestinationType, SiteType } from "./site-type";

export interface AtlasIntegerRange {
  min: number;
  max: number;
}

export type AtlasLayerRole = "starter" | "standard" | "boss";

/** Authored rules for one of the fixed seven Atlas layers. */
export interface AtlasLayerData {
  name: LayerName;
  role: AtlasLayerRole;
  nodeCount: AtlasIntegerRange;
  siteCount: AtlasIntegerRange | null;
  fillProfile: string | null;
  mandatorySites: Partial<Record<SiteType, number>>;
}

/** Base site weights resolved before run modifiers are applied. */
export interface AtlasFillProfile {
  id: string;
  signatureSiteWeight: number;
  siteWeights: Partial<Record<SiteType, number>>;
}

export interface AtlasSiteTypeData {
  icon: string;
  glossaryId: string;
}

/** Validated browser data compiled from data/tabula/atlas.toml. */
export interface AtlasData {
  schemaVersion: 1;
  contentHash: string;
  foldHash: string;
  layers: readonly AtlasLayerData[];
  graph: {
    connectionAverage: number;
    revealLookaheadLayers: number;
    bonusReveal: AtlasIntegerRange & {
      mode: number;
      eligibleLayers: readonly LayerName[];
    };
  };
  dreamscapeSelection: {
    baseWeight: number;
    repeatDiscourageStrength: number;
    excludeConnectedRepeats: boolean;
    excludeSameLayerRepeats: boolean;
    exhaustionFallback: "allow-repeats";
  };
  siteComposition: {
    uniqueNonDraftSites: boolean;
    knownDreamsignSite: SiteType;
    mandatoryCapacityBehavior: "omit-fill";
  };
  fillProfiles: Readonly<Record<string, AtlasFillProfile>>;
  knownDreamsign: {
    maxPerAtlas: number;
    eligibleLayers: readonly LayerName[];
    placementProbability: number;
    earlyRevealBias: number;
  };
  randomSite: {
    destinations: readonly RandomSiteDestinationType[];
    homeChoiceCount: number;
    awayChoiceCount: 1;
    guideLine: string;
    guideId: string;
  };
  siteTypes: Readonly<Record<SiteType, AtlasSiteTypeData>>;
  fallbackSiteType: {
    icon: string;
    name: string;
    description: string;
  };
  boss: {
    dreamscapeId: string;
    place: string;
    name: string;
    fallbackTitle: string;
    fallbackIntroduction: string;
    sceneArtId: string;
    iconArtId: string;
    figureArtId: string;
  };
  presentation: {
    unseenTitle: string;
    unseenBody: string;
    starterBody: string;
    affiliationTitleTemplate: string;
    affiliationBodyTemplate: string;
  };
  assets: {
    unrevealedFrameSource: string;
    unrevealedFrameKey: string;
    bossSceneSource: string;
    bossIconSource: string;
    bossFigureSource: string;
  };
}

/** One configured layer, failing loudly if compiled content is incomplete. */
export function atlasLayerData(
  atlasData: AtlasData,
  layer: LayerName,
): AtlasLayerData {
  const result = atlasData.layers.find((entry) => entry.name === layer);
  if (result === undefined) {
    throw new Error(`atlas.toml does not define layer ${layer}.`);
  }
  return result;
}
