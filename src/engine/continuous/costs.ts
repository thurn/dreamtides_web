/**
 * Layer 6, cost modifications (rules § Costs, Requirements, and X): when a
 * player plays a card, its energy cost rises by every increase and then
 * falls by every reduction, never below 0. A "next card" modifier applies to
 * the next matching card its player plays and ends as that card is paid for.
 */
import type { EngineCatalog } from "../catalog";
import type { EffectId, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { characteristics, matchesFilter } from "./characteristics";
import type { Layers } from "./layers";

/** The cost modifications that apply to one play of one card. */
export interface CostModifier {
  readonly increase: number;
  readonly reduction: number;
  /** The "next card" modifiers this play uses up. */
  readonly consumes: readonly EffectId[];
}

export const NO_COST_MODIFIER: CostModifier = { increase: 0, reduction: 0, consumes: [] };

/** The cost modifications that apply when `player` plays `card` now, read from `layers` (the state's evaluation). */
export function costModifier(
  state: BattleState,
  catalog: EngineCatalog,
  card: InstanceId,
  player: Side,
  layers: Layers = characteristics(state, catalog),
): CostModifier {
  let increase = 0;
  let reduction = 0;
  const consumes: EffectId[] = [];
  const played = layers.of(card);
  for (const { change, effect } of layers.changes(6)) {
    if (change.kind !== "cost" || change.player !== player || !matchesFilter(played, change.filter)) continue;
    if (change.amount > 0) increase += change.amount;
    else reduction -= change.amount;
    if (change.next && effect !== null) consumes.push(effect);
  }
  return { increase, reduction, consumes };
}

/** An energy cost after modifications: increases, then reductions, never below 0. */
export function adjustedEnergy(base: number, modifier: CostModifier): number {
  return Math.max(0, base + modifier.increase - modifier.reduction);
}
