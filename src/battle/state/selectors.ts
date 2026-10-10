// tutorial-only until Phase 6

import type {
  BattleCardInstance,
  BattleCardLocation,
  BattleFieldCardLocation,
  BattleFieldSlotAddress,
  BattleMutableState,
  BattleSide,
  BattlefieldZone,
} from "../types";
import {
  BACK_RANK_SLOTS,
  FRONT_RANK_SLOTS,
  isBackRankSlotId,
  isFrontRankSlotId,
  rankSlotIds,
  slotIndex,
} from "../types";
import { centerPreferredEmptySlot } from "../center-preferred-slot";
import type { BattleCardId } from "../../types/identifiers";

export function selectBattleCardInstance(
  state: BattleMutableState,
  battleCardId: BattleCardId | null,
): BattleCardInstance | null {
  if (battleCardId === null) {
    return null;
  }

  return state.cardInstances[battleCardId] ?? null;
}

/**
 * Resolves the card that a KINDLE debug edit will land on for a given side.
 * If `preferredBattleCardId` is present and belongs to `side`, that card wins;
 * otherwise the leftmost deployed character is used, falling back to the
 * leftmost reserve character (spec §E-11). Returns `null` when the side has
 * no character on the battlefield. Shared with `applyDebugEdit.kindleCard`
 * and `createKindleHistoryMetadata` so metadata records the actual target
 * id at dispatch time (bug-073).
 */
export function selectKindleTargetBattleCardId(
  state: BattleMutableState,
  side: BattleSide,
  preferredBattleCardId: BattleCardId | null,
): BattleCardId | null {
  const preferredLocation = selectBattlefieldCardLocation(
    state,
    preferredBattleCardId,
  );

  if (preferredLocation !== null && preferredLocation.side === side) {
    return preferredBattleCardId;
  }

  for (const slotId of rankSlotIds(state.sides[side].frontRank)) {
    const battleCardId = state.sides[side].frontRank[slotId];

    if (battleCardId !== null) {
      return battleCardId;
    }
  }

  for (const slotId of rankSlotIds(state.sides[side].backRank)) {
    const battleCardId = state.sides[side].backRank[slotId];

    if (battleCardId !== null) {
      return battleCardId;
    }
  }

  return null;
}

export function selectBattleCardLocation(
  state: BattleMutableState,
  battleCardId: BattleCardId | null,
): BattleCardLocation | null {
  if (battleCardId === null) {
    return null;
  }

  for (const side of ["player", "enemy"] as const) {
    const handIndex = state.sides[side].hand.indexOf(battleCardId);
    if (handIndex >= 0) {
      return {
        side,
        zone: "hand",
        index: handIndex,
      };
    }

    const deckIndex = state.sides[side].deck.indexOf(battleCardId);
    if (deckIndex >= 0) {
      return {
        side,
        zone: "deck",
        index: deckIndex,
      };
    }

    const voidIndex = state.sides[side].void.indexOf(battleCardId);
    if (voidIndex >= 0) {
      return {
        side,
        zone: "void",
        index: voidIndex,
      };
    }

    const banishedIndex = state.sides[side].banished.indexOf(battleCardId);
    if (banishedIndex >= 0) {
      return {
        side,
        zone: "banished",
        index: banishedIndex,
      };
    }

    const reserveLocation = selectOccupiedBattlefieldSlot(
      state,
      side,
      "backRank",
      battleCardId,
    );
    if (reserveLocation !== null) {
      return reserveLocation;
    }

    const deployedLocation = selectOccupiedBattlefieldSlot(
      state,
      side,
      "frontRank",
      battleCardId,
    );
    if (deployedLocation !== null) {
      return deployedLocation;
    }
  }

  return null;
}

export function selectBattlefieldCardLocation(
  state: BattleMutableState,
  battleCardId: BattleCardId | null,
): BattleFieldCardLocation | null {
  const location = selectBattleCardLocation(state, battleCardId);

  if (
    location === null ||
    (location.zone !== "backRank" && location.zone !== "frontRank")
  ) {
    return null;
  }

  return location;
}

/**
 * The rules-level dimensions for either side. They do not depend on occupancy,
 * so presentation adapters retain stable slot positions across battle handoff.
 */
export function selectSidePlayAreaSize(
  _state: BattleMutableState,
  _side: BattleSide,
): { frontSize: number; backSize: number } {
  return { frontSize: FRONT_RANK_SLOTS, backSize: BACK_RANK_SLOTS };
}

export function selectDefaultCharacterPlaySlot(
  state: BattleMutableState,
  side: BattleSide,
): BattleFieldSlotAddress | null {
  const { backRank } = state.sides[side];

  for (const slotId of rankSlotIds(backRank)) {
    if (backRank[slotId] === null) {
      return { side, zone: "backRank", slotId };
    }
  }

  return null;
}

/**
 * The empty back-rank slot nearest the visual center. AI character plays use
 * this selector so scripted and heuristic decisions share one placement rule.
 * Equidistant slots prefer the lower index for deterministic folding.
 */
export function selectCenterPreferredCharacterPlaySlot(
  state: BattleMutableState,
  side: BattleSide,
): BattleFieldSlotAddress | null {
  const { backRank } = state.sides[side];
  const centerIndex = (BACK_RANK_SLOTS - 1) / 2;
  const slotId = centerPreferredEmptySlot(backRank, centerIndex);
  return slotId === null ? null : { side, zone: "backRank", slotId };
}

export function selectBattlefieldSlotOccupant(
  state: BattleMutableState,
  target: BattleFieldSlotAddress,
): BattleCardId | null {
  if (!isBattleFieldSlotAddressValid(target)) {
    return null;
  }

  if (target.zone === "backRank") {
    if (!isBackRankSlotId(target.slotId)) return null;
    return state.sides[target.side].backRank[target.slotId] ?? null;
  }

  if (!isFrontRankSlotId(target.slotId)) return null;
  return state.sides[target.side].frontRank[target.slotId] ?? null;
}

export function isBattleFieldSlotAddressValid(
  target: BattleFieldSlotAddress,
): target is BattleFieldSlotAddress {
  if (target.zone === "backRank") {
    return (
      isBackRankSlotId(target.slotId) &&
      slotIndex(target.slotId) < BACK_RANK_SLOTS
    );
  }

  return (
    isFrontRankSlotId(target.slotId) &&
    slotIndex(target.slotId) < FRONT_RANK_SLOTS
  );
}

function selectOccupiedBattlefieldSlot(
  state: BattleMutableState,
  side: BattleSide,
  zone: BattlefieldZone,
  battleCardId: BattleCardId,
): BattleFieldCardLocation | null {
  if (zone === "backRank") {
    for (const slotId of rankSlotIds(state.sides[side].backRank)) {
      const occupant = state.sides[side].backRank[slotId];

      if (occupant === battleCardId) {
        return {
          side,
          zone,
          slotId,
        };
      }
    }

    return null;
  }

  for (const slotId of rankSlotIds(state.sides[side].frontRank)) {
    const occupant = state.sides[side].frontRank[slotId];

    if (occupant === battleCardId) {
      return {
        side,
        zone,
        slotId,
      };
    }
  }

  return null;
}
