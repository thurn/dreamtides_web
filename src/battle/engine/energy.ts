import type { BattleDebugEdit } from "../debug/commands";
import type { BattleSide } from "../types";

/**
 * Energy a side holds on turn 1 (its Dreamwell opening). The ramp schedule is
 * anchored to this value: turn 1 produces exactly `OPENING_ENERGY` energy.
 */
export const OPENING_ENERGY = 2;

/**
 * A Dreamwell ramp schedule: a named, documented mapping from turn number to the
 * energy a side should hold after its Dreamwell phase. Expressing the ramp this
 * way (rather than an inline formula) lets the opening value and per-turn growth
 * be tuned in one place and swapped for alternate schedules.
 */
export interface EnergyRampSchedule {
  /** Energy produced on turn 1. */
  readonly openingValue: number;
  /**
   * Target energy for `turnNumber`, clamped to `maxEnergyCap`. Must be
   * non-decreasing in `turnNumber` and equal to `openingValue` on turn 1.
   */
  target(turnNumber: number, maxEnergyCap: number): number;
}

/**
 * The standard Dreamwell ramp: each turn the side's Dreamwell raises its maximum
 * by one over the previous turn, starting from `OPENING_ENERGY` on turn 1, and
 * never exceeding `maxEnergyCap`:
 *
 *   target(turn) = min(openingValue + (turn - 1), maxEnergyCap)
 *
 * This preserves the game's effective curve: 2 on turn 1, 3 on turn 2, and so on
 * up to the cap.
 */
export const STANDARD_ENERGY_RAMP: EnergyRampSchedule = {
  openingValue: OPENING_ENERGY,
  target(turnNumber: number, maxEnergyCap: number): number {
    return Math.min(OPENING_ENERGY + (turnNumber - 1), maxEnergyCap);
  },
};

/**
 * Returns the two debug edits needed to set both max and current energy for
 * `side` at the start of turn `turnNumber`, following `schedule` (the standard
 * Dreamwell ramp by default).
 *
 * Using SET (not ADJUST) makes the result deterministic regardless of whatever
 * energy the side already holds.
 *
 * The SET_MAX_ENERGY edit always precedes SET_CURRENT_ENERGY so callers that
 * apply them in order cannot transiently violate the current ≤ max invariant.
 */
export function energyRampEdits(
  side: BattleSide,
  turnNumber: number,
  maxEnergyCap: number,
  schedule: EnergyRampSchedule = STANDARD_ENERGY_RAMP,
): BattleDebugEdit[] {
  const value = schedule.target(turnNumber, maxEnergyCap);
  return [
    { kind: "SET_MAX_ENERGY", side, value },
    { kind: "SET_CURRENT_ENERGY", side, value },
  ];
}

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
