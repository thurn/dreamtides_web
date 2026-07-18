import type { BattleCommand } from "../debug/commands";
import type { BattleDebugZoneDestination } from "../debug/commands";
import {
  isBattleFieldSlotAddressValid,
  selectBattleCardLocation,
  selectBattlefieldSlotOccupant,
  selectDefaultCharacterPlaySlot,
} from "../state/selectors";
import { backRankSlotId, frontRankSlotId, rankSlotIds } from "../types";
import type {
  BattleCommandSourceSurface,
  BattleMutableState,
  BattleSide,
  BattleFieldSlotAddress,
  BattlefieldZone,
} from "../types";
import type { BattleDeckCardDefinition } from "../types";

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

/** Resolves the physical "play this hand card" gesture. Characters use a
 * preferred open back-rank slot when the gesture supplies one, then fall back to
 * their controller's first open back-rank slot. Events use the same play
 * destination while Basic Automation is active so its planner can charge energy
 * before redirecting the event to the void; in a manual battle they go directly
 * to the void. */
export function createPlayCardFromHandCommand(
  state: BattleMutableState,
  battleCardId: string,
  sourceSurface: BattleCommandSourceSurface,
  basicAutomationEnabled: boolean,
  preferredTarget?: BattleFieldSlotAddress,
): BattleCommand | null {
  const location = selectBattleCardLocation(state, battleCardId);
  const instance = state.cardInstances[battleCardId];
  if (location?.zone !== "hand" || instance === undefined) return null;

  if (
    instance.definition.battleCardKind === "event"
    && !basicAutomationEnabled
  ) {
    return createMoveCardToZoneCommand(
      battleCardId,
      location.side,
      "void",
      sourceSurface,
    );
  }

  const target =
    preferredTarget?.side === location.side
    && preferredTarget.zone === "backRank"
    && isBattleFieldSlotAddressValid(preferredTarget)
    && selectBattlefieldSlotOccupant(state, preferredTarget) === null
      ? preferredTarget
      : selectDefaultCharacterPlaySlot(state, location.side);
  if (target === null) return null;

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

/** Creates the event-sourced debug edit used when a UUID-resolved pool card is dropped into battle. */
export function createPoolCardDropCommand(
  definition: BattleDeckCardDefinition,
  destination: BattleDebugZoneDestination,
  createdAtMs: number,
): BattleCommand {
  return {
    id: "DEBUG_EDIT",
    edit: {
      kind: "CREATE_CARD_FROM_DEFINITION",
      definition,
      destination,
      createdAtMs,
    },
    sourceSurface: "pool-viewer",
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
