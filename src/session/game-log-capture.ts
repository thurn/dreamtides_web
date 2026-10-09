// Every build keeps each local game's journey log in its repository, beside
// the game's events: the same lines the development `/api/log` sink appends to
// `logs/journey-log.jsonl`, in the same format. Lines captured in one task are
// written as one chunk. A failed write is requeued ahead of later lines and
// retried on its own after a backoff delay, for a bounded number of retries
// (`GAME_LOGS`); the next captured record, flush, or close tries again after
// that. Closing stops the retries and makes one last attempt.
//
// After each write the stored logs are capped: while their total size exceeds
// the budget, the logs written least recently are deleted, never the capturing
// game's own. When the capturing game's log alone exceeds the budget, its
// oldest lines are deleted so that its newest lines fit the retained share of
// the budget.
//
// Failures and trims are reported once per run, so a report's own log line
// cannot drive an endless write loop.

import { journeyLogLine, logEvent, type JourneyLogRecord } from "../logging";
import type { GameId } from "../types/identifiers";
import type { GameLogSummary, GameRepository } from "./game-repository";

/** Storage budget and retry pacing of captured logs; see `GAME_LOGS`. */
export interface GameLogLimits {
  /** Budget for all stored logs together, in JSONL characters. */
  maxStoredCharacters: number;
  /** Share of the budget an over-budget capturing game's log is trimmed to. */
  trimRetainedFraction: number;
  /** Delay before retrying after the first consecutive failed write. */
  retryInitialDelayMs: number;
  /** Factor applied to the delay for each further consecutive failure. */
  retryBackoffFactor: number;
  /** Longest delay between retries. */
  retryMaxDelayMs: number;
  /** Retries after a failed write before waiting for the next record. */
  maxRetries: number;
}

export interface GameLogCaptureOptions extends GameLogLimits {
  /** Epoch-millisecond clock for log write times. */
  now?: () => number;
}

export interface GameLogCapture {
  readonly gameId: GameId;
  /** Queue one journey-log record for storage. Synchronous. */
  capture: (record: JourneyLogRecord) => void;
  /** Resolves once every record captured so far has been written (or failed). */
  flush: () => Promise<void>;
  /**
   * Stop retrying, then make one last attempt to write every captured record.
   * Records captured afterwards are dropped.
   */
  close: () => Promise<void>;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Captures `gameId`'s journey log into `repository`. */
export function createGameLogCapture(
  repository: GameRepository,
  gameId: GameId,
  options: GameLogCaptureOptions,
): GameLogCapture {
  const now = options.now ?? Date.now;
  const { maxStoredCharacters } = options;
  let pending: string[] = [];
  let scheduled = false;
  let writing: Promise<void> | null = null;
  let consecutiveFailures = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let capFailing = false;
  let trimReported = false;

  // Reports carry the game id, so a report made while closing never takes the
  // id of a game opened in the meantime.
  function report(event: string, fields: Record<string, unknown>): void {
    logEvent(event, { gameId, ...fields });
  }

  async function capStoredLogs(written: GameLogSummary): Promise<void> {
    try {
      const evicted = gameLogsToEvict(
        await repository.listLogs(),
        gameId,
        maxStoredCharacters,
      );
      if (evicted.length > 0) {
        await repository.deleteLogs(evicted);
        report("game_logs_evicted", {
          evictedGameIds: evicted,
          keptCharacters: written.characters,
          maxStoredCharacters,
        });
      }
      if (written.characters <= maxStoredCharacters) {
        trimReported = false;
      } else {
        const trim = await repository.trimLogLines(
          gameId,
          Math.floor(maxStoredCharacters * options.trimRetainedFraction),
        );
        // A trim's own report is written next; when it pushes the log over
        // the budget again, that trim goes unreported.
        if (trim !== null && trim.droppedLines > 0 && !trimReported) {
          trimReported = true;
          report("game_log_trimmed", {
            droppedLines: trim.droppedLines,
            droppedCharacters: trim.droppedCharacters,
            keptCharacters: trim.log.characters,
            maxStoredCharacters,
          });
        }
      }
      capFailing = false;
    } catch (error) {
      if (capFailing) return;
      capFailing = true;
      report("game_log_eviction_failed", { message: errorMessage(error) });
    }
  }

  function retryDelayMs(): number {
    const { retryInitialDelayMs, retryBackoffFactor, retryMaxDelayMs } =
      options;
    return Math.min(
      retryInitialDelayMs * retryBackoffFactor ** (consecutiveFailures - 1),
      retryMaxDelayMs,
    );
  }

  function clearRetry(): void {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  }

  // The retry is a timer, not a captured record, so the failure report a
  // failed write captures never triggers a write of its own.
  function scheduleRetry(): void {
    if (closed || retryTimer !== null) return;
    if (consecutiveFailures > options.maxRetries) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      void drain();
    }, retryDelayMs());
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
        consecutiveFailures += 1;
        if (consecutiveFailures === 1) {
          report("game_log_persist_failed", { message: errorMessage(error) });
        } else if (consecutiveFailures === options.maxRetries + 1) {
          report("game_log_retries_exhausted", {
            failures: consecutiveFailures,
            pendingLines: pending.length,
            message: errorMessage(error),
          });
        }
        scheduleRetry();
        return;
      }
      consecutiveFailures = 0;
      clearRetry();
      await capStoredLogs(written);
    }
  }

  function drain(): Promise<void> {
    writing ??= writePending().finally(() => {
      writing = null;
    });
    return writing;
  }

  const flush = (): Promise<void> => (writing ?? Promise.resolve()).then(drain);

  return {
    gameId,
    capture(record) {
      if (closed) return;
      pending.push(journeyLogLine(record));
      if (scheduled) return;
      scheduled = true;
      // Deferred so that records captured in the same task share one write.
      queueMicrotask(() => {
        scheduled = false;
        void drain();
      });
    },
    flush,
    close() {
      closed = true;
      clearRetry();
      return flush();
    },
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
