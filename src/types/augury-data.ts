import type {
  MerchantArchetypeId,
  MerchantOfferFamily,
} from "../journey_v2/archetypes/types";
import type { RewardSelectionPolicyId } from "../reward-selection/types";
import type { SourceTransport } from "../runtime/localization/runtime";

export interface AuguryArchetypeData {
  id: MerchantArchetypeId;
  /** Internal label used by debugging and authoring tools. */
  name: string;
  /** Player-facing copy resolved from the concrete offer model. */
  presentation: Readonly<{
    headline: AuguryPresentationText;
    subtitle: AuguryPresentationText;
    /** Optional full-bleed card art for symbolic non-card compositions. */
    backgroundArt?: Readonly<{ source: "card"; imageNumber: number }>;
  }>;
  enabled: boolean;
  family: MerchantOfferFamily;
  weight: number;
  selectionPolicyId: RewardSelectionPolicyId;
  quantities: Readonly<Record<string, number>>;
}

export type AuguryPresentationText =
  | Readonly<{ kind: "text"; text: SourceTransport }>
  | Readonly<{ kind: "count"; one: SourceTransport; other: SourceTransport }>
  | Readonly<{
      kind: "category";
      character: SourceTransport;
      event: SourceTransport;
      cheap: SourceTransport;
      midCost: SourceTransport;
      expensive: SourceTransport;
      fast: SourceTransport;
      subtype: SourceTransport;
      package: SourceTransport;
    }>;

/** Validated browser data compiled from data/augury.toml. */
export interface AuguryData {
  schemaVersion: 1;
  contentHash: ContentHash;
  foldHash: FoldHash;
  selection: Readonly<{
    subtypeMinPoolCards: number;
    costBands: Readonly<{
      cheapMaximum: number;
      midMinimum: number;
      midMaximum: number;
      bigMinimum: number;
      cheapCharacterMaximum: number;
    }>;
  }>;
  encounter: Readonly<{
    allowDecline: boolean;
  }>;
  archetypes: readonly AuguryArchetypeData[];
}
import type { ContentHash, FoldHash } from "./content-hash";
