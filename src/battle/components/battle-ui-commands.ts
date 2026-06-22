import type { BattleCommand } from "../debug/commands";
import type { BattleDebugZoneDestination } from "../debug/commands";
import { selectDefaultCharacterPlaySlot } from "../state/selectors";
import { backRankSlotId, frontRankSlotId, rankSlotIds } from "../types";
import type {
  BattleCommandSourceSurface,
  BattleMutableState,
  BattleSide,
  BattleFieldSlotAddress,
  BattlefieldZone,
} from "../types";

type MoveZoneDebugCommand = {
  id: "DEBUG_EDIT";
  edit: {
    kind: "MOVE_CARD_TO_ZONE";
    battleCardId: string;
    destination: BattleDebugZoneDestination;
  };
  sourceSurface: BattleCommandSourceSurface;
};

export function createMoveCardToBattlefieldCommand(
  state: BattleMutableState,
  battleCardId: string,
  side: BattleSide,
  sourceSurface: BattleCommandSourceSurface,
): MoveZoneDebugCommand | null {
  const target = selectDefaultCharacterPlaySlot(state, side);
  if (target === null) {
    return null;
  }

  return {
    id: "DEBUG_EDIT",
    edit: {
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId,
      destination: target,
    },
    sourceSurface,
  };
}

export function createMoveCardToRowCommand(
  state: BattleMutableState,
  battleCardId: string,
  side: BattleSide,
  zone: BattlefieldZone,
  sourceSurface: BattleCommandSourceSurface,
): MoveZoneDebugCommand | null {
  const target = findFirstOpenBattlefieldSlot(state, side, zone);

  return {
    id: "DEBUG_EDIT",
    edit: {
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId,
      destination: target,
    },
    sourceSurface,
  };
}

export function createMoveCardToZoneCommand(
  battleCardId: string,
  side: BattleSide,
  zone: "hand" | "void" | "banished",
  sourceSurface: BattleCommandSourceSurface,
): BattleCommand {
  return {
    id: "DEBUG_EDIT",
    edit: {
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId,
      destination: { side, zone },
    },
    sourceSurface,
  };
}

export function createMoveCardToStackCommand(
  battleCardId: string,
  side: BattleSide,
  sourceSurface: BattleCommandSourceSurface,
): BattleCommand {
  return {
    id: "DEBUG_EDIT",
    edit: {
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId,
      destination: { side, zone: "stack" },
    },
    sourceSurface,
  };
}

export function createMoveCardToDeckCommand(
  battleCardId: string,
  side: BattleSide,
  position: "top" | "bottom",
  sourceSurface: BattleCommandSourceSurface,
): BattleCommand {
  return {
    id: "DEBUG_EDIT",
    edit: {
      kind: "MOVE_CARD_TO_ZONE",
      battleCardId,
      destination: { side, zone: "deck", position },
    },
    sourceSurface,
  };
}

export function createDiscardMostRecentHandCardCommand(
  state: BattleMutableState,
  side: BattleSide,
  sourceSurface: BattleCommandSourceSurface,
): BattleCommand | null {
  const battleCardId = state.sides[side].hand[state.sides[side].hand.length - 1];
  if (battleCardId === undefined) {
    return null;
  }

  return {
    id: "DEBUG_EDIT",
    edit: {
      kind: "DISCARD_CARD",
      battleCardId,
    },
    sourceSurface,
  };
}

function findFirstOpenBattlefieldSlot(
  state: BattleMutableState,
  side: BattleSide,
  zone: BattlefieldZone,
): BattleFieldSlotAddress {
  if (zone === "backRank") {
    const rank = state.sides[side].backRank;
    for (const slotId of rankSlotIds(rank)) {
      if (rank[slotId] === null) {
        return { side, zone, slotId };
      }
    }
    return { side, zone, slotId: backRankSlotId(rankSlotIds(rank).length) };
  }

  const rank = state.sides[side].frontRank;
  for (const slotId of rankSlotIds(rank)) {
    if (rank[slotId] === null) {
      return { side, zone, slotId };
    }
  }
  // Every materialized slot is occupied: grow the rank rather than blocking the
  // move (the play area has no upper bound).
  return { side, zone, slotId: frontRankSlotId(rankSlotIds(rank).length) };
}
