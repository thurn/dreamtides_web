// Dreamtides 97 save reconciliation tunables (decision P5): the committed card
// retirement table and the Essence a retired card without a replacement is
// compensated with. Reconciliation reads these values; it never spells them
// as literals.

import type { CardId } from "../../types/card-identity";

/** One retired card: its replacement, or null to compensate in Essence. */
export interface D97CardRetirement {
  readonly cardId: CardId;
  readonly replacementId: CardId | null;
}

export interface D97SaveTuning {
  /** Every retired card a save may still reference. */
  readonly retirements: readonly D97CardRetirement[];
  /** Essence paid for each owned copy of a retired card with no replacement. */
  readonly retiredCardEssence: number;
}

export const D97_SAVE: D97SaveTuning = {
  retirements: [],
  retiredCardEssence: 25,
};
