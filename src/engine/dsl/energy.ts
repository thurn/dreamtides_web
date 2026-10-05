/** The energy parts of a list of costs (rules § Costs, Requirements, and X). */
import type { Cost, EnergyXCost } from "./types";

/** The fixed energy part of a list of costs; X counts as 0. */
export function fixedEnergy(costs: readonly Cost[]): number {
  return costs.reduce((total, cost) => total + (cost.cost === "energy" ? cost.amount : 0), 0);
}

/** The X part of a list of costs, or `null` when it has none. */
export function xCost(costs: readonly Cost[]): EnergyXCost | null {
  return costs.find((cost): cost is EnergyXCost => cost.cost === "energyX") ?? null;
}

/** The least energy the costs need: the fixed part plus X's minimum. */
export function minimumEnergy(costs: readonly Cost[]): number {
  return fixedEnergy(costs) + (xCost(costs)?.min ?? 0);
}
