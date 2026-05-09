import { ref, runTransaction, type Database } from "firebase/database";
import {
  DEPLOY_SLOT_IDS,
  RESERVE_SLOT_IDS,
  type BattleCardInstance,
  type BattleHistory,
  type BattleHistoryEntry,
  type BattleInit,
  type BattleMutableState,
  type BattleReducerTransition,
  type BattleSideMutableState,
  type DeploySlotId,
  type ReserveSlotId,
} from "../battle/types";
import { battleControllerReducer } from "../battle/state/controller";
import {
  redoBattleHistory,
  undoBattleHistory,
} from "../battle/state/history";
import { createBattleReducerState } from "../battle/state/reducer";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import { prepareInitialBattleState } from "../battle/engine/turn-flow";
import type { BattleCommand } from "../battle/debug/commands";
import type {
  SharedBattleReducerSlice,
  SharedBattleState,
} from "./battle-types";
import { battleStatePath } from "./battle-paths";
import { buildActionLogEntry } from "./action-log";
import { runRoomTransaction } from "./room-service";
import type { MultiplayerRoom } from "./room-types";

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
    phase: raw?.phase ?? "main",
    result: raw?.result ?? null,
    forcedResult: raw?.forcedResult ?? null,
    nextBattleCardOrdinal: raw?.nextBattleCardOrdinal ?? 0,
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
      payload: entry.metadata.payload ?? undefined,
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
    init: candidate.init as BattleInit,
    reducer: normalizeReducer(candidate.reducer),
  };
}

export interface EnsureBattleSessionInput {
  database: Database;
  roomId: string;
  init: BattleInit;
  initialMutable: BattleMutableState;
}

export async function ensureBattleSession(
  input: EnsureBattleSessionInput,
): Promise<void> {
  await runTransaction(
    ref(input.database, battleStatePath(input.roomId)),
    (current: SharedBattleState | null) => {
      if (current !== null && current.init !== undefined) {
        return current;
      }
      const fresh: SharedBattleState = {
        init: input.init,
        reducer: {
          mutable: input.initialMutable,
          history: { past: [], future: [] },
          lastTransition: null,
          commandSerial: 0,
        },
      };
      return fresh;
    },
  );
}

export interface ApplyBattleCommandInput {
  room: MultiplayerRoom;
  command: BattleCommand;
  now: string;
  actorId: string;
  actionId: string;
}

export function applyBattleCommandToRoom(
  input: ApplyBattleCommandInput,
): MultiplayerRoom {
  const { room, command, now, actorId, actionId } = input;
  if (room.battleState === null) {
    return room;
  }

  const reducerState = createBattleReducerState(
    room.battleState.reducer.mutable,
    room.battleState.reducer.history,
  );
  reducerState.lastTransition = room.battleState.reducer.lastTransition;

  const next = battleControllerReducer(
    reducerState,
    { type: "APPLY_COMMAND", command },
    room.battleState.init,
  );
  if (next === reducerState) {
    return room;
  }

  const lastEntry = next.history.past[next.history.past.length - 1];
  const actionLabel = lastEntry?.metadata.label ?? command.id;
  const nextSerial = room.battleState.reducer.commandSerial + 1;

  return {
    ...room,
    battleState: {
      init: room.battleState.init,
      reducer: {
        mutable: next.mutable,
        history: next.history,
        lastTransition: next.lastTransition,
        commandSerial: nextSerial,
      },
    },
    metadata: { ...room.metadata, updatedAt: now },
    actionLog: {
      ...(room.actionLog ?? {}),
      [actionId]: buildActionLogEntry({
        timestamp: now,
        actorId,
        action: `battle:${command.id}`,
        source: command.sourceSurface ?? "battle",
        summary: {
          commandLabel: actionLabel,
          commandSerial: nextSerial,
          ...summarizeCommand(command),
        },
      }),
    },
  };
}

function summarizeCommand(command: BattleCommand): Record<string, unknown> {
  const summary: Record<string, unknown> = {};
  if ("battleCardId" in command && command.battleCardId !== undefined) {
    summary.battleCardId = command.battleCardId;
  }
  if ("target" in command && command.target !== undefined) {
    summary.target = command.target;
  }
  if (command.id === "DEBUG_EDIT" && command.edit !== undefined) {
    summary.editKind = command.edit.kind;
  }
  if (command.id === "FORCE_RESULT") {
    summary.result = command.result;
  }
  return summary;
}

export interface DispatchBattleCommandInput {
  database: Database;
  roomId: string;
  command: BattleCommand;
  actorId: string;
  now?: string;
  actionId?: string;
}

export async function dispatchBattleCommandToRoom(
  input: DispatchBattleCommandInput,
): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const actionId = input.actionId ?? crypto.randomUUID();
  await runRoomTransaction(input.database, input.roomId, (room) => {
    if (room === null) return undefined;
    return applyBattleCommandToRoom({
      room,
      command: input.command,
      now,
      actorId: input.actorId,
      actionId,
    });
  });
}

export interface BattleHistoryNavInput {
  room: MultiplayerRoom;
  now: string;
  actorId: string;
  actionId: string;
}

export function undoBattleInRoom(input: BattleHistoryNavInput): MultiplayerRoom {
  return navigateBattleHistory(input, "undo");
}

export function redoBattleInRoom(input: BattleHistoryNavInput): MultiplayerRoom {
  return navigateBattleHistory(input, "redo");
}

function navigateBattleHistory(
  input: BattleHistoryNavInput,
  direction: "undo" | "redo",
): MultiplayerRoom {
  const { room, now, actorId, actionId } = input;
  if (room.battleState === null) return room;

  const result =
    direction === "undo"
      ? undoBattleHistory(room.battleState.reducer.history)
      : redoBattleHistory(room.battleState.reducer.history);

  if (result === null) return room;

  return {
    ...room,
    battleState: {
      init: room.battleState.init,
      reducer: {
        mutable: result.restored.mutable,
        history: result.history,
        lastTransition: result.restored.lastTransition,
        commandSerial: room.battleState.reducer.commandSerial + 1,
      },
    },
    metadata: { ...room.metadata, updatedAt: now },
    actionLog: {
      ...(room.actionLog ?? {}),
      [actionId]: buildActionLogEntry({
        timestamp: now,
        actorId,
        action: direction === "undo" ? "battle:UNDO" : "battle:REDO",
        source: "history",
        summary: {
          commandSerial: room.battleState.reducer.commandSerial + 1,
          restoredCommandLabel: result.entry.metadata.label,
        },
      }),
    },
  };
}

export async function dispatchBattleHistoryNav(input: {
  database: Database;
  roomId: string;
  direction: "undo" | "redo";
  actorId: string;
  now?: string;
  actionId?: string;
}): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const actionId = input.actionId ?? crypto.randomUUID();
  await runRoomTransaction(input.database, input.roomId, (room) => {
    if (room === null) return undefined;
    const next = (input.direction === "undo" ? undoBattleInRoom : redoBattleInRoom)({
      room,
      now,
      actorId: input.actorId,
      actionId,
    });
    return next;
  });
}

export function resetBattleInRoom(
  input: BattleHistoryNavInput,
): MultiplayerRoom {
  const { room, now, actorId, actionId } = input;
  if (room.battleState === null) return room;

  const init = room.battleState.init;
  const initial = prepareInitialBattleState(
    createInitialBattleState(init),
    init,
  ).state;

  return {
    ...room,
    battleState: {
      init,
      reducer: {
        mutable: initial,
        history: { past: [], future: [] },
        lastTransition: null,
        commandSerial: room.battleState.reducer.commandSerial + 1,
      },
    },
    metadata: { ...room.metadata, updatedAt: now },
    actionLog: {
      ...(room.actionLog ?? {}),
      [actionId]: buildActionLogEntry({
        timestamp: now,
        actorId,
        action: "battle:RESET",
        source: "battle",
        summary: {
          commandSerial: room.battleState.reducer.commandSerial + 1,
        },
      }),
    },
  };
}

export async function dispatchBattleReset(input: {
  database: Database;
  roomId: string;
  actorId: string;
  now?: string;
  actionId?: string;
}): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const actionId = input.actionId ?? crypto.randomUUID();
  await runRoomTransaction(input.database, input.roomId, (room) => {
    if (room === null) return undefined;
    return resetBattleInRoom({ room, now, actorId: input.actorId, actionId });
  });
}

export function applyClearForcedResultToRoom(input: {
  room: MultiplayerRoom;
  now: string;
  actorId: string;
  actionId: string;
}): MultiplayerRoom {
  const { room, now, actorId, actionId } = input;
  if (
    room.battleState === null ||
    room.battleState.reducer.mutable.forcedResult === null
  ) {
    return room;
  }
  const seeded = createBattleReducerState(
    room.battleState.reducer.mutable,
    room.battleState.reducer.history,
  );
  seeded.lastTransition = room.battleState.reducer.lastTransition;
  const next = battleControllerReducer(
    seeded,
    { type: "CLEAR_FORCED_RESULT" },
    room.battleState.init,
  );
  if (next === seeded) return room;
  const nextSerial = room.battleState.reducer.commandSerial + 1;
  return {
    ...room,
    battleState: {
      init: room.battleState.init,
      reducer: {
        mutable: next.mutable,
        history: next.history,
        lastTransition: next.lastTransition,
        commandSerial: nextSerial,
      },
    },
    metadata: { ...room.metadata, updatedAt: now },
    actionLog: {
      ...(room.actionLog ?? {}),
      [actionId]: buildActionLogEntry({
        timestamp: now,
        actorId,
        action: "battle:CLEAR_FORCED_RESULT",
        source: "auto-system",
        summary: { commandSerial: nextSerial },
      }),
    },
  };
}

export async function dispatchClearForcedResult(input: {
  database: Database;
  roomId: string;
  actorId: string;
  now?: string;
  actionId?: string;
}): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const actionId = input.actionId ?? crypto.randomUUID();
  await runRoomTransaction(input.database, input.roomId, (room) => {
    if (room === null) return undefined;
    return applyClearForcedResultToRoom({
      room,
      now,
      actorId: input.actorId,
      actionId,
    });
  });
}

export function clearBattleStateInRoom(input: {
  room: MultiplayerRoom;
  now: string;
}): MultiplayerRoom {
  if (input.room.battleState === null) {
    return input.room;
  }
  return {
    ...input.room,
    battleState: null,
    metadata: { ...input.room.metadata, updatedAt: input.now },
  };
}

export async function dispatchClearBattleState(input: {
  database: Database;
  roomId: string;
  now?: string;
}): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  await runRoomTransaction(input.database, input.roomId, (room) => {
    if (room === null) return undefined;
    return clearBattleStateInRoom({ room, now });
  });
}
