/** The current turn's counters (state `turnLog`): cards played and drawn per side. */
import type { EngineCatalog } from "../catalog";
import { characteristicsOf, copiableCostOf } from "../continuous/characteristics";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState, TurnLog } from "../state/types";

export function emptyTurnLog(): TurnLog {
  return { played: { player: [], enemy: [] }, drawn: { player: 0, enemy: 0 } };
}

/**
 * Records that `side` played `card`, with its effective type, subtype, and
 * "has all character types" and its copiable cost as it is played, before
 * its "when you play" triggers match. "When you play" filters and counts read
 * these, so a later type change does not alter what an earlier play matched
 * (RD-hv-7x4l.34-1), and a created card that has since ceased to exist still
 * matches by its cost.
 */
export function recordPlayed(state: BattleState, catalog: EngineCatalog, side: Side, card: InstanceId): void {
  const { cardType, subtype, allTypes } = characteristicsOf(state, catalog, card);
  state.turnLog.played[side].push({ instance: card, cardType, subtype, allTypes, cost: copiableCostOf(state, catalog, card) });
}

/** Records that `side` drew a card, before its "when you draw" triggers match. */
export function recordDrawn(state: BattleState, side: Side): void {
  state.turnLog.drawn[side] += 1;
}

/** How many cards `side` has played this turn, by every route (copies are never played). */
export function playedThisTurn(state: BattleState, side: Side): number {
  return state.turnLog.played[side].length;
}
