// Every build keeps each local game's journey log in its repository, beside
// the game's events: the same lines the development `/api/log` sink appends to
// `logs/journey-log.jsonl`, in the same format. Lines captured in one task are
// written as one chunk, and a failed write is retried, in order, with the next
// one. After each write the stored logs are capped: while their total size
// exceeds the budget, the logs written least recently are deleted, never the
// capturing game's own.

import { journeyLogLine, logEvent, type JourneyLogRecord } from "../logging";
import type { GameId } from "../types/identifiers";
import type { GameLogSummary, GameRepository } from "./game-repository";

export interface GameLogCaptureOptions {
  /** Budget for all stored logs together, in JSONL characters. */
  maxStoredCharacters: number;
  /** Epoch-millisecond clock for log write times. */
  now?: () => number;
}

export interface GameLogCapture {
  readonly gameId: GameId;
  /** Queue one journey-log record for storage. Synchronous. */
  capture: (record: JourneyLogRecord) => void;
  /** Resolves once every record captured so far has been written (or failed). */
  flush: () => Promise<void>;
}

/** The games whose logs to delete so the rest fit `maxStoredCharacters`. */
export function gameLogsToEvict(
  logs: readonly GameLogSummary[],
  keep: GameId,
  maxStoredCharacters: number,
): GameId[] {
  let total = logs.reduce((sum, log) => sum + log.characters, 0);
  const evicted: GameId[] = [];
  const oldestFirst = [...logs].sort(
    (left, right) => left.updatedAt - right.updatedAt,
  );
  for (const log of oldestFirst) {
    if (total <= maxStoredCharacters) break;
    if (log.gameId === keep) continue;
    evicted.push(log.gameId);
    total -= log.characters;
  }
  return evicted;
}

/** Captures `gameId`'s journey log into `repository`. */
export function createGameLogCapture(
  repository: GameRepository,
  gameId: GameId,
  options: GameLogCaptureOptions,
): GameLogCapture {
  const now = options.now ?? Date.now;
  let pending: string[] = [];
  let scheduled = false;
  let writing: Promise<void> | null = null;
  // Failures are reported once per run, so a failure's own log line cannot
  // drive an endless write loop.
  let writeFailing = false;
  let evictionFailing = false;

  async function evictOldLogs(written: GameLogSummary): Promise<void> {
    try {
      const evicted = gameLogsToEvict(
        await repository.listLogs(),
        gameId,
        options.maxStoredCharacters,
      );
      if (evicted.length > 0) await repository.deleteLogs(evicted);
      evictionFailing = false;
      if (evicted.length > 0) {
        logEvent("game_logs_evicted", {
          evictedGameIds: evicted,
          keptCharacters: written.characters,
          maxStoredCharacters: options.maxStoredCharacters,
        });
      }
    } catch (error) {
      if (evictionFailing) return;
      evictionFailing = true;
      logEvent("game_log_eviction_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async function writePending(): Promise<void> {
    while (pending.length > 0) {
      const batch = pending;
      pending = [];
      let written: GameLogSummary;
      try {
        written = await repository.appendLogLines(gameId, batch, now());
      } catch (error) {
        pending = [...batch, ...pending];
        if (writeFailing) return;
        writeFailing = true;
        logEvent("game_log_persist_failed", {
          message: error instanceof Error ? error.message : String(error),
        });
        return;
      }
      writeFailing = false;
      await evictOldLogs(written);
    }
  }

  function drain(): Promise<void> {
    writing ??= writePending().finally(() => {
      writing = null;
    });
    return writing;
  }

  return {
    gameId,
    capture(record) {
      pending.push(journeyLogLine(record));
      if (scheduled) return;
      scheduled = true;
      // Deferred so that records captured in the same task share one write.
      queueMicrotask(() => {
        scheduled = false;
        void drain();
      });
    },
    flush: () => (writing ?? Promise.resolve()).then(drain),
  };
}

/** The game's stored journey log as JSONL lines, oldest first. */
export async function readGameLog(
  repository: GameRepository,
  capture: GameLogCapture,
): Promise<string[]> {
  await capture.flush();
  return repository.readLogLines(capture.gameId);
}
