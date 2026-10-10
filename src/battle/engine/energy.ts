// tutorial-only until Phase 6

import type { BattleDebugEdit } from "../debug/commands";
import type { BattleSide } from "../types";

/**
 * Returns the edits that apply a Dreamwell card's energy to `side` when its
 * Dreamwell phase resolves (rules §The Dreamwell and Energy): the card's
 * `energyAdded` permanently raises maximum ●, then current ● resets to the new
 * maximum. The sum is uncapped — maximum ● is the running total of every
 * Dreamwell card the side has drawn.
 *
 * SET_MAX_ENERGY precedes SET_CURRENT_ENERGY so callers applying them in order
 * never transiently violate the current ≤ max invariant. A card with
 * `energyAdded === 0` (e.g. an order-4 utility card) yields a max-energy SET to
 * the unchanged value, refilling current ● without raising the maximum.
 */
export function dreamwellEnergyEdits(
  side: BattleSide,
  currentMaxEnergy: number,
  energyAdded: number,
): BattleDebugEdit[] {
  const value = currentMaxEnergy + energyAdded;
  return [
    { kind: "SET_MAX_ENERGY", side, value },
    { kind: "SET_CURRENT_ENERGY", side, value },
  ];
}
