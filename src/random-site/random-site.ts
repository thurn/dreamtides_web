import type {
  RandomSiteDestinationType,
  RandomSiteMetadata,
  SiteState,
  SiteType,
} from "../types/journey";

export const MADDOX_GUIDE_ID = "maddox";

export const RANDOM_SITE_DESTINATIONS: readonly RandomSiteDestinationType[] = [
  "Shop",
  "DreamsignMarket",
  "DreamsignRevelation",
  "Transfiguration",
  "Duplication",
  "Purge",
  "Augury",
  "Gamble",
  "Exploration",
];

const RANDOM_SITE_DESTINATION_SET = new Set<SiteType>(RANDOM_SITE_DESTINATIONS);

export function isRandomSiteDestinationType(
  value: unknown,
): value is RandomSiteDestinationType {
  return typeof value === "string" && RANDOM_SITE_DESTINATION_SET.has(value as SiteType);
}

export function isRandomSiteMetadata(value: unknown): value is RandomSiteMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Partial<RandomSiteMetadata>;
  if (metadata.mode !== "single" && metadata.mode !== "homeChoice") return false;
  if (
    !Array.isArray(metadata.candidateSiteTypes) ||
    metadata.candidateSiteTypes.some((type) => !isRandomSiteDestinationType(type)) ||
    new Set(metadata.candidateSiteTypes).size !== metadata.candidateSiteTypes.length
  ) {
    return false;
  }
  if (metadata.mode === "single") {
    return (
      isRandomSiteDestinationType(metadata.destinationSiteType) &&
      metadata.candidateSiteTypes.includes(metadata.destinationSiteType)
    );
  }
  return metadata.candidateSiteTypes.length >= 3 &&
    (metadata.destinationSiteType === undefined ||
      isRandomSiteDestinationType(metadata.destinationSiteType));
}

export function materializeRandomSite(
  site: SiteState,
  destinationSiteType: RandomSiteDestinationType,
): SiteState {
  return {
    ...site,
    type: destinationSiteType,
    isEnhanced: true,
    guideIdOverride: MADDOX_GUIDE_ID,
    randomSite: {
      ...(site.randomSite ?? {
        mode: "single",
        candidateSiteTypes: [destinationSiteType],
      }),
      destinationSiteType,
      materialized: true,
    },
  };
}
