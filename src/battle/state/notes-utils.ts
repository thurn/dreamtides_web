import { nextStartOfTurnPair } from "./turn-utils";
import { formatSideLabel } from "../ui/format";
import type { BattleCardNote, BattleCardNoteExpiry, BattleMutableState } from "../types";

/**
 * Shared expiry helpers for card notes — bug-107. The editor and the inspector
 * used to each carry their own copy; centralizing here keeps the formatting
 * and next-turn mapping in one place.
 */

export function createNextTurnExpiry(state: BattleMutableState): BattleCardNoteExpiry {
  const pair = nextStartOfTurnPair(state);
  return {
    kind: "atStartOfTurn",
    side: pair.side,
    turnNumber: pair.turnNumber,
  };
}

export function formatNoteExpiryLabel(note: BattleCardNote): string {
  if (note.expiry.kind === "manual") {
    return "Manual";
  }
  return `Expires start of ${formatSideLabel(note.expiry.side)}'s turn ${String(note.expiry.turnNumber)}`;
}

export function formatNoteExpiryChipHint(note: BattleCardNote): string | null {
  // bug-107: compact hint rendered on the on-card note chip so players can
  // see at a glance whether a note sticks around or auto-expires.
  if (note.expiry.kind === "manual") {
    return null;
  }
  return `T${String(note.expiry.turnNumber)}`;
}
