/**
 * The current turn's counters (state `turnLog`): cards played, cards drawn,
 * and characters materialized, per side.
 */
import { instanceCard, type EngineCatalog } from "../catalog";
import { characteristicsOf, copiableCostOf } from "../continuous/characteristics";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState, MaterializedCard, TurnLog } from "../state/types";

export function emptyTurnLog(): TurnLog {
  return { played: { player: [], enemy: [] }, drawn: { player: 0, enemy: 0 }, materialized: { player: [], enemy: [] } };
}

/**
 * Records that `side` played `card`, with its effective type, subtype,
 * "has all character types", named triggered abilities and spark, and its copiable speed and cost as it is
 * played, before its "when you play" triggers match. "When you play" filters
 * and counts read these, so a later type or spark change does not alter what
 * an earlier play matched (RD-hv-7x4l.34-1, RD-hv-umm2.464-1), and a card
 * that has since ceased to exist or become unidentifiable in a hidden zone
 * still matches by its captured speed, cost and spark.
 */
export function recordPlayed(state: BattleState, catalog: EngineCatalog, side: Side, card: InstanceId): void {
  const { cardType, subtype, allTypes, spark, namedTriggers } = characteristicsOf(state, catalog, card);
  state.turnLog.played[side].push({ instance: card, cardType, subtype, allTypes, namedTriggers: [...namedTriggers], cost: copiableCostOf(state, catalog, card), spark, speed: instanceCard(catalog, state.instances[card]).speed });
}

/** Records that `side` drew a card, before its "when you draw" triggers match. */
export function recordDrawn(state: BattleState, side: Side): void {
  state.turnLog.drawn[side] += 1;
}

/**
 * Records that `side` materialized the character `card`, with its effective
 * type, subtype, and "has all character types" as its `materialized` event
 * announces it, before any trigger matches that event. Every announcement
 * counts: a figment, and an in-play character rematerialized.
 */
export function recordMaterialized(state: BattleState, catalog: EngineCatalog, side: Side, card: InstanceId): void {
  const { cardType, subtype, allTypes } = characteristicsOf(state, catalog, card);
  state.turnLog.materialized ??= { player: [], enemy: [] };
  state.turnLog.materialized[side].push({ instance: card, cardType, subtype, allTypes });
}

/** The characters `side` materialized this turn, in order; none recorded for a saved state that lacks the record. */
export function materializedThisTurn(state: BattleState, side: Side): readonly MaterializedCard[] {
  return state.turnLog.materialized?.[side] ?? [];
}

/** How many cards `side` has played this turn, by every route (copies are never played). */
export function playedThisTurn(state: BattleState, side: Side): number {
  return state.turnLog.played[side].length;
}
