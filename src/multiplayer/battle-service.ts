import type { Database } from "firebase/database";
import type {
  BattleInit,
  BattleMutableState,
} from "../battle/types";
import { battleControllerReducer } from "../battle/state/controller";
import {
  redoBattleHistory,
  undoBattleHistory,
} from "../battle/state/history";
import { createBattleReducerState } from "../battle/state/reducer";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import type { BattleCommand } from "../battle/debug/commands";
import { buildActionLogEntry } from "./action-log";
import { runRoomTransaction } from "./room-service";
import type { MultiplayerRoom } from "./room-types";

export interface EnsureBattleSessionInput {
  database: Database;
  roomId: string;
  init: BattleInit;
  initialMutable: BattleMutableState;
  actorId: string;
  now?: string;
  actionId?: string;
}

export async function ensureBattleSession(
  input: EnsureBattleSessionInput,
): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const actionId = input.actionId ?? crypto.randomUUID();
  await runRoomTransaction(input.database, input.roomId, (room) => {
    if (room === null) return undefined;
    if (room.battleState !== null && room.battleState.init !== undefined) {
      return room;
    }
    return {
      ...room,
      battleState: {
        init: input.init,
        reducer: {
          mutable: input.initialMutable,
          history: { past: [], future: [] },
          lastTransition: null,
          commandSerial: 0,
          lastActivityKind: null,
        },
      },
      metadata: { ...room.metadata, updatedAt: now },
      actionLog: {
        ...(room.actionLog ?? {}),
        [actionId]: buildActionLogEntry({
          timestamp: now,
          actorId: input.actorId,
          action: "battle:INIT",
          source: "battle",
          summary: { commandSerial: 0 },
        }),
      },
    };
  });
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
        lastActivityKind: "command",
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
        lastActivityKind: direction,
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
  const initial = createInitialBattleState(init);

  return {
    ...room,
    battleState: {
      init,
      reducer: {
        mutable: initial,
        history: { past: [], future: [] },
        lastTransition: null,
        commandSerial: room.battleState.reducer.commandSerial + 1,
        lastActivityKind: "command",
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
        lastActivityKind: "command",
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
