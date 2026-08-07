import type {
  GambleGameId,
  GravokGateId,
  StandardPlayingCardRank,
  StandardPlayingCardSuit,
  TidemarkLadderClimbAttemptNumber,
  StarwayStairsTierNumber,
} from "./gamble";
import type { RandomSiteDestinationType, SiteType } from "./site-type";

export interface SiteTypeData {
  icon: string;
  glossaryId: string;
}

export type FourSuitRepriseOutcome =
  "transfiguration" | "essence" | "duplication" | "purge";

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
  cardChoices: Readonly<
    Record<
      "transfiguration" | "duplication",
      {
        standardLimit: number;
        /** `null` means every eligible entry. */
        enhancedLimit: number | null;
      }
    >
  >;
  gamble: {
    selection: {
      fallbackGame: GambleGameId;
      games: readonly { id: GambleGameId; weight: number }[];
    };
    threeGate: {
      maxRetries: number;
      gates: readonly {
        id: GravokGateId;
        name: string;
        threshold: StandardPlayingCardRank;
        oddsNumerator: number;
        oddsDenominator: number;
        awardsDreamsign: boolean;
      }[];
    };
    ladderClimb: {
      strongPoolLimit: number;
      attempts: readonly {
        attempt: TidemarkLadderClimbAttemptNumber;
        threshold: StandardPlayingCardRank;
        oddsNumerator: number;
        oddsDenominator: number;
      }[];
    };
    starwayStairs: {
      maxRetries: number;
      tiers: readonly {
        tier: StarwayStairsTierNumber;
        highestBustRank: StandardPlayingCardRank;
        bustOddsNumerator: number;
        oddsDenominator: number;
      }[];
    };
    fourSuitReprise: {
      maxRounds: number;
      oddsNumerator: number;
      oddsDenominator: number;
      outcomes: readonly {
        suit: StandardPlayingCardSuit;
        outcome: FourSuitRepriseOutcome;
        label: string;
      }[];
    };
  };
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
