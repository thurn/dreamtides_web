import type { TransfigurationType } from "./journey";

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

export type TransfigurationEligibility =
  | { readonly kind: "positiveEnergyCost" }
  | { readonly kind: "distinctAuthoredAmplifiedText" }
  | { readonly kind: "cardType"; readonly cardType: "Character" | "Event" }
  | { readonly kind: "eventWithoutFast" }
  | { readonly kind: "namedTrigger" }
  | { readonly kind: "activatedEnergyCost" }
  | { readonly kind: "atLeastEligibleForms"; readonly count: number };

export type TransfigurationOperation =
  | {
      readonly kind: "halveEnergyCost";
      readonly rounding: "Down";
      readonly minimum: number;
    }
  | { readonly kind: "useAuthoredAmplifiedText" }
  | { readonly kind: "doubleSpark"; readonly zeroResult: number }
  | {
      readonly kind: "appendRulesClause";
      readonly clause: "DrawCard" | "Reclaim";
    }
  | { readonly kind: "setFast" }
  | { readonly kind: "widenNamedTrigger" }
  | {
      readonly kind: "reduceActivatedEnergyCost";
      readonly amount: number;
      readonly minimum: number;
    }
  | {
      readonly kind: "applyEligibleForms";
      readonly formOrder: readonly TransfigurationType[];
    };

export type TransfigurationPricing =
  | { readonly kind: "free" }
  | ({ readonly kind: "band" } & TransfigurationCostBand)
  | { readonly kind: "statDelta" };

export type TransfigurationBenefit =
  | { readonly kind: "flat"; readonly value: number }
  | { readonly kind: "ratio"; readonly divisor: number };

export interface TransfigurationFormDefinition {
  readonly id: TransfigurationType;
  readonly glossaryUuid: string;
  readonly name: string;
  readonly effectDisclosure: string;
  readonly selectedCardDescription: string;
  readonly accessibilityDescription: string;
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
  readonly merchantAllowed: boolean;
  readonly eligibility: TransfigurationEligibility;
  readonly operation: TransfigurationOperation;
  readonly pricing: TransfigurationPricing;
  readonly benefit: TransfigurationBenefit;
}

export interface TransfigurationData {
  readonly schemaVersion: 1;
  readonly contentHash: string;
  readonly foldHash: string;
  readonly site: {
    readonly rulesVersion: string;
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
