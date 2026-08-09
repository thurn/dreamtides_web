import type { RandomSiteDestinationType, SiteType } from "./site-type";

export interface SiteTypeData {
  icon: string;
  glossaryId: string;
}

/** Validated browser data compiled from data/sites.toml. */
export interface SitesData {
  schemaVersion: 1;
  contentHash: string;
  foldHash: string;
  siteTypes: Readonly<Record<SiteType, SiteTypeData>>;
  fallbackSiteType: { icon: string; name: string; description: string };
  randomSite: {
    destinations: readonly RandomSiteDestinationType[];
    homeChoiceCount: number;
    awayChoiceCount: 1;
    insufficientDestinations: "fail";
    guideId: string;
  };
  cardChoices: Readonly<{
    duplication: {
      standardLimit: number;
      /** `null` means every eligible entry. */
      enhancedLimit: number | null;
    };
  }>;
  guideAssignments: Readonly<
    Partial<
      Record<
        SiteType,
        {
          guideId: string;
          homeDreamscapeId: string;
        }
      >
    >
  >;
}
