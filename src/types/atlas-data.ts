import type { LayerName } from "./layer-name";
import type { SiteType } from "./site-type";
import type { SourceTransport } from "../runtime/localization/runtime";
import type {
  ArtAssetKey,
  AtlasFillProfileId,
  DreamscapeId,
  GuideId,
  IdentityRecord,
} from "./identifiers";

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
  fillProfile: AtlasFillProfileId | null;
  mandatorySites: Partial<Record<SiteType, number>>;
}

/** Base site weights resolved before run modifiers are applied. */
export interface AtlasFillProfile {
  id: AtlasFillProfileId;
  signatureSiteWeight: number;
  siteWeights: Partial<Record<SiteType, number>>;
}

/** Validated browser data compiled from data/atlas.toml. */
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
  fillProfiles: Readonly<IdentityRecord<AtlasFillProfileId, AtlasFillProfile>>;
  knownDreamsign: {
    maxPerAtlas: number;
    eligibleLayers: readonly LayerName[];
    placementProbability: number;
    earlyRevealBias: number;
  };
  boss: {
    dreamscapeId: DreamscapeId;
    place: string;
    name: string;
    fallbackTitle: string;
    fallbackIntroduction: string;
    sceneArtId: DreamscapeId;
    iconArtId: DreamscapeId;
    figureArtId: GuideId;
  };
  presentation: {
    unseenTitle: SourceTransport;
    unseenBody: SourceTransport;
    starterBody: SourceTransport;
    affiliationTitleTemplate: SourceTransport;
    affiliationBodyTemplate: SourceTransport;
  };
  assets: {
    unrevealedFrameSource: string;
    unrevealedFrameKey: ArtAssetKey;
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
