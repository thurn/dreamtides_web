import {
  onDisconnect,
  onValue,
  ref,
  runTransaction,
  set,
  update,
  type Database,
  type Unsubscribe,
} from "firebase/database";
import { pruneActionLog } from "./action-log";
import { presencePath, roomPath, type FirebaseUpdateMap } from "./room-paths";
import {
  ACTION_LOG_LIMIT,
  ROOM_SCHEMA_VERSION,
  type ActionLogEntry,
  type MultiplayerRoom,
  type PresenceEntry,
  type RoomMetadata,
} from "./room-types";
import type { QuestState } from "../types/quest";

export type RoomSubscriptionSnapshot =
  | { status: "ready"; room: MultiplayerRoom }
  | { status: "missing" }
  | { status: "error"; message: string };

function normalizeQuestState(questState: QuestState | null | undefined): QuestState | null {
  if (questState === null || questState === undefined) {
    return null;
  }

  return {
    ...questState,
    siteRuntime: questState.siteRuntime ?? {},
  };
}

function normalizeRoomSnapshot(room: MultiplayerRoom): MultiplayerRoom {
  return {
    ...room,
    questState: normalizeQuestState(room.questState),
    presence: room.presence ?? {},
    actionLog: room.actionLog ?? {},
  };
}

export function createRoomRecord(nowIso: string = new Date().toISOString()): MultiplayerRoom {
  const metadata: RoomMetadata = {
    schemaVersion: ROOM_SCHEMA_VERSION,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return {
    metadata,
    questState: null,
    presence: {},
    actionLog: {},
  };
}

export async function createRoom(
  database: Database,
  roomId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  await set(ref(database, roomPath(roomId)), createRoomRecord(nowIso));
}

export function subscribeToRoom(
  database: Database,
  roomId: string,
  listener: (snapshot: RoomSubscriptionSnapshot) => void,
): Unsubscribe {
  return onValue(
    ref(database, roomPath(roomId)),
    (snapshot) => {
      if (!snapshot.exists()) {
        listener({ status: "missing" });
        return;
      }

      listener({ status: "ready", room: normalizeRoomSnapshot(snapshot.val() as MultiplayerRoom) });
    },
    (error) => {
      listener({ status: "error", message: error.message });
    },
  );
}

export async function writeRoomUpdate(
  database: Database,
  updateMap: FirebaseUpdateMap,
): Promise<void> {
  await update(ref(database), updateMap);
}

export async function pruneRoomActionLog(
  database: Database,
  roomId: string,
  limit: number = ACTION_LOG_LIMIT,
): Promise<void> {
  await runTransaction(ref(database, `${roomPath(roomId)}/actionLog`), (current) => {
    const actionLog = (current ?? {}) as Record<string, ActionLogEntry>;
    if (Object.keys(actionLog).length <= limit + 10) {
      return current;
    }

    return pruneActionLog(actionLog, limit);
  });
}

export async function runRoomTransaction(
  database: Database,
  roomId: string,
  updater: (current: MultiplayerRoom | null) => MultiplayerRoom | null | undefined,
): Promise<void> {
  await runTransaction(ref(database, roomPath(roomId)), (current) => {
    const next = updater(current as MultiplayerRoom | null);
    return next === undefined ? current : next;
  });
}

export async function writePresence(
  database: Database,
  roomId: string,
  clientId: string,
  nowIso: string = new Date().toISOString(),
): Promise<void> {
  const entryRef = ref(database, presencePath(roomId, clientId));
  const entry: PresenceEntry = { connected: true, lastSeenAt: nowIso };

  await onDisconnect(entryRef).remove();
  await set(entryRef, entry);
}
