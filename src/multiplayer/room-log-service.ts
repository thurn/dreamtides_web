import {
  get,
  push,
  ref,
  runTransaction,
  update,
  type Database,
} from "firebase/database";
import type { LogEntry } from "../logging";
import { createBufferedLogSink, type LogSink } from "./log-sink";
import { roomLogsPath } from "./room-paths";

/**
 * Most recent entries retained per room. Log volume is unbounded (a single
 * battle emits thousands of `battle_proto_*` events), so the persisted node is
 * trimmed to the newest {@link ROOM_LOG_LIMIT} entries. Push keys sort
 * chronologically, so "newest" is simply the lexicographically largest keys.
 */
export const ROOM_LOG_LIMIT = 2000;

/**
 * How many entries may accumulate beyond {@link ROOM_LOG_LIMIT} before a prune
 * rewrites the node. Pruning downloads the whole node, so this slack keeps that
 * cost amortized rather than paying it on every flush.
 */
export const ROOM_LOG_PRUNE_SLACK = 200;

/**
 * Persisted log entries keyed by push id. Values are single-line JSON strings
 * (one serialized {@link LogEntry} each) so arbitrary entry shapes round-trip
 * through Realtime Database without tripping its forbidden-key, dropped-empty,
 * or numeric-array-coercion rules.
 */
export type RoomLogEntries = Record<string, string>;

/**
 * Keep only the newest `limit` entries, ordered by push key (chronological).
 * Pure so the bound is unit-testable without a live database.
 */
export function pruneLogEntries(
  entries: RoomLogEntries,
  limit: number = ROOM_LOG_LIMIT,
): RoomLogEntries {
  return Object.fromEntries(
    Object.entries(entries)
      .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
      .slice(-limit),
  );
}

/**
 * Append a batch of entries to a room's log node under fresh push keys, each
 * value the entry serialized to a single-line JSON string. Returns the number
 * of entries written.
 */
export async function appendRoomLogEntries(
  database: Database,
  roomId: string,
  entries: ReadonlyArray<Readonly<LogEntry>>,
): Promise<number> {
  if (entries.length === 0) {
    return 0;
  }
  const logsRef = ref(database, roomLogsPath(roomId));
  const updateMap: Record<string, string> = {};
  for (const entry of entries) {
    const key = push(logsRef).key;
    if (key === null) {
      continue;
    }
    updateMap[key] = JSON.stringify(entry);
  }
  await update(logsRef, updateMap);
  return Object.keys(updateMap).length;
}

/**
 * Trim a room's log node to {@link ROOM_LOG_LIMIT} entries, but only rewrite it
 * once it has grown past `limit + slack` — a single transaction whose callback
 * aborts cheaply while the node is within the slack window.
 */
export async function pruneRoomLog(
  database: Database,
  roomId: string,
  limit: number = ROOM_LOG_LIMIT,
  slack: number = ROOM_LOG_PRUNE_SLACK,
): Promise<void> {
  await runTransaction(
    ref(database, roomLogsPath(roomId)),
    (current: RoomLogEntries | null) => {
      const entries = current ?? {};
      if (Object.keys(entries).length <= limit + slack) {
        return current;
      }
      return pruneLogEntries(entries, limit);
    },
  );
}

/**
 * Read a room's persisted log back as parsed entries, ordered chronologically
 * by push key. Lines that fail to parse are skipped so one corrupt write never
 * blanks the whole viewer.
 */
export async function readRoomLog(
  database: Database,
  roomId: string,
): Promise<ReadonlyArray<Readonly<LogEntry>>> {
  const snapshot = await get(ref(database, roomLogsPath(roomId)));
  if (!snapshot.exists()) {
    return [];
  }
  const raw = snapshot.val() as RoomLogEntries | null;
  if (raw === null || typeof raw !== "object") {
    return [];
  }
  const entries: Array<Readonly<LogEntry>> = [];
  for (const [, value] of Object.entries(raw).sort(([leftKey], [rightKey]) =>
    leftKey.localeCompare(rightKey),
  )) {
    if (typeof value !== "string") {
      continue;
    }
    try {
      entries.push(JSON.parse(value) as LogEntry);
    } catch {
      // Skip an unparseable line rather than failing the whole read.
    }
  }
  return entries;
}

/**
 * Build a {@link LogSink} that mirrors {@link logEvent} output into a room's
 * Realtime Database log node, batching writes and pruning to the newest
 * {@link ROOM_LOG_LIMIT} entries. Persistence is best-effort: a failed flush is
 * logged and dropped so logging never wedges gameplay.
 */
export function createRoomLogSink(
  database: Database,
  roomId: string,
  limit: number = ROOM_LOG_LIMIT,
  slack: number = ROOM_LOG_PRUNE_SLACK,
): LogSink {
  let appendedSinceLastPrune = 0;
  return createBufferedLogSink({
    flush: async (entries) => {
      const written = await appendRoomLogEntries(database, roomId, entries);
      appendedSinceLastPrune += written;
      if (appendedSinceLastPrune >= slack) {
        appendedSinceLastPrune = 0;
        await pruneRoomLog(database, roomId, limit, slack);
      }
    },
  });
}
