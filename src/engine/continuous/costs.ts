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
import type { AbilitySource, EffectId, InstanceId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { characteristics, copiableCostOf, filterSubjectOf, matchesFilter, playedMatchesFilter } from "./characteristics";
import type { Layers } from "./layers";

/** The energy modifications for one card play or card-sourced activation. */
export interface CostModifier {
  readonly increase: number;
  readonly reduction: number;
  /** The next matching operation modifiers this payment uses up. */
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
  options: { readonly applyOwnSet?: boolean; readonly reclaimBase?: number } = {},
): CostModifier {
  let increase = 0;
  let reduction = 0;
  let setDifference: number | null = null;
  const consumes: EffectId[] = [];
  const played = filterSubjectOf(state, catalog, card, layers.of(card));
  for (const { change, effect } of layers.changes(6)) {
    if (change.kind === "reclaimCost") {
      if (change.player !== player || options.reclaimBase === undefined) continue;
      if (change.mode === "set") setDifference = change.amount - options.reclaimBase;
      else reduction += change.amount;
      continue;
    }
    if (change.kind === "cardCost") {
      if (change.instance !== card) continue;
      // Changes come in layer order, so the latest set applies.
      if (change.mode === "set") {
        if (options.applyOwnSet !== false) setDifference = change.amount - copiableCostOf(state, catalog, card);
      } else if (change.mode === "reduce") reduction += change.amount;
      else increase += change.amount;
      continue;
    }
    if (change.kind !== "cost" || change.route === "activated" || change.player !== player || !matchesFilter(played, change.filter)) continue;
    if (change.nth !== undefined) {
      const matching = state.turnLog.played[player].filter(record => playedMatchesFilter(state, catalog, record, change.filter));
      if (change.from === "void" && (state.instances[card].zone !== "void" || matching.some(record => record.playedFromVoid === undefined))) continue;
      const earlier = change.from === "void" ? matching.filter(record => record.playedFromVoid === true).length : matching.length;
      if (earlier !== change.nth - 1) continue;
    }
    if (change.mode === "set") {
      if (options.applyOwnSet !== false) setDifference = change.amount - copiableCostOf(state, catalog, card);
      continue;
    }
    if (change.amount > 0) increase += change.amount;
    else reduction -= change.amount;
    if (change.next && effect !== null) consumes.push(effect);
  }
  if (setDifference !== null) {
    // The set cost replaces the ● cost; X and other energy parts still add, and
    // every change applies to the total once, so the difference joins the
    // increases or the reductions with the same result.
    if (setDifference > 0) increase += setDifference;
    else reduction -= setDifference;
  }
  return { increase, reduction, consumes };
}

/** Energy adjustments for card-sourced activations, independent of every card-play route. */
export function activationCostModifier(
  state: BattleState,
  catalog: EngineCatalog,
  source: AbilitySource,
  player: Side,
  layers: Layers = characteristics(state, catalog),
): CostModifier {
  if (typeof source !== "string" || state.instances[source] === undefined) return NO_COST_MODIFIER;
  const subject = filterSubjectOf(state, catalog, source, layers.of(source));
  let increase = 0;
  let reduction = 0;
  const consumes: EffectId[] = [];
  for (const { change, effect } of layers.changes(6)) {
    if (change.kind !== "cost" || change.route !== "activated" || change.player !== player ||
      change.nth !== undefined || change.mode !== undefined || !matchesFilter(subject, change.filter)) continue;
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
