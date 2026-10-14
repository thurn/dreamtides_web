/**
 * Layer 6, cost modifications (rules § Costs, Requirements, and X): when a
 * player plays a card, its energy cost rises by every increase and then
 * falls by every reduction, never below 0. A "next card" modifier applies to
 * the next matching card its player plays and ends as that card is paid for.
 * A card whose own cost was set ("It costs 0●") uses the set value as its
 * normal base. Explicit replacement routes choose their own base before
 * increases and reductions (RD-hv-umm2.422-1).
 */
import type { EngineCatalog } from "../catalog";
import type { EffectId, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { characteristics, copiableCostOf, filterSubjectOf, matchesFilter, playedMatchesFilter } from "./characteristics";
import type { Layers } from "./layers";

/** The cost modifications that apply to one play of one card. */
export interface CostModifier {
  readonly increase: number;
  readonly reduction: number;
  /** The "next card" modifiers this play uses up. */
  readonly consumes: readonly EffectId[];
}

export const NO_COST_MODIFIER: CostModifier = { increase: 0, reduction: 0, consumes: [] };

/**
 * Cost changes for a play. Own setters define the normal base; a selected
 * replacement route excludes them. Display and normal routes apply them.
 */
export function costModifier(
  state: BattleState,
  catalog: EngineCatalog,
  card: InstanceId,
  player: Side,
  layers: Layers = characteristics(state, catalog),
  options: { readonly applyOwnSet?: boolean } = {},
): CostModifier {
  let increase = 0;
  let reduction = 0;
  let set: number | null = null;
  const consumes: EffectId[] = [];
  const played = filterSubjectOf(state, catalog, card, layers.of(card));
  for (const { change, effect } of layers.changes(6)) {
    if (change.kind === "cardCost") {
      if (change.instance !== card) continue;
      // Changes come in layer order, so the latest set applies.
      if (change.mode === "set") {
        if (options.applyOwnSet !== false) set = change.amount;
      } else if (change.mode === "reduce") reduction += change.amount;
      else increase += change.amount;
      continue;
    }
    if (change.kind !== "cost" || change.player !== player || !matchesFilter(played, change.filter)) continue;
    if (change.nth !== undefined) {
      const earlier = state.turnLog.played[player].filter(record => playedMatchesFilter(state, catalog, record, change.filter)).length;
      if (earlier !== change.nth - 1) continue;
      if (change.mode === "set") {
        if (options.applyOwnSet !== false) set = change.amount;
        continue;
      }
    }
    if (change.amount > 0) increase += change.amount;
    else reduction -= change.amount;
    if (change.next && effect !== null) consumes.push(effect);
  }
  if (set !== null) {
    // The set cost replaces the ● cost; X and other energy parts still add, and
    // every change applies to the total once, so the difference joins the
    // increases or the reductions with the same result.
    const difference = set - copiableCostOf(state, catalog, card);
    if (difference > 0) increase += difference;
    else reduction -= difference;
  }
  return { increase, reduction, consumes };
}

/** An energy cost after modifications: increases, then reductions, never below 0. */
export function adjustedEnergy(base: number, modifier: CostModifier): number {
  return Math.max(0, base + modifier.increase - modifier.reduction);
}
