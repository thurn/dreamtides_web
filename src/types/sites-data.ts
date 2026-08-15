import type { RandomSiteDestinationType, SiteType } from "./site-type";
import type { SourceTransport } from "../runtime/localization/runtime";
import type { DreamscapeId, GlossaryEntryId, GuideId } from "./identifiers";

export type SitePresentation =
  | {
      kind: "battle";
      label: SourceTransport;
      finalBossLabel: SourceTransport;
      lockedGuidance: SourceTransport;
    }
  | { kind: "draft"; label: SourceTransport }
  | {
      kind: "shop";
      title: SourceTransport;
      restocked: SourceTransport;
      restockOffersAction: SourceTransport;
      restockAction: SourceTransport;
      freePrice: SourceTransport;
    }
  | {
      kind: "purge";
      title: SourceTransport;
      instruction: SourceTransport;
      purgeAction: SourceTransport;
    }
  | {
      kind: "dreamsign-bazaar";
      title: SourceTransport;
      restocked: SourceTransport;
      restockOffersAction: SourceTransport;
      restockAction: SourceTransport;
      freePrice: SourceTransport;
      replacementTitle: SourceTransport;
    }
  | {
      kind: "dreamsign-revelation";
      loading: SourceTransport;
      exhausted: SourceTransport;
    }
  | { kind: "random-site"; title: SourceTransport };

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
  selection: {
    minDeckForPurge: number;
    placeableTypes: readonly SiteType[];
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
