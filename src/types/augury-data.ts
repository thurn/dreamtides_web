import type {
  MerchantArchetypeId,
  MerchantOfferFamily,
} from "../journey_v2/archetypes/types";
import type { RewardSelectionPolicyId } from "../reward-selection/types";

export interface AuguryArchetypeData {
  id: MerchantArchetypeId;
  enabled: boolean;
  family: MerchantOfferFamily;
  weight: number;
  selectionPolicyId: RewardSelectionPolicyId;
  quantities: Readonly<Record<string, number>>;
}

/** Validated browser data compiled from data/augury.toml. */
export interface AuguryData {
  schemaVersion: 1;
  contentHash: string;
  foldHash: string;
  encounter: Readonly<{
    offerCount: 2;
    distinctFamilies: true;
    allowDecline: boolean;
  }>;
  archetypes: readonly AuguryArchetypeData[];
}
