/** Selection policies a reward mechanic may name in the reward-selection data. */
export const REWARD_SELECTION_POLICY_IDS = [
  "fixed", "uniform", "card-fit", "card-fit-quality", "card-bundle",
  "purge-misfit", "duplicate-value", "deck-entry-centrality",
  "transfiguration-value", "dreamsign-match", "site-uniform",
] as const;

/** Reward mechanics the reward-selection data may configure. */
export const REWARD_MECHANIC_IDS = [
  "gain-card", "catalog-card-chooser", "pack-chooser",
  "transfigured-card-chooser", "gain-dreamsign", "transfigure-deck-entry",
  "transfigure-deck-for-essence",
  "purge-deck-entry", "purge-for-essence", "purge-and-duplicate",
  "replace-deck-entry", "duplicate-deck-entry", "change-entry-subtype",
  "change-entry-card-type",
  "change-deck-subtype", "gain-nightmare-and-card",
  "next-site-transfiguration", "gain-essence-by-deck-predicate",
  "essence-mutation",
  "increase-deck-spark", "purge-dreamsign-for-essence", "make-deck-fast",
  "reduce-deck-cost-and-add-nightmares", "next-battle-modifier",
  "choose-avatar", "purge-duplicates-and-grant-reclaim", "add-site",
  "shop-purchase-modifier",
] as const;

/** Card filters a reward mechanic may apply to its candidates. */
export const REWARD_CARD_PREDICATES = [
  "any", "character", "event", "cheap-character", "spirit-animal",
  "survivor", "warrior", "legendary",
] as const;

export type RewardMechanicId = (typeof REWARD_MECHANIC_IDS)[number];
export type RewardSelectionPolicyId = (typeof REWARD_SELECTION_POLICY_IDS)[number];
type RewardCardPredicateId = (typeof REWARD_CARD_PREDICATES)[number];

const POLICY_SET: ReadonlySet<string> = new Set(REWARD_SELECTION_POLICY_IDS);
const MECHANIC_SET: ReadonlySet<string> = new Set(REWARD_MECHANIC_IDS);
const PREDICATE_SET: ReadonlySet<string> = new Set(REWARD_CARD_PREDICATES);

const CARD_POLICIES: readonly RewardSelectionPolicyId[] = [
  "fixed", "uniform", "card-fit", "card-fit-quality", "card-bundle",
];
const MECHANIC_POLICY_IDS: ReadonlyMap<
  RewardMechanicId,
  readonly RewardSelectionPolicyId[]
> = new Map<RewardMechanicId, readonly RewardSelectionPolicyId[]>([
  ["gain-card", CARD_POLICIES],
  ["catalog-card-chooser", CARD_POLICIES],
  ["pack-chooser", ["uniform", "card-fit", "card-fit-quality", "card-bundle"]],
  ["transfigured-card-chooser", ["uniform", "card-fit", "card-fit-quality"]],
  ["gain-dreamsign", ["fixed", "uniform", "dreamsign-match"]],
  ["transfigure-deck-entry", ["fixed", "uniform", "transfiguration-value"]],
  ["purge-deck-entry", ["fixed", "uniform", "purge-misfit"]],
  ["purge-for-essence", ["fixed", "uniform", "purge-misfit"]],
  ["replace-deck-entry", ["fixed", "uniform", "card-fit-quality"]],
  ["duplicate-deck-entry", ["fixed", "uniform", "duplicate-value"]],
  ["change-entry-subtype", ["fixed", "uniform", "deck-entry-centrality"]],
  ["change-entry-card-type", ["uniform", "deck-entry-centrality"]],
  ["gain-nightmare-and-card", ["fixed"]],
  ["essence-mutation", ["uniform"]],
  ["choose-avatar", ["uniform"]],
  ["add-site", ["fixed", "site-uniform"]],
]);

export function isRewardSelectionPolicyId(
  value: unknown,
): value is RewardSelectionPolicyId {
  return typeof value === "string" && POLICY_SET.has(value);
}

export function isRewardMechanicId(value: unknown): value is RewardMechanicId {
  return typeof value === "string" && MECHANIC_SET.has(value);
}

export function isRewardCardPredicate(
  value: unknown,
): value is RewardCardPredicateId {
  return typeof value === "string" && PREDICATE_SET.has(value);
}

/** Whether `mechanicId` may select its candidates with `policyId`. */
export function mechanicSupportsPolicy(
  mechanicId: RewardMechanicId,
  policyId: RewardSelectionPolicyId,
): boolean {
  return MECHANIC_POLICY_IDS.get(mechanicId)?.includes(policyId) === true;
}
