// Dreamtides 97 shop tunables (Appendix A §A3–A6). The shop rules read these
// values; they never spell them as literals. Rarity cost points, which set the
// slot ceilings, live with the encounter tunables.

import type { Rarity } from "../../types/cards";

export interface D97ShopTuning {
  /** The price band M1 dreams use (Appendix B §B3). */
  readonly priceBand: number;
  /** Slot count `n = priceBand + slotBase`. */
  readonly slotBase: number;
  /** Slot `i` offers cards of rarity cost at most `(i mod slotCeilingCycle) + 1`. */
  readonly slotCeilingCycle: number;
  /** Base value `v0 = energyUnit × (e + 1) + sparkUnit × s` for a Character. */
  readonly energyUnit: number;
  readonly sparkUnit: number;
  /** The energy an X cost counts as. */
  readonly xEnergy: number;
  /** A Fast card's base value is multiplied by `fastNumerator / fastDenominator`. */
  readonly fastNumerator: number;
  readonly fastDenominator: number;
  /** Rarity multiplier and floor on the base value (§A3). */
  readonly rarity: Readonly<Record<Rarity, { readonly multiplier: number; readonly floor: number }>>;
  /** Quote `step × floor(v × (band + bandOffset) / divisor)`, buy quotes clamped to [min, max]. */
  readonly bandOffset: number;
  readonly divisor: number;
  readonly step: number;
  readonly minQuote: number;
  readonly maxQuote: number;
  /** A restock costs `restockUnit × (band + bandOffset)` Essence, once per visit. */
  readonly restockUnit: number;
}

export const D97_SHOP: D97ShopTuning = {
  priceBand: 1,
  slotBase: 3,
  slotCeilingCycle: 3,
  energyUnit: 20,
  sparkUnit: 5,
  xEnergy: 3,
  fastNumerator: 3,
  fastDenominator: 2,
  rarity: {
    Common: { multiplier: 1, floor: 0 },
    Starter: { multiplier: 1, floor: 0 },
    Special: { multiplier: 1, floor: 0 },
    Tutorial: { multiplier: 1, floor: 0 },
    Uncommon: { multiplier: 2, floor: 100 },
    Rare: { multiplier: 4, floor: 200 },
    Legendary: { multiplier: 8, floor: 200 },
  },
  bandOffset: 2,
  divisor: 50,
  step: 5,
  minQuote: 5,
  maxQuote: 1000,
  restockUnit: 10,
};
