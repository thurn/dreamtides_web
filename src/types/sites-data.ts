import type { RandomSiteDestinationType, SiteType } from "./site-type";
import type { SourceTransport } from "../runtime/localization/runtime";
import type { DreamscapeId, GlossaryEntryId, GuideId } from "./identifiers";

export type SitePresentation =
  | {
      kind: "battle";
      label: SourceTransport;
      finalBossLabel: SourceTransport;
    }
  | { kind: "draft"; label: SourceTransport }
  | {
      kind: "shop";
      title: SourceTransport;
    }
  | {
      kind: "purge";
      title: SourceTransport;
    }
  | {
      kind: "dreamsign-bazaar";
      title: SourceTransport;
    };

export interface DuplicationSiteRules {
  kind: "duplication";
  cardChoices: {
    standardLimit: number;
    /** `null` means every eligible entry. */
    enhancedLimit: number | null;
  };
}

export type SiteRules = DuplicationSiteRules;

export interface SiteTypeData {
  icon: string;
  glossaryId: GlossaryEntryId;
  presentation: SitePresentation | null;
  rules: SiteRules | null;
}

/** Validated browser data compiled from data/sites.toml. */
export interface SitesData {
  schemaVersion: 1;
  contentHash: ContentHash;
  foldHash: FoldHash;
  encounterSites: {
    minDeckForPurge: number;
    placeableSites: readonly SiteType[];
  };
  rewards: {
    essence: {
      standard: { min: number; max: number };
      enhanced: { min: number; max: number };
    };
    reward: { fallbackEssence: { min: number; max: number } };
    dreamsignRevelation: {
      standardOfferCount: number;
      enhancedOfferCount: number;
    };
  };
  purge: {
    marginalCosts: readonly number[];
    enhancedDiscountPercent: number;
  };
  siteTypes: Readonly<Record<SiteType, SiteTypeData>>;
  randomSite: {
    destinations: readonly RandomSiteDestinationType[];
    homeChoiceCount: number;
    insufficientDestinations: "fail";
    guideId: GuideId;
  };
  guideAssignments: Readonly<
    Partial<
      Record<
        SiteType,
        {
          guideId: GuideId;
          homeDreamscapeId: DreamscapeId;
        }
      >
    >
  >;
}
import type { ContentHash, FoldHash } from "./content-hash";
