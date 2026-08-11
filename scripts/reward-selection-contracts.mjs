export const REWARD_SELECTION_POLICY_IDS = Object.freeze([
  "fixed", "uniform", "card-fit", "card-fit-quality", "card-bundle",
  "purge-misfit", "duplicate-value", "deck-entry-centrality",
  "transfiguration-value", "dreamsign-match", "site-uniform",
]);

export const REWARD_MECHANIC_IDS = Object.freeze([
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
  "choose-dream-avatar", "purge-duplicates-and-grant-reclaim", "add-site",
  "shop-purchase-modifier",
]);

export const REWARD_CARD_PREDICATES = Object.freeze([
  "any", "character", "event", "cheap-character", "spirit-animal",
  "survivor", "warrior", "legendary",
]);

const POLICY_SET = new Set(REWARD_SELECTION_POLICY_IDS);
const MECHANIC_SET = new Set(REWARD_MECHANIC_IDS);
const PREDICATE_SET = new Set(REWARD_CARD_PREDICATES);

const CARD_POLICIES = ["fixed", "uniform", "card-fit", "card-fit-quality", "card-bundle"];
const MECHANIC_POLICY_IDS = new Map([
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
  ["choose-dream-avatar", ["uniform"]],
  ["add-site", ["fixed", "site-uniform"]],
]);

export function isRewardSelectionPolicyId(value) {
  return typeof value === "string" && POLICY_SET.has(value);
}

export function isRewardMechanicId(value) {
  return typeof value === "string" && MECHANIC_SET.has(value);
}

export function isRewardCardPredicate(value) {
  return typeof value === "string" && PREDICATE_SET.has(value);
}

export function mechanicSupportsPolicy(mechanicId, policyId) {
  return MECHANIC_POLICY_IDS.get(mechanicId)?.includes(policyId) === true;
}
