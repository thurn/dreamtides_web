export const REWARD_SELECTION_POLICY_IDS: readonly [
  "fixed", "uniform", "card-fit", "card-fit-quality", "card-bundle",
  "purge-misfit", "duplicate-value", "deck-entry-centrality",
  "transfiguration-value", "dreamsign-match", "site-uniform",
];
export const REWARD_MECHANIC_IDS: readonly [
  "gain-card", "catalog-card-chooser", "pack-chooser", "transfigured-card-chooser",
  "gain-dreamsign", "transfigure-deck-entry", "transfigure-deck-for-essence",
  "purge-deck-entry",
  "purge-for-essence", "purge-and-duplicate", "replace-deck-entry",
  "duplicate-deck-entry", "change-entry-subtype", "change-entry-card-type",
  "change-deck-subtype",
  "gain-nightmare-and-card", "next-site-transfiguration",
  "essence-mutation",
  "gain-essence-by-deck-predicate", "increase-deck-spark",
  "purge-dreamsign-for-essence", "make-deck-fast",
  "reduce-deck-cost-and-add-nightmares", "next-battle-modifier",
  "choose-avatar", "purge-duplicates-and-grant-reclaim", "add-site",
  "shop-purchase-modifier",
];
export const REWARD_CARD_PREDICATES: readonly [
  "any", "character", "event", "cheap-character", "spirit-animal",
  "survivor", "warrior", "legendary",
];
export function isRewardSelectionPolicyId(value: unknown): value is typeof REWARD_SELECTION_POLICY_IDS[number];
export function isRewardMechanicId(value: unknown): value is typeof REWARD_MECHANIC_IDS[number];
export function isRewardCardPredicate(value: unknown): value is typeof REWARD_CARD_PREDICATES[number];
export type RewardMechanicId = typeof REWARD_MECHANIC_IDS[number];
export type RewardSelectionPolicyId = typeof REWARD_SELECTION_POLICY_IDS[number];
export function mechanicSupportsPolicy(
  mechanicId: RewardMechanicId,
  policyId: RewardSelectionPolicyId,
): boolean;
