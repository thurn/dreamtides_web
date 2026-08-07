import type {
  MerchantArchetypeId,
  MerchantOfferFamily,
} from "../journey_v2/archetypes/types";
import type { RewardSelectionPolicyId } from "../reward-selection/types";

export type AuguryCopySlot =
  | "card"
  | "cards"
  | "count"
  | "count-word"
  | "category"
  | "site"
  | "subtype"
  | "transfiguration";

export interface AuguryCopyTemplates {
  title: string;
  summary: string;
  prompt: string;
  candidateTitle: string;
  candidateSummary: string;
  detailHeadline: string;
  detailSubtitle: string;
}

export interface AuguryArchetypeData {
  id: MerchantArchetypeId;
  enabled: boolean;
  family: MerchantOfferFamily;
  weight: number;
  selectionPolicyId: RewardSelectionPolicyId;
  quantities: Readonly<Record<string, number>>;
  dialogueLines: readonly string[];
  copy: AuguryCopyTemplates;
}

/** Validated browser data compiled from data/tabula/augury.toml. */
export interface AuguryData {
  schemaVersion: 1;
  contentHash: string;
  foldHash: string;
  encounter: Readonly<{
    offerCount: 2;
    distinctFamilies: true;
    allowDecline: boolean;
  }>;
  dialogue: Readonly<{
    fallbackLine: string;
    acceptReactions: readonly string[];
  }>;
  archetypes: readonly AuguryArchetypeData[];
}
