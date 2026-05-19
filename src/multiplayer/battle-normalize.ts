import {
  DEPLOY_SLOT_IDS,
  RESERVE_SLOT_IDS,
  type BattleCardInstance,
  type BattleHistory,
  type BattleHistoryEntry,
  type BattleMutableState,
  type BattleReducerTransition,
  type BattleSideMutableState,
  type DeploySlotId,
  type ReserveSlotId,
} from "../battle/types";
import type {
  SharedBattleReducerSlice,
  SharedBattleState,
} from "./battle-types";

function defaultReserveSlots(): Record<ReserveSlotId, string | null> {
  const slots = {} as Record<ReserveSlotId, string | null>;
  for (const id of RESERVE_SLOT_IDS) {
    slots[id] = null;
  }
  return slots;
}

function defaultDeploySlots(): Record<DeploySlotId, string | null> {
  const slots = {} as Record<DeploySlotId, string | null>;
  for (const id of DEPLOY_SLOT_IDS) {
    slots[id] = null;
  }
  return slots;
}

function normalizeSide(
  raw: Partial<BattleSideMutableState> | undefined,
): BattleSideMutableState {
  return {
    currentEnergy: raw?.currentEnergy ?? 0,
    maxEnergy: raw?.maxEnergy ?? 0,
    score: raw?.score ?? 0,
    pendingExtraTurns: raw?.pendingExtraTurns ?? 0,
    exhaustionPenaltyNext: raw?.exhaustionPenaltyNext ?? 5,
    exhaustionPenaltyAppliedThisTurn: raw?.exhaustionPenaltyAppliedThisTurn ?? false,
    visibility: raw?.visibility ?? {},
    deck: raw?.deck ?? [],
    hand: raw?.hand ?? [],
    void: raw?.void ?? [],
    banished: raw?.banished ?? [],
    reserve: { ...defaultReserveSlots(), ...(raw?.reserve ?? {}) },
    deployed: { ...defaultDeploySlots(), ...(raw?.deployed ?? {}) },
  };
}

function normalizeCardInstance(
  raw: BattleCardInstance,
): BattleCardInstance {
  return {
    ...raw,
    notes: raw.notes ?? [],
    definition: {
      ...raw.definition,
      timing: raw.definition.timing ?? (raw.definition.isFast ? "fast" : "standard"),
      tides: raw.definition.tides ?? [],
    },
  };
}

function normalizeMutable(
  raw: Partial<BattleMutableState> | undefined,
): BattleMutableState {
  const cardInstances: Record<string, BattleCardInstance> = {};
  const rawInstances = raw?.cardInstances ?? {};
  for (const [id, instance] of Object.entries(rawInstances)) {
    cardInstances[id] = normalizeCardInstance(instance);
  }
  return {
    battleId: raw?.battleId ?? "",
    activeSide: raw?.activeSide ?? "player",
    turnNumber: raw?.turnNumber ?? 1,
    phase: raw?.phase ?? "day",
    result: raw?.result ?? null,
    forcedResult: raw?.forcedResult ?? null,
    nextBattleCardOrdinal: raw?.nextBattleCardOrdinal ?? 0,
    nextStackEntryOrdinal: raw?.nextStackEntryOrdinal ?? 1,
    stack: raw?.stack ?? [],
    sides: {
      player: normalizeSide(raw?.sides?.player),
      enemy: normalizeSide(raw?.sides?.enemy),
    },
    cardInstances,
  };
}

function normalizeHistoryEntry(entry: BattleHistoryEntry): BattleHistoryEntry {
  return {
    metadata: {
      ...entry.metadata,
      targets: entry.metadata.targets ?? [],
      // `payload` is genuinely optional on `BattleHistoryEntryMetadata`. RTDB
      // strips empty objects on write, so a round-tripped entry can arrive
      // here with no `payload` key at all. Assigning `payload: undefined`
      // would re-introduce the field with an undefined value, and Firebase's
      // `runTransaction` validator rejects any returned tree containing
      // `undefined`. Omit the key entirely when the source value is missing.
      ...(entry.metadata.payload !== undefined
        ? { payload: entry.metadata.payload }
        : {}),
      undoPayload: entry.metadata.undoPayload ?? null,
    },
    before: {
      mutable: normalizeMutable(entry.before.mutable),
      lastTransition: normalizeTransition(entry.before.lastTransition ?? null),
    },
    after: {
      mutable: normalizeMutable(entry.after.mutable),
      lastTransition: normalizeTransition(entry.after.lastTransition ?? null),
    },
  };
}

function normalizeHistory(history: BattleHistory | undefined): BattleHistory {
  return {
    past: (history?.past ?? []).map(normalizeHistoryEntry),
    future: (history?.future ?? []).map(normalizeHistoryEntry),
  };
}

function normalizeTransition(
  transition: BattleReducerTransition | null,
): BattleReducerTransition | null {
  if (transition === null) return null;
  return {
    ...transition,
    steps: transition.steps ?? [],
    energyChanges: transition.energyChanges ?? [],
    judgment: transition.judgment ?? null,
    scoreChanges: transition.scoreChanges ?? [],
    resultChange: transition.resultChange ?? null,
    aiChoices: transition.aiChoices ?? [],
    logEvents: transition.logEvents ?? [],
    metadata: {
      ...transition.metadata,
      targets: transition.metadata.targets ?? [],
      undoPayload: transition.metadata.undoPayload ?? null,
    },
  };
}

function normalizeReducer(
  raw: Partial<SharedBattleReducerSlice> | undefined,
): SharedBattleReducerSlice {
  return {
    mutable: normalizeMutable(raw?.mutable),
    history: normalizeHistory(raw?.history),
    lastTransition: normalizeTransition(raw?.lastTransition ?? null),
    commandSerial: raw?.commandSerial ?? 0,
    lastActivityKind: raw?.lastActivityKind ?? null,
  };
}

export function normalizeBattleStateSnapshot(
  raw: unknown,
): SharedBattleState | null {
  if (raw === null || raw === undefined) {
    return null;
  }
  const candidate = raw as Partial<SharedBattleState>;
  if (candidate.init === undefined || candidate.init === null) {
    return null;
  }
  return {
    init: candidate.init,
    reducer: normalizeReducer(candidate.reducer),
  };
}
