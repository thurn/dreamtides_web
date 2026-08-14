import type {
  BattleFieldSlotAddress,
  BattleMutableState,
} from "../../battle/types";
import type { BattleDebugEdit } from "../../battle/debug/commands";
import {
  isBattleFieldSlotAddressValid,
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
} from "../../battle/state/selectors";
import type { BattleCardId } from "../../types/identifiers";

function isLegalRepositionPhase(board: BattleMutableState): boolean {
  return (
    (board.activeSide === "player" && board.phase === "day") ||
    (board.activeSide === "enemy" && board.phase === "dusk")
  );
}

/**
 * Plans the one rules-owned edit for a tutorial character reposition.
 * Returning null means the exact requested destination is illegal.
 */
export function planTutorialCharacterReposition(
  board: BattleMutableState,
  battleCardId: BattleCardId,
  destination: BattleFieldSlotAddress,
): BattleDebugEdit | null {
  if (
    !isLegalRepositionPhase(board) ||
    destination.side !== "player" ||
    !isBattleFieldSlotAddressValid(destination)
  ) {
    return null;
  }
  const source = selectBattleCardLocation(board, battleCardId);
  const instance = board.cardInstances[battleCardId];
  if (
    source?.side !== "player" ||
    (source.zone !== "backRank" && source.zone !== "frontRank") ||
    instance?.controller !== "player" ||
    instance.definition.battleCardKind !== "character"
  ) {
    return null;
  }
  if (
    source.zone === destination.zone &&
    source.slotId === destination.slotId
  ) {
    return null;
  }
  if (destination.zone === "frontRank" && instance.status.isExhausted) {
    return null;
  }
  const targetOccupant = selectBattlefieldSlotOccupant(board, destination);
  if (targetOccupant === null) {
    return {
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId,
      destination,
    };
  }
  const targetInstance = board.cardInstances[targetOccupant];
  if (
    targetInstance?.controller !== "player" ||
    targetInstance.definition.battleCardKind !== "character"
  ) {
    return null;
  }
  return {
    kind: "SWAP_BATTLEFIELD_SLOTS",
    source: {
      side: "player",
      zone: source.zone,
      slotId: source.slotId,
    },
    target: destination,
  };
}
