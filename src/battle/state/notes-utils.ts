import { nextStartOfTurnPair } from "./turn-utils";
import type { BattleCardNoteExpiry, BattleMutableState } from "../types";

/**
 * Shared next-turn expiry construction for card notes — bug-107.
 */

export function createNextTurnExpiry(state: BattleMutableState): BattleCardNoteExpiry {
  const pair = nextStartOfTurnPair(state);
  return {
    kind: "atStartOfTurn",
    side: pair.side,
    turnNumber: pair.turnNumber,
  };
}
