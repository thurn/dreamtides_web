/** The current turn's counters (state `turnLog`): cards played and drawn per side. */
import { printedCard, type EngineCatalog } from "../catalog";
import type { InstanceId, Side } from "../state/ids";
import type { BattleState, TurnLog } from "../state/types";
import { instanceOf } from "./zones";

export function emptyTurnLog(): TurnLog {
  return { played: { player: [], enemy: [] }, drawn: { player: 0, enemy: 0 } };
}

/** Records that `side` played `card`, before its "when you play" triggers match. */
export function recordPlayed(state: BattleState, catalog: EngineCatalog, side: Side, card: InstanceId): void {
  const definition = printedCard(catalog, instanceOf(state, card).printing);
  state.turnLog.played[side].push({ instance: card, cardType: definition.cardType, subtype: definition.subtype });
}

/** Records that `side` drew a card, before its "when you draw" triggers match. */
export function recordDrawn(state: BattleState, side: Side): void {
  state.turnLog.drawn[side] += 1;
}
