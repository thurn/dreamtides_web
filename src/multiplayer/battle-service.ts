import type { Database } from "firebase/database";
import type {
  BattleHistory,
  BattleInit,
  BattleMutableState,
  BattleReducerTransition,
} from "../battle/types";
import { battleControllerReducer } from "../battle/state/controller";
import { createBattleReducerState } from "../battle/state/reducer";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import type { BattleCommand } from "../battle/debug/commands";
import { buildActionLogEntry } from "./action-log";
import { runRoomTransaction } from "./room-service";
import type { MultiplayerRoom } from "./room-types";

/**
 * The undo/redo history is NOT synced through Firebase: it stores a full
 * before/after state snapshot per move and grows without bound, so persisting it
 * re-serialized and re-hashed the entire (multi-megabyte) tree on every command,
 * which froze the battle UI as a game developed. Each client keeps its own
 * history locally (see {@link MultiplayerBattleProvider}); the room carries only
 * the live state, so every persisted reducer slice writes this empty history.
 */
const EMPTY_SHARED_HISTORY: BattleHistory = { past: [], future: [] };

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
        // History stays client-local; never persist the growing snapshot stack.
        history: EMPTY_SHARED_HISTORY,
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

/**
 * The state an undo/redo restored, computed CLIENT-SIDE against the client's
 * local history (which is never synced). Persisting this snapshot is what makes
 * the navigation visible to a reload or another client, without round-tripping
 * the whole history stack through Firebase.
 */
export interface BattleHistorySnapshot {
  mutable: BattleMutableState;
  lastTransition: BattleReducerTransition | null;
  /** Label of the move the navigation restored, for the action log (or null). */
  restoredCommandLabel: string | null;
}

export interface BattleHistoryNavInput {
  room: MultiplayerRoom;
  direction: "undo" | "redo";
  restored: BattleHistorySnapshot;
  now: string;
  actorId: string;
  actionId: string;
}

/**
 * Writes a client-computed undo/redo {@link BattleHistorySnapshot} into the room
 * as the new live state: the restored `mutable`/`lastTransition`, an empty
 * (client-local) history, a bumped command serial, and the navigation's activity
 * kind. The client decides WHICH state to restore from its own history; the room
 * only records the result.
 */
export function applyBattleHistoryNavToRoom(
  input: BattleHistoryNavInput,
): MultiplayerRoom {
  const { room, direction, restored, now, actorId, actionId } = input;
  if (room.battleState === null) return room;

  const nextSerial = room.battleState.reducer.commandSerial + 1;

  return {
    ...room,
    battleState: {
      init: room.battleState.init,
      reducer: {
        mutable: restored.mutable,
        history: EMPTY_SHARED_HISTORY,
        lastTransition: restored.lastTransition,
        commandSerial: nextSerial,
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
          commandSerial: nextSerial,
          ...(restored.restoredCommandLabel === null
            ? {}
            : { restoredCommandLabel: restored.restoredCommandLabel }),
        },
      }),
    },
  };
}

export async function dispatchBattleHistoryNav(input: {
  database: Database;
  roomId: string;
  direction: "undo" | "redo";
  restored: BattleHistorySnapshot;
  actorId: string;
  now?: string;
  actionId?: string;
}): Promise<void> {
  const now = input.now ?? new Date().toISOString();
  const actionId = input.actionId ?? crypto.randomUUID();
  await runRoomTransaction(input.database, input.roomId, (room) => {
    if (room === null) return undefined;
    return applyBattleHistoryNavToRoom({
      room,
      direction: input.direction,
      restored: input.restored,
      now,
      actorId: input.actorId,
      actionId,
    });
  });
}

export interface BattleRoomMutationInput {
  room: MultiplayerRoom;
  now: string;
  actorId: string;
  actionId: string;
}

export function resetBattleInRoom(
  input: BattleRoomMutationInput,
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
        history: EMPTY_SHARED_HISTORY,
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
