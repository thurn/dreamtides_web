import type {
  MerchantArchetypeId,
  MerchantOfferFamily,
} from "../journey_v2/archetypes/types";
import type { RewardSelectionPolicyId } from "../reward-selection/types";

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
  | Readonly<{ kind: "text"; text: string }>
  | Readonly<{ kind: "count"; one: string; other: string }>
  | Readonly<{
      kind: "category";
      character: string;
      event: string;
      cheap: string;
      midCost: string;
      expensive: string;
      fast: string;
      subtype: string;
      package: string;
    }>;

/** Validated browser data compiled from data/augury.toml. */
export interface AuguryData {
  schemaVersion: 1;
  contentHash: string;
  foldHash: string;
  encounter: Readonly<{
    allowDecline: boolean;
  }>;
  archetypes: readonly AuguryArchetypeData[];
}
