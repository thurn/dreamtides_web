// Dreamtides 97 encounter tunables (Appendix A §A3, §A8, §A9 and Appendix B
// §B3, §B9, §B10; decision P29). Rules and battle setup read these values;
// they never spell them as literals.

import type { Rarity } from "../../types/cards";

/** One row of Appendix B §B9's tier knobs. */
export interface D97TierKnob {
  /** The lowest tier the row applies to; tiers between rows use the row below. */
  readonly fromTier: number;
  /** Whether an Avatar character's ability is active. */
  readonly abilityActive: boolean;
  /** Lowest-affinity picks replaced with random Starter cards. */
  readonly starterDilution: number;
  /** Dreamsigns the opponent brings. */
  readonly dreamsigns: number;
  /** Random deck cards that receive a transfiguration. */
  readonly transfiguredCards: number;
  /** Whether Legendary cards are candidates. */
  readonly legendaries: boolean;
  /** The opponent's head start before difficulty and boss bonuses. */
  readonly headStart: number;
}

export interface D97EncounterTuning {
  /** Tier knob rows, ascending by `fromTier`. M1 fights tiers 4 and 7 (P29). */
  readonly tierKnobs: readonly D97TierKnob[];
  /** Score target by act, act 1 first (Appendix B §B3). */
  readonly actScoreTargets: readonly number[];
  /** An Avatar guardian's tier is `min(t + guardianTierOffset, guardianTierCap)`. */
  readonly guardianTierOffset: number;
  readonly guardianTierCap: number;
  /** Greedy picks in a constructed opponent deck. */
  readonly opponentDeckSize: number;
  /** Signature cards shown on a preview. */
  readonly signatureCardCount: number;
  /** Bundle budget `S = bundleBase + floor(T / bundleTierDivisor)`. */
  readonly bundleBase: number;
  readonly bundleTierDivisor: number;
  /** Rarity cost points (Appendix A §A3). */
  readonly rarityCost: Readonly<Record<Rarity, number>>;
  /** The Essence purse extra: `purseBase × (1 + floor(T / purseTierDivisor))`. */
  readonly purseBase: number;
  readonly purseTierDivisor: number;
}

export const D97_ENCOUNTERS: D97EncounterTuning = {
  tierKnobs: [
    { fromTier: 4, abilityActive: false, starterDilution: 10, dreamsigns: 0, transfiguredCards: 0, legendaries: false, headStart: 0 },
    { fromTier: 7, abilityActive: true, starterDilution: 5, dreamsigns: 0, transfiguredCards: 0, legendaries: false, headStart: 0 },
  ],
  actScoreTargets: [15, 20, 25, 25, 25],
  guardianTierOffset: 3,
  guardianTierCap: 18,
  opponentDeckSize: 30,
  signatureCardCount: 3,
  bundleBase: 0,
  bundleTierDivisor: 4,
  rarityCost: { Common: 1, Starter: 1, Uncommon: 2, Rare: 3, Legendary: 4, Special: 1, Tutorial: 1 },
  purseBase: 5,
  purseTierDivisor: 4,
};
