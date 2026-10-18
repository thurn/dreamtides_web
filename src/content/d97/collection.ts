// Dreamtides 97 collection, deck, reward-bag and starting-package tunables
// (Appendix A §A1, §A2, §A17 and §A18; decision P29). Rules code reads these values; it never
// spells them as literals.

import type { Rarity } from "../../types/cards";

/** Deck-building limits. */
export interface D97CollectionTuning {
  /** The fewest owned copies the active deck may hold. */
  readonly minimumDeckSize: number;
  /** The fewest owned copies the whole collection may hold. */
  readonly collectionFloor: number;
  /**
   * The rarities a reward bag may hold (§A1 eligible cards). Legendary,
   * Starter, Special and Tutorial cards never come from bags.
   */
  readonly bagRarities: readonly Rarity[];
}

/**
 * The campaign event that opens a reward-bag stage (Appendix A §A2): the run
 * starting, the player first entering an act, or Apollyon falling.
 */
export type D97BagStageTrigger =
  | { readonly kind: "runStart" }
  | { readonly kind: "actEntered"; readonly act: number }
  | { readonly kind: "apollyonFalls" };

/** One reward-bag capacity stage: what opens it and each ring's capacity. */
export interface D97BagStageTuning {
  readonly stage: number;
  readonly opensOn: D97BagStageTrigger;
  /** The copies of each ring-1 (signature) card the bag can ever supply. */
  readonly ring1Capacity: number;
  /** The copies of each ring-2 (facet) card the bag can ever supply. */
  readonly ring2Capacity: number;
}

/** The reward bag's capacity stages, in opening order; the first opens at run start. */
export interface D97RewardBagTuning {
  readonly stages: readonly D97BagStageTuning[];
}

/** The starting package's formula inputs (Appendix A §A17). */
export interface D97StartingPackageTuning {
  /** The difficulty level `d` every run uses: Standard. */
  readonly difficulty: number;
  /** Starting Essence is `(essenceDifficultyBase − d) × essencePerStep`. */
  readonly essenceDifficultyBase: number;
  readonly essencePerStep: number;
  /** Iterative affinity picks made from the reward bag's ring 1. */
  readonly pickCount: number;
  /** The top fraction of ranked candidates each pick draws from. */
  readonly bandFraction: number;
  /** The fewest ranked candidates each pick draws from. */
  readonly bandMinimum: number;
  /** Starter dilution replaces `starterBase + starterPerDifficulty × d` picks. */
  readonly starterBase: number;
  readonly starterPerDifficulty: number;
}

export const D97_COLLECTION: D97CollectionTuning = {
  minimumDeckSize: 25,
  collectionFloor: 25,
  bagRarities: ["Common", "Uncommon", "Rare"],
};

export const D97_REWARD_BAG: D97RewardBagTuning = {
  stages: [
    { stage: 1, opensOn: { kind: "runStart" }, ring1Capacity: 1, ring2Capacity: 0 },
    { stage: 2, opensOn: { kind: "actEntered", act: 2 }, ring1Capacity: 1, ring2Capacity: 1 },
    { stage: 3, opensOn: { kind: "actEntered", act: 3 }, ring1Capacity: 2, ring2Capacity: 1 },
    { stage: 4, opensOn: { kind: "actEntered", act: 4 }, ring1Capacity: 2, ring2Capacity: 2 },
    { stage: 5, opensOn: { kind: "actEntered", act: 5 }, ring1Capacity: 3, ring2Capacity: 3 },
    { stage: 6, opensOn: { kind: "apollyonFalls" }, ring1Capacity: 4, ring2Capacity: 4 },
  ],
};

export const D97_STARTING_PACKAGE: D97StartingPackageTuning = {
  difficulty: 1,
  essenceDifficultyBase: 5,
  essencePerStep: 50,
  pickCount: 30,
  bandFraction: 0.25,
  bandMinimum: 5,
  starterBase: 3,
  starterPerDifficulty: 2,
};
