// Dreamtides 97 collection, deck and starting-package tunables (Appendix A
// §A1, §A17 and §A18; decision P29). Rules code reads these values; it never
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

/** The starting package's formula inputs (Appendix A §A17). */
export interface D97StartingPackageTuning {
  /** The difficulty level `d` every run uses: Standard. */
  readonly difficulty: number;
  /** Starting Essence is `(essenceDifficultyBase − d) × essencePerStep`. */
  readonly essenceDifficultyBase: number;
  readonly essencePerStep: number;
  /** Iterative affinity picks made from the reward bag. */
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
