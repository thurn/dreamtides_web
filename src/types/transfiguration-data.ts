import type { TransfigurationType } from "./journey";
import type { GlossaryEntryId } from "./identifiers";

export interface TransfigurationCostBand {
  readonly base: number;
  readonly jitter: number;
  readonly floor: number;
}

export interface TransfigurationStatDeltaBand {
  readonly minimumDelta: number;
  readonly maximumDelta?: number;
  readonly band: TransfigurationCostBand;
}

export type TransfigurationPricing =
  | { readonly kind: "free" }
  | ({ readonly kind: "band" } & TransfigurationCostBand)
  | { readonly kind: "statDelta" };

export type TransfigurationRewardScore =
  | { readonly kind: "flat"; readonly value: number }
  | { readonly kind: "statDelta"; readonly divisor: number };

export interface TransfigurationFormDefinition {
  readonly id: TransfigurationType;
  readonly glossaryUuid: GlossaryEntryId;
  readonly name: string;
  readonly description: string;
  readonly glyph:
    | "transfigurationEmpowered"
    | "transfigurationAmplified"
    | "transfigurationKindled"
    | "transfigurationInspired"
    | "transfigurationEnduring"
    | "transfigurationHastened"
    | "transfigurationResonant"
    | "transfigurationAttuned"
    | "transfigurationPerfected";
  readonly accentColor: `#${string}`;
  readonly tintColor: `#${string}`;
  readonly pricing: TransfigurationPricing;
  readonly rewardScore: TransfigurationRewardScore;
}

export interface TransfigurationData {
  readonly schemaVersion: 1;
  readonly contentHash: string;
  readonly foldHash: string;
  readonly site: {
    readonly standardChoiceLimit: number | null;
    readonly enhancedChoiceLimit: number | null;
    readonly pricing: {
      readonly minimumCost: number;
      readonly maximumCost: number;
      readonly step: number;
      readonly statDeltaBands: readonly TransfigurationStatDeltaBand[];
    };
  };
  readonly forms: readonly TransfigurationFormDefinition[];
}
