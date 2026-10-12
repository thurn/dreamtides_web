/** The current turn's counters (state `turnLog`): cards played and drawn per side. */
import type { EngineCatalog } from "../catalog";
import { characteristicsOf, copiableCostOf } from "../continuous/characteristics";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState, TurnLog } from "../state/types";

export function emptyTurnLog(): TurnLog {
  return { played: { player: [], enemy: [] }, drawn: { player: 0, enemy: 0 } };
}

/**
 * Records that `side` played `card`, with its effective type, subtype,
 * "has all character types", and spark and its copiable cost as it is
 * played, before its "when you play" triggers match. "When you play" filters
 * and counts read these, so a later type or spark change does not alter what
 * an earlier play matched (RD-hv-7x4l.34-1, RD-hv-umm2.464-1), and a card
 * that has since ceased to exist or become unidentifiable in a hidden zone
 * still matches by its cost and spark.
 */
export function recordPlayed(state: BattleState, catalog: EngineCatalog, side: Side, card: InstanceId): void {
  const { cardType, subtype, allTypes, spark } = characteristicsOf(state, catalog, card);
  state.turnLog.played[side].push({ instance: card, cardType, subtype, allTypes, cost: copiableCostOf(state, catalog, card), spark });
}

/** Records that `side` drew a card, before its "when you draw" triggers match. */
export function recordDrawn(state: BattleState, side: Side): void {
  state.turnLog.drawn[side] += 1;
}

/** How many cards `side` has played this turn, by every route (copies are never played). */
export function playedThisTurn(state: BattleState, side: Side): number {
  return state.turnLog.played[side].length;
}
