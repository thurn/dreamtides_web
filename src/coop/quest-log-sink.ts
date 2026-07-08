// Quest-log sink for the coop event-sourcing client.
//
// Two responsibilities, one install:
//
//  1. A best-effort buffered mirror that appends every `logEvent` entry (draft
//     pool construction, battle protos, dream-journey offers, ...) into the
//     room's `rooms/{id}/logs` node as single-line JSON, so a production run's
//     log survives the playing tab closing and can be read back from
//     `?viewLogs=<roomId>`. The mirror batches writes and prunes the node to
//     the newest `ROOM_LOG_LIMIT` entries.
//
//  2. The three coop record helpers (`recordCoopEvent`, `recordBounce`,
//     `recordDivergence`) the CoopProvider (Task 25) wires to the LogClient
//     callbacks. These write the exact spec shapes DIRECTLY into the same
//     `logs/` buffer. They are written directly rather than through `logEvent`
//     because each coop event carries its own log-node `seq`, and `logEvent`
//     reserves `seq` for its per-session line counter (see src/logging.ts) —
//     routing through it would strip the true seq that reconstruction needs.
//
// Single-writer rule (spec §Logging and observability): each client mirrors
// ONLY the events it appended — its own actor plus its `ai:<clientId>` actor —
// tracked past a high-water seq so a refold after reconnect or compaction never
// re-mirrors. Every event has exactly one appender, so the union across clients
// is complete with no duplicates. Divergence reports are the exception: any
// observing client logs those, stamped with its own clientId.
//
// See docs/superpowers/specs/2026-07-01-coop-event-sourcing-rewrite-design.md
// §"Client layer" and §"Logging and observability".

import { get, push, ref, runTransaction, update, type Database } from "firebase/database";
import type { LogEntry, LogSink } from "../logging";
import { clearLogContext, setLogContext, setLogSink } from "../logging";
import type { EventOutcome, GameEvent } from "../eventlog/types";

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/**
 * Most recent entries retained per room. Coop log volume is unbounded (a single
 * battle emits thousands of `battle_proto_*` events plus a `coop_event` per
 * confirmed intent), so the persisted node is trimmed to the newest
 * {@link ROOM_LOG_LIMIT} entries. Push keys sort chronologically, so "newest"
 * is simply the lexicographically largest keys.
 */
export const ROOM_LOG_LIMIT = 2000;

/**
 * How many entries may accumulate beyond {@link ROOM_LOG_LIMIT} before a prune
 * rewrites the node. Pruning downloads the whole node, so this slack keeps that
 * cost amortized rather than paying it on every flush.
 */
export const ROOM_LOG_PRUNE_SLACK = 200;

const DEFAULT_FLUSH_DELAY_MS = 4000;
const DEFAULT_MAX_BUFFERED_ENTRIES = 150;

/** RTDB path holding a room's persisted JSONL sink. */
export function roomLogsPath(roomId: string): string {
  return `rooms/${roomId}/logs`;
}

/**
 * A single record buffered for the sink: any JSON-serializable object. Both the
 * `logEvent` mirror (a {@link LogEntry}) and the coop shapes flow through here.
 */
export type SinkRecord = Readonly<Record<string, unknown>>;

/** Persisted log entries keyed by push id; each value one serialized record. */
export type RoomLogEntries = Record<string, string>;

// ---------------------------------------------------------------------------
// Pure prune (unbounded-growth guard)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// RTDB transport
// ---------------------------------------------------------------------------

/**
 * Append a batch of records to a room's `logs/` node under fresh push keys,
 * each value the record serialized to a single-line JSON string. Returns the
 * number of records written.
 */
export async function appendRoomLogEntries(
  database: Database,
  roomId: string,
  entries: ReadonlyArray<SinkRecord>,
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
 * Trim a room's `logs/` node to `limit` entries, but only rewrite it once it
 * has grown past `limit + slack` — a single transaction whose callback aborts
 * cheaply while the node is within the slack window.
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
 * Read a room's persisted JSONL sink back as raw single-line JSON strings,
 * ordered chronologically by push key. Non-string values are skipped.
 */
export async function readRoomLogLines(
  database: Database,
  roomId: string,
): Promise<string[]> {
  const snapshot = await get(ref(database, roomLogsPath(roomId)));
  if (!snapshot.exists()) {
    return [];
  }
  const raw = snapshot.val() as RoomLogEntries | null;
  if (raw === null || typeof raw !== "object") {
    return [];
  }
  return Object.entries(raw)
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([, value]) => value)
    .filter((value): value is string => typeof value === "string");
}

// ---------------------------------------------------------------------------
// Buffered sink
// ---------------------------------------------------------------------------

/**
 * A batching sink for {@link SinkRecord} values. {@link BufferedSink.record} is
 * fire-and-forget and never blocks; records accumulate in memory and flush
 * through the injected writer when the buffer reaches `maxBufferedEntries`,
 * after `flushDelayMs` of quiet, on {@link BufferedSink.flushNow}, and one final
 * time on {@link BufferedSink.dispose}. The writer is injected so the RTDB
 * transport can be unit-tested with a fake.
 */
export interface BufferedSink {
  record(entry: SinkRecord): void;
  flushNow(): Promise<void>;
  dispose(): Promise<void>;
}

export interface BufferedSinkOptions {
  /** Persists one batch, in record order. Rejections go to `onError`; the batch is dropped. */
  flush: (entries: ReadonlyArray<SinkRecord>) => Promise<void>;
  flushDelayMs?: number;
  maxBufferedEntries?: number;
  onError?: (error: unknown) => void;
}

export function createBufferedSink(options: BufferedSinkOptions): BufferedSink {
  const flushDelayMs = options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS;
  const maxBufferedEntries = options.maxBufferedEntries ?? DEFAULT_MAX_BUFFERED_ENTRIES;
  const onError =
    options.onError ??
    ((error: unknown) => {
      console.error("Failed to persist coop log entries", error);
    });

  let buffer: Array<SinkRecord> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Serializes flushes so a slow writer never interleaves two batches (which
  // would let a later batch persist before an earlier one).
  let inFlight: Promise<void> = Promise.resolve();
  let disposed = false;

  function clearTimer(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function drain(): Promise<void> {
    clearTimer();
    if (buffer.length === 0) {
      return inFlight;
    }
    const batch = buffer;
    buffer = [];
    inFlight = inFlight
      .then(() => options.flush(batch))
      .catch((error: unknown) => {
        onError(error);
      });
    return inFlight;
  }

  return {
    record(entry: SinkRecord): void {
      if (disposed) {
        return;
      }
      buffer.push(entry);
      if (buffer.length >= maxBufferedEntries) {
        void drain();
        return;
      }
      if (timer === null) {
        timer = setTimeout(() => {
          timer = null;
          void drain();
        }, flushDelayMs);
      }
    },
    flushNow(): Promise<void> {
      return drain();
    },
    dispose(): Promise<void> {
      disposed = true;
      return drain();
    },
  };
}

/**
 * Build a {@link BufferedSink} that mirrors records into a room's `logs/` node,
 * batching writes and pruning to the newest {@link ROOM_LOG_LIMIT} entries.
 * Persistence is best-effort: a failed flush is logged and dropped so logging
 * never wedges gameplay.
 */
export function createRoomLogSink(
  database: Database,
  roomId: string,
  limit: number = ROOM_LOG_LIMIT,
  slack: number = ROOM_LOG_PRUNE_SLACK,
): BufferedSink {
  let appendedSinceLastPrune = 0;
  return createBufferedSink({
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

// ---------------------------------------------------------------------------
// Coop record helpers (single-writer)
// ---------------------------------------------------------------------------

/** The exact `coop_event` log shape (spec §Logging). */
export interface CoopEventRecord {
  event: "coop_event";
  seq: number;
  type: string;
  actor: string;
  outcome: EventOutcome;
  stateHashAfter?: string;
  gameId: string;
}

/** The exact `event_bounced` log shape (spec §Logging). */
export interface EventBouncedRecord {
  event: "event_bounced";
  seq: number;
  interveningSeqs: number[];
  gameId: string;
}

/** The exact `fold_divergence` log shape (spec §Logging). */
export interface FoldDivergenceRecord {
  event: "fold_divergence";
  seq: number;
  expected: string;
  actual: string;
  clientId: string;
  gameId: string;
}

export interface CoopLogRecorderOptions {
  gameId: string;
  /** This client's actor id. Owns its own actor plus `ai:<clientId>`. */
  clientId: string;
  /** Where shaped records are emitted. In production, the room `logs/` buffer. */
  emit: (record: SinkRecord) => void;
}

/**
 * The record surface the CoopProvider wires to the LogClient callbacks:
 * `onEventOutcome` -> {@link recordCoopEvent} (and {@link recordBounce} for its
 * own bounces), `onDivergence` -> {@link recordDivergence}.
 */
export interface CoopLogRecorder {
  /**
   * Mirror a confirmed event's outcome IF this client appended it and it has
   * not already been mirrored (high-water). Returns whether it was recorded so
   * the caller can gate a follow-up {@link recordBounce} on ownership.
   */
  recordCoopEvent(event: GameEvent, seq: number, outcome: EventOutcome): boolean;
  /** Mirror this client's own bounce with the seqs that intervened. */
  recordBounce(seq: number, interveningSeqs: readonly number[]): void;
  /** Mirror a fold divergence observed at `seq` (any client, stamped with clientId). */
  recordDivergence(info: { seq: number; expected: string; actual: string }): void;
}

export function createCoopLogRecorder(options: CoopLogRecorderOptions): CoopLogRecorder {
  const { gameId, clientId, emit } = options;
  const aiActor = `ai:${clientId}`;
  // Highest seq this client has already mirrored. A refold after reconnect or
  // compaction re-reports every confirmed outcome; the high-water makes those
  // re-reports no-ops so the union across clients stays duplicate-free.
  let mirroredHighWater = 0;
  // Divergence is reported by any observing client, so it is deduped by seq on
  // its own set rather than by ownership or the coop-event high-water.
  const divergenceReported = new Set<number>();

  function owns(actor: string): boolean {
    return actor === clientId || actor === aiActor;
  }

  return {
    recordCoopEvent(event: GameEvent, seq: number, outcome: EventOutcome): boolean {
      if (!owns(event.actor) || seq <= mirroredHighWater) {
        return false;
      }
      mirroredHighWater = seq;
      const record: CoopEventRecord = {
        event: "coop_event",
        seq,
        type: event.type,
        actor: event.actor,
        outcome,
        gameId,
        ...(event.stateHashAfter === undefined
          ? {}
          : { stateHashAfter: event.stateHashAfter }),
      };
      emit({ ...record });
      return true;
    },
    recordBounce(seq: number, interveningSeqs: readonly number[]): void {
      const record: EventBouncedRecord = {
        event: "event_bounced",
        seq,
        interveningSeqs: [...interveningSeqs],
        gameId,
      };
      emit({ ...record });
    },
    recordDivergence(info: { seq: number; expected: string; actual: string }): void {
      if (divergenceReported.has(info.seq)) {
        return;
      }
      divergenceReported.add(info.seq);
      const record: FoldDivergenceRecord = {
        event: "fold_divergence",
        seq: info.seq,
        expected: info.expected,
        actual: info.actual,
        clientId,
        gameId,
      };
      emit({ ...record });
    },
  };
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

export interface QuestLogSinkOptions {
  gameId: string;
  clientId: string;
}

/**
 * The installed sink handle. The CoopProvider (Task 25) wires the LogClient
 * callbacks to the recorder methods; RoomGate disposes the handle on unmount.
 */
export interface QuestLogSinkHandle extends CoopLogRecorder {
  /** Flush buffered records now (e.g. on `visibilitychange`). */
  flushNow(): Promise<void>;
  /** Detach the log sink + context and flush whatever remains. */
  dispose(): Promise<void>;
}

/**
 * Install the quest-log sink for a ready room:
 *  - stamp `gameId` onto every subsequent `logEvent` (grep isolation),
 *  - mirror every `logEvent` entry into `rooms/{id}/logs`,
 *  - return the coop record helpers, which write their shapes into the same
 *    node with their true `seq`.
 */
export function installQuestLogSink(
  database: Database,
  options: QuestLogSinkOptions,
): QuestLogSinkHandle {
  const { gameId, clientId } = options;
  const buffered = createRoomLogSink(database, gameId);

  setLogContext({ gameId });
  const sink: LogSink = (entry: Readonly<LogEntry>) => {
    buffered.record(entry);
  };
  setLogSink(sink);

  const recorder = createCoopLogRecorder({
    gameId,
    clientId,
    emit: (record) => {
      buffered.record(record);
    },
  });

  return {
    ...recorder,
    flushNow(): Promise<void> {
      return buffered.flushNow();
    },
    async dispose(): Promise<void> {
      setLogSink(null);
      clearLogContext();
      await buffered.dispose();
    },
  };
}
