import type {
  BattleCardStatus,
  BattleHistory,
  BattleHistoryEntry,
  BattleHistoryEntryMetadata,
  BattleHistorySnapshot,
  BattleMutableState,
} from "../types";
import { cloneBattleMutableState } from "./create-initial-state";
import { cloneBattleReducerTransition } from "./transition";

export function createEmptyBattleHistory(): BattleHistory {
  return {
    past: [],
    future: [],
  };
}

export function commitBattleHistoryEntry(
  history: BattleHistory,
  metadata: BattleHistoryEntryMetadata,
  before: BattleHistorySnapshot,
  after: BattleHistorySnapshot,
): BattleHistory {
  const beforeSnapshot = cloneBattleHistorySnapshot(before);
  const afterSnapshot = cloneBattleHistorySnapshot(after);

  if (areBattleMutableStatesEqual(beforeSnapshot.mutable, afterSnapshot.mutable)) {
    return history;
  }

  return {
    past: [
      ...history.past,
      {
        metadata: { ...metadata },
        before: beforeSnapshot,
        after: afterSnapshot,
      },
    ],
    future: [],
  };
}

export function undoBattleHistory(
  history: BattleHistory,
): {
  history: BattleHistory;
  restored: BattleHistorySnapshot;
  entry: BattleHistoryEntry;
} | null {
  const entry = history.past[history.past.length - 1];
  if (entry === undefined) {
    return null;
  }

  return {
    history: {
      past: history.past.slice(0, -1),
      future: [cloneBattleHistoryEntry(entry), ...history.future],
    },
    restored: cloneBattleHistorySnapshot(entry.before),
    entry: cloneBattleHistoryEntry(entry),
  };
}

export function redoBattleHistory(
  history: BattleHistory,
): {
  history: BattleHistory;
  restored: BattleHistorySnapshot;
  entry: BattleHistoryEntry;
} | null {
  const entry = history.future[0];
  if (entry === undefined) {
    return null;
  }

  return {
    history: {
      past: [...history.past, cloneBattleHistoryEntry(entry)],
      future: history.future.slice(1),
    },
    restored: cloneBattleHistorySnapshot(entry.after),
    entry: cloneBattleHistoryEntry(entry),
  };
}

/**
 * Structural equality for `BattleMutableState`. Stringify-based equality
 * (bug-014) was sensitive to (a) `cardInstances` insertion order, so a
 * debug edit that re-inserts a card with identical data could trip false
 * inequality, (b) `undefined` values disappearing during serialisation, and
 * (c) O(|state|) cost on every commit. This walk compares only the
 * structurally significant fields without serialising undefined slots.
 */
function areBattleMutableStatesEqual(
  left: BattleMutableState,
  right: BattleMutableState,
): boolean {
  if (left === right) {
    return true;
  }
  if (
    left.battleId !== right.battleId ||
    left.activeSide !== right.activeSide ||
    left.turnNumber !== right.turnNumber ||
    left.phase !== right.phase ||
    left.result !== right.result ||
    left.forcedResult !== right.forcedResult ||
    left.dreamwellDeckIndex !== right.dreamwellDeckIndex ||
    left.nextBattleCardOrdinal !== right.nextBattleCardOrdinal
  ) {
    return false;
  }
  if (!areBattleSideStatesEqual(left.sides.player, right.sides.player)) {
    return false;
  }
  if (!areBattleSideStatesEqual(left.sides.enemy, right.sides.enemy)) {
    return false;
  }
  return areCardInstanceDictionariesEqual(
    left.cardInstances,
    right.cardInstances,
  );
}

function areBattleSideStatesEqual(
  left: BattleMutableState["sides"]["player"],
  right: BattleMutableState["sides"]["player"],
): boolean {
  if (
    left.currentEnergy !== right.currentEnergy ||
    left.maxEnergy !== right.maxEnergy ||
    left.score !== right.score ||
    left.fatigueCount !== right.fatigueCount ||
    left.dreamwellCardIndex !== right.dreamwellCardIndex ||
    left.dreamwellDrawnTurn !== right.dreamwellDrawnTurn
  ) {
    return false;
  }
  if (!areStringArraysEqual(left.deck, right.deck)) return false;
  if (!areStringArraysEqual(left.hand, right.hand)) return false;
  if (!areStringArraysEqual(left.void, right.void)) return false;
  if (!areStringArraysEqual(left.banished, right.banished)) return false;
  for (const slotId of Object.keys(left.backRank)) {
    if (left.backRank[slotId as keyof typeof left.backRank] !==
      right.backRank[slotId as keyof typeof right.backRank]) {
      return false;
    }
  }
  for (const slotId of Object.keys(left.frontRank)) {
    if (left.frontRank[slotId as keyof typeof left.frontRank] !==
      right.frontRank[slotId as keyof typeof right.frontRank]) {
      return false;
    }
  }
  return true;
}

function areStringArraysEqual(
  left: readonly string[],
  right: readonly string[],
): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function areCardInstanceDictionariesEqual(
  left: BattleMutableState["cardInstances"],
  right: BattleMutableState["cardInstances"],
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  for (const key of leftKeys) {
    const leftInstance = left[key];
    const rightInstance = right[key];
    if (rightInstance === undefined) {
      return false;
    }
    if (
      leftInstance.battleCardId !== rightInstance.battleCardId ||
      leftInstance.owner !== rightInstance.owner ||
      leftInstance.controller !== rightInstance.controller ||
      !figmentsEqual(leftInstance.figments, rightInstance.figments) ||
      leftInstance.sparkDelta !== rightInstance.sparkDelta ||
      leftInstance.staticSparkBonus !== rightInstance.staticSparkBonus ||
      leftInstance.isRevealedToPlayer !== rightInstance.isRevealedToPlayer ||
      leftInstance.markers.isPrevented !== rightInstance.markers.isPrevented ||
      leftInstance.markers.isCopied !== rightInstance.markers.isCopied ||
      !statusEqual(leftInstance.status, rightInstance.status) ||
      leftInstance.notes.length !== rightInstance.notes.length ||
      leftInstance.definition.name !== rightInstance.definition.name ||
      leftInstance.definition.printedSpark !== rightInstance.definition.printedSpark ||
      leftInstance.definition.energyCost !== rightInstance.definition.energyCost ||
      leftInstance.definition.battleCardKind !== rightInstance.definition.battleCardKind
    ) {
      return false;
    }
    // Compare notes by noteId + text + expiry.kind (timestamp/turn metadata
    // are already captured by the definition/markers but noteId is enough
    // to distinguish add/dismiss/clear states).
    for (let i = 0; i < leftInstance.notes.length; i += 1) {
      const l = leftInstance.notes[i];
      const r = rightInstance.notes[i];
      if (
        l.noteId !== r.noteId ||
        l.text !== r.text ||
        l.expiry.kind !== r.expiry.kind
      ) {
        return false;
      }
    }
  }
  return true;
}

/**
 * Compares the full per-instance status so a status-only edit (e.g. the Dawn
 * exhaust-clear) registers as a real change and is committed to history rather
 * than collapsed into a no-op.
 */
function statusEqual(left: BattleCardStatus, right: BattleCardStatus): boolean {
  return (
    left.isExhausted === right.isExhausted &&
    left.counters === right.counters &&
    left.reclaimed === right.reclaimed &&
    left.offering === right.offering &&
    left.ephemeral === right.ephemeral &&
    left.veil === right.veil &&
    left.grantedUnstoppable === right.grantedUnstoppable &&
    left.grantedVengeful === right.grantedVengeful &&
    left.grantedPreeminence === right.grantedPreeminence &&
    left.grantedAwakened === right.grantedAwakened
  );
}

function figmentsEqual(
  left: readonly number[] | undefined,
  right: readonly number[] | undefined,
): boolean {
  const leftValues = left ?? [];
  const rightValues = right ?? [];
  if (leftValues.length !== rightValues.length) {
    return false;
  }
  for (let i = 0; i < leftValues.length; i += 1) {
    if (leftValues[i] !== rightValues[i]) {
      return false;
    }
  }
  return true;
}

function cloneBattleHistoryEntry(entry: BattleHistoryEntry): BattleHistoryEntry {
  return {
    metadata: { ...entry.metadata },
    before: cloneBattleHistorySnapshot(entry.before),
    after: cloneBattleHistorySnapshot(entry.after),
  };
}

function cloneBattleHistorySnapshot(
  snapshot: BattleHistorySnapshot,
): BattleHistorySnapshot {
  return {
    mutable: cloneBattleMutableState(snapshot.mutable),
    lastTransition: cloneBattleReducerTransition(snapshot.lastTransition),
  };
}

// `cloneBattleReducerTransition` imported from ./transition (bug-016).
