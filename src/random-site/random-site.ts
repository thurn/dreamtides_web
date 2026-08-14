import {
  type RandomSiteDestinationType,
  type RandomSiteMetadata,
  type SiteState,
} from "../types/journey";
import { RANDOM_SITE_DESTINATION_TYPES } from "../types/site-type";
import type { GuideId } from "../types/identifiers";

const RANDOM_SITE_DESTINATION_SET: ReadonlySet<string> = new Set(
  RANDOM_SITE_DESTINATION_TYPES,
);

export function isRandomSiteDestinationType(
  value: unknown,
): value is RandomSiteDestinationType {
  return typeof value === "string" && RANDOM_SITE_DESTINATION_SET.has(value);
}

export function isRandomSiteMetadata(
  value: unknown,
): value is RandomSiteMetadata {
  if (typeof value !== "object" || value === null) return false;
  const metadata = value as Partial<RandomSiteMetadata>;
  if (metadata.mode !== "single" && metadata.mode !== "homeChoice")
    return false;
  if (
    !Array.isArray(metadata.candidateSiteTypes) ||
    metadata.candidateSiteTypes.some(
      (type) => !isRandomSiteDestinationType(type),
    ) ||
    new Set(metadata.candidateSiteTypes).size !==
      metadata.candidateSiteTypes.length
  ) {
    return false;
  }
  if (metadata.mode === "single") {
    return (
      isRandomSiteDestinationType(metadata.destinationSiteType) &&
      metadata.candidateSiteTypes.includes(metadata.destinationSiteType)
    );
  }
  return (
    metadata.candidateSiteTypes.length >= 2 &&
    (metadata.destinationSiteType === undefined ||
      isRandomSiteDestinationType(metadata.destinationSiteType))
  );
}

export function materializeRandomSite(
  site: SiteState,
  destinationSiteType: RandomSiteDestinationType,
  presentingGuideId?: GuideId,
): SiteState {
  const randomSite = site.randomSite ?? {
    mode: "single" as const,
    candidateSiteTypes: [destinationSiteType],
  };
  return {
    ...site,
    type: destinationSiteType,
    isEnhanced: true,
    randomSite: {
      ...randomSite,
      destinationSiteType,
      presentingGuideId:
        randomSite.presentingGuideId ?? presentingGuideId,
      materialized: true,
    },
  };
}
