import type { QuestState } from "../types/quest";
import type { SharedBattleState } from "./battle-types";

export const ROOM_SCHEMA_VERSION = 2;
export const ACTION_LOG_LIMIT = 50;

export interface RoomMetadata {
  schemaVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface PresenceEntry {
  connected: boolean;
  lastSeenAt: string;
}

export interface ActionLogEntry {
  timestamp: string;
  actorId: string;
  action: string;
  source: string;
  summary: Record<string, unknown>;
}

export interface MultiplayerRoom {
  metadata: RoomMetadata;
  questState: QuestState | null;
  battleState: SharedBattleState | null;
  presence?: Record<string, PresenceEntry>;
  actionLog?: Record<string, ActionLogEntry>;
}

export interface RoomSession {
  roomId: string;
  clientId: string;
  room: MultiplayerRoom;
}

export type RoomLoadState =
  | { status: "idle" }
  | { status: "loading"; roomId: string }
  | { status: "missing"; roomId: string }
  | { status: "ready"; session: RoomSession }
  | { status: "error"; message: string };
