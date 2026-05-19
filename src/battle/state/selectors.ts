import type { QuestFailureBattleResult } from "../../types/quest";
import type {
  BattleCardInstance,
  BattleCardLocation,
  BattleFieldCardLocation,
  BattleFieldSlotAddress,
  BattleHistoryEntry,
  BattleInit,
  BattleMutableState,
  BattleQuestDeckEntry,
  BattleResult,
  BattleSide,
  BattlefieldZone,
  DeploySlotId,
  ReserveSlotId,
} from "../types";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../types";
import { evaluateBattleResult } from "../engine/result";

/**
 * Summary of B-5 quest deck metadata captured at battle-init time. The
 * `questDeckEntries` mirror on `BattleInit` is spec-mandated (every battle
 * session must retain the quest-deck identity of each card it draws from)
 * and exposed through this selector so the Battle Inspector can render the
 * "N banes / M transfigured" line required by spec §B-21 without walking the
 * mutable card-instance graph (bug-037).
 */
export function selectBattleQuestDeckSummary(
  questDeckEntries: readonly BattleQuestDeckEntry[],
): { totalEntries: number; baneCount: number; transfiguredCount: number } {
  let baneCount = 0;
  let transfiguredCount = 0;
  for (const entry of questDeckEntries) {
    if (entry.isBane) {
      baneCount += 1;
    }
    if (entry.transfiguration !== null) {
      transfiguredCount += 1;
    }
  }
  return {
    totalEntries: questDeckEntries.length,
    baneCount,
    transfiguredCount,
  };
}

export function selectBattleCardInstance(
  state: BattleMutableState,
  battleCardId: string | null,
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
  preferredBattleCardId: string | null,
): string | null {
  const preferredLocation = selectBattlefieldCardLocation(state, preferredBattleCardId);

  if (preferredLocation !== null && preferredLocation.side === side) {
    return preferredBattleCardId;
  }

  for (const slotId of DEPLOY_SLOT_IDS) {
    const battleCardId = state.sides[side].deployed[slotId];

    if (battleCardId !== null) {
      return battleCardId;
    }
  }

  for (const slotId of RESERVE_SLOT_IDS) {
    const battleCardId = state.sides[side].reserve[slotId];

    if (battleCardId !== null) {
      return battleCardId;
    }
  }

  return null;
}

export function selectCardHasPreventedMarker(instance: BattleCardInstance): boolean {
  return instance.markers.isPrevented;
}

export function selectCardHasCopiedMarker(instance: BattleCardInstance): boolean {
  return instance.markers.isCopied;
}

export function selectCardHasMarker(instance: BattleCardInstance): boolean {
  return instance.markers.isPrevented || instance.markers.isCopied;
}

export function selectCardHasNotes(instance: BattleCardInstance): boolean {
  return instance.notes.length > 0;
}

export function selectIsBattleCardReservedThisTurn(
  state: BattleMutableState,
  battleCardId: string | null,
): boolean {
  const instance = selectBattleCardInstance(state, battleCardId);
  return instance?.enteredReserveTurnNumber === state.turnNumber;
}

/**
 * Returns the effective spark for a card instance, or `null` when the id
 * is missing or not resolvable. Prefer this over `selectEffectiveSparkOrZero`
 * anywhere that needs to distinguish "spark of 0" from "card gone" — e.g.
 * mid-judgment evaluation after a dissolve (spec §D-5) where a freshly-voided
 * card is no longer in `cardInstances` and must not contribute 0 to scoring
 * silently (bug-041).
 */
export function selectEffectiveSpark(
  state: BattleMutableState,
  battleCardId: string | null,
): number | null {
  const instance = selectBattleCardInstance(state, battleCardId);
  if (instance === null) {
    return null;
  }

  return Math.max(0, instance.definition.printedSpark + instance.sparkDelta);
}

/**
 * Like `selectEffectiveSpark` but coalesces a missing card to 0. Only use
 * this for display surfaces (hand tray, zone browser, inspector) where
 * rendering zero for a transient missing instance is acceptable (bug-041).
 */
export function selectEffectiveSparkOrZero(
  state: BattleMutableState,
  battleCardId: string | null,
): number {
  return selectEffectiveSpark(state, battleCardId) ?? 0;
}

export function selectDeployedSpark(
  state: BattleMutableState,
  side: BattleSide,
  slotId: DeploySlotId,
): number {
  return selectEffectiveSparkOrZero(state, state.sides[side].deployed[slotId]);
}

export function selectCanTakeMainPhaseActions(
  state: BattleMutableState,
  side: BattleSide,
): boolean {
  return state.result === null &&
    state.activeSide === side &&
    (state.phase === "day" || state.phase === "dusk" || state.phase === "night" || state.phase === "main");
}

export function selectCanEndTurn(state: BattleMutableState): boolean {
  return state.result === null &&
    state.phase !== "dawn" &&
    state.phase !== "challenge" &&
    state.phase !== "ending" &&
    state.phase !== "startOfTurn" &&
    state.phase !== "draw" &&
    state.phase !== "judgment";
}

export function selectCanPlayCardInCurrentPhase(
  state: BattleMutableState,
  battleCardId: string,
): boolean {
  const location = selectBattleCardLocation(state, battleCardId);
  const card = state.cardInstances[battleCardId];
  if (location === null || card === undefined || state.result !== null) {
    return false;
  }
  if (location.zone !== "hand" && location.zone !== "void") {
    return false;
  }
  if (location.side !== state.activeSide) {
    return false;
  }
  if (state.phase === "day" || state.phase === "dusk" || state.phase === "main") {
    return true;
  }
  if (state.phase === "night") {
    const timing = card.definition.timing ?? (card.definition.isFast ? "fast" : "standard");
    return timing === "fast" || timing === "interrupt";
  }
  return false;
}

export function selectCanRepositionInCurrentPhase(
  state: BattleMutableState,
  side: BattleSide,
): boolean {
  return state.result === null &&
    state.activeSide === side &&
    (state.phase === "day" || state.phase === "dusk" || state.phase === "main");
}

export function selectNaturalBattleResult(
  state: BattleMutableState,
  battleInit: Pick<BattleInit, "scoreToWin" | "turnLimit">,
): BattleResult | null {
  return evaluateBattleResult(
    { ...state, forcedResult: null },
    battleInit,
  ).result;
}

export function selectFailureOverlayResult(
  result: BattleMutableState["result"],
): QuestFailureBattleResult | null {
  if (result === "defeat" || result === "draw") {
    return result;
  }

  return null;
}

/**
 * Returns the turn number recorded in the `after` snapshot of a history
 * entry. The compact log drawer groups entries by this value so every
 * committed action lines up under the turn it landed on (§5.5 decision 1).
 */
export function selectHistoryEntryTurnNumber(
  entry: BattleHistoryEntry,
): number {
  return entry.after.mutable.turnNumber;
}

/**
 * Returns true when a subsequent user action other than a direct force-result
 * has landed after the most recent FORCE_RESULT history entry. That implies an
 * edit has shifted the live battle state away from whatever supported the
 * forced result, so the forced flag should be cleared to let the live state
 * dictate the outcome.
 */
export function shouldAutoClearForcedResult(
  pastEntries: readonly BattleHistoryEntry[],
): boolean {
  const latest = pastEntries[pastEntries.length - 1];
  if (latest === undefined) {
    return false;
  }

  return latest.metadata.commandId !== "FORCE_RESULT"
    && latest.metadata.commandId !== "SKIP_TO_REWARDS";
}

export function selectBattleCardLocation(
  state: BattleMutableState,
  battleCardId: string | null,
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

    const stackIndex = (state.stack ?? []).findIndex((entry) =>
      entry.side === side && entry.battleCardId === battleCardId
    );
    if (stackIndex >= 0) {
      return {
        side,
        zone: "stack",
        index: stackIndex,
      };
    }

    const reserveLocation = selectOccupiedBattlefieldSlot(
      state,
      side,
      "reserve",
      battleCardId,
    );
    if (reserveLocation !== null) {
      return reserveLocation;
    }

    const deployedLocation = selectOccupiedBattlefieldSlot(
      state,
      side,
      "deployed",
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
  battleCardId: string | null,
): BattleFieldCardLocation | null {
  const location = selectBattleCardLocation(state, battleCardId);

  if (location === null || (location.zone !== "reserve" && location.zone !== "deployed")) {
    return null;
  }

  return location;
}

/**
 * Returns true when the card is an enemy hand entry that the player cannot
 * see. Consolidates the opponent-hand visibility invariant used by
 * selection filtering in the battle screen and the zone browser so all
 * three consumers of the rule share one definition (spec §I-16, I-18).
 *
 * bug-047: a missing `cardInstances[battleCardId]` on a card we've located in
 * enemy hand defaults to *hidden* rather than *visible* — a torn state where
 * the location index mentions an id with no backing instance is exactly the
 * kind of race the zone browser's placeholder is meant to handle, and
 * defaulting to visible would leak enemy hand information.
 */
export function selectIsOpponentHandCardHidden(
  state: BattleMutableState,
  battleCardId: string | null,
): boolean {
  if (battleCardId === null) {
    return false;
  }

  const location = selectBattleCardLocation(state, battleCardId);
  if (location === null) {
    return false;
  }

  if (location.side !== "enemy" || location.zone !== "hand") {
    return false;
  }

  const instance = state.cardInstances[battleCardId];
  if (instance === undefined) {
    return true;
  }
  return !instance.isRevealedToPlayer;
}

export function selectDefaultCharacterPlaySlot(
  state: BattleMutableState,
  side: BattleSide,
): BattleFieldSlotAddress | null {
  for (const slotId of RESERVE_SLOT_IDS) {
    if (state.sides[side].reserve[slotId] === null) {
      return {
        side,
        zone: "reserve",
        slotId,
      };
    }
  }

  // Spec E-16: player card play must never be blocked. When the reserve is
  // full, fall back to the leftmost empty deployed slot so the character can
  // still enter play.
  for (const slotId of DEPLOY_SLOT_IDS) {
    if (state.sides[side].deployed[slotId] === null) {
      return {
        side,
        zone: "deployed",
        slotId,
      };
    }
  }

  return null;
}

export function selectBattlefieldSlotOccupant(
  state: BattleMutableState,
  target: BattleFieldSlotAddress,
): string | null {
  if (!isBattleFieldSlotAddressValid(target)) {
    return null;
  }

  if (target.zone === "reserve") {
    return state.sides[target.side].reserve[target.slotId as ReserveSlotId];
  }

  return state.sides[target.side].deployed[target.slotId as DeploySlotId];
}

export function isBattleFieldSlotAddressValid(
  target: BattleFieldSlotAddress,
): target is BattleFieldSlotAddress {
  if (target.zone === "reserve") {
    return RESERVE_SLOT_IDS.includes(target.slotId as ReserveSlotId);
  }

  return DEPLOY_SLOT_IDS.includes(target.slotId as DeploySlotId);
}

function selectOccupiedBattlefieldSlot(
  state: BattleMutableState,
  side: BattleSide,
  zone: BattlefieldZone,
  battleCardId: string,
): BattleFieldCardLocation | null {
  if (zone === "reserve") {
    for (const slotId of RESERVE_SLOT_IDS) {
      const occupant = state.sides[side].reserve[slotId];

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

  for (const slotId of DEPLOY_SLOT_IDS) {
    const occupant = state.sides[side].deployed[slotId];

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
