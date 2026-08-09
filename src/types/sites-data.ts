import type { RandomSiteDestinationType, SiteType } from "./site-type";

export type SitePresentation =
  | {
      kind: "battle";
      label: string;
      finalBossLabel: string;
      lockedGuidance: string;
    }
  | { kind: "draft"; label: string }
  | {
      kind: "shop";
      title: string;
      restocked: string;
      restockOffersAction: string;
      restockAction: string;
      freePrice: string;
    }
  | { kind: "purge"; title: string; instruction: string; purgeAction: string }
  | {
      kind: "dreamsign-market";
      title: string;
      restocked: string;
      restockOffersAction: string;
      restockAction: string;
      freePrice: string;
      replacementTitle: string;
    }
  | { kind: "dreamsign-revelation"; loading: string; exhausted: string }
  | { kind: "random-site"; title: string };

export interface SiteTypeData {
  icon: string;
  glossaryId: string;
  presentation: SitePresentation | null;
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
