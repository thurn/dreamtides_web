// Production log capture contracts: every journey-log record reaches the
// game's stored log as the line the development sink writes, the stored log
// reads back in capture order, and the size cap evicts the least recently
// written games' logs first, then trims the capturing game's own oldest lines
// when its log alone exceeds the budget. A failed write is retried on its own,
// a bounded number of times, and closing makes one last attempt. Runs on the
// in-memory store behind the `KeyValueStore` interface, with fake timers for
// the retries.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createJourneyLogMirror,
  getLogEntries,
  logEvent,
  resetLog,
  setJourneyLogCapture,
  setLogContext,
} from "../logging";
import { parseGameId, type GameId } from "../types/identifiers";
import {
  createGameLogCapture,
  gameLogsToEvict,
  readGameLog,
  type GameLogCapture,
  type GameLogLimits,
} from "./game-log-capture";
import { createGameRepository, type GameRepository } from "./game-repository";
import {
  createMemoryKeyValueStore,
  type KeyValueStore,
} from "./key-value-store";

const GAME_A = parseGameId("gamea1");
const GAME_B = parseGameId("gameb2");
const GAME_C = parseGameId("gamec3");
const UNCAPPED = 1_000_000;
const LIMITS: GameLogLimits = {
  maxStoredCharacters: UNCAPPED,
  trimRetainedFraction: 1,
  retryInitialDelayMs: 10,
  retryBackoffFactor: 2,
  retryMaxDelayMs: 40,
  maxRetries: 3,
};

function record(index: number): Record<string, unknown> {
  return { event: "fixture_event", seq: index, gameId: GAME_A, index };
}

/** Stored size of one `record(n)` line for single-digit `n`. */
const LINE = JSON.stringify(record(0)).length + 1;

function captureAt(
  repository: GameRepository,
  gameId: GameId,
  maxStoredCharacters: number,
  clock: { now: number },
  limits: Partial<GameLogLimits> = {},
): GameLogCapture {
  return createGameLogCapture(repository, gameId, {
    ...LIMITS,
    ...limits,
    maxStoredCharacters,
    now: () => clock.now,
  });
}

const isLogKey = ([key]: readonly [string, unknown]): boolean =>
  key.includes("/log/");

/**
 * The in-memory store with its journey-log chunk writes routed through
 * `writeLog`, which may reject or hold them.
 */
function logWriteStore(
  writeLog: (write: () => Promise<void>) => Promise<void>,
): { store: KeyValueStore; inner: KeyValueStore } {
  const inner = createMemoryKeyValueStore();
  return {
    inner,
    store: {
      ...inner,
      putAll: (entries) =>
        entries.some(isLogKey)
          ? writeLog(() => inner.putAll(entries))
          : inner.putAll(entries),
    },
  };
}

const eventsOf = (lines: readonly string[]): string[] =>
  lines.map((line) => (JSON.parse(line) as { event: string }).event);

const reported = (event: string): Array<Record<string, unknown>> =>
  getLogEntries().filter((entry) => entry.event === event);

async function writeLog(
  capture: GameLogCapture,
  records: number,
): Promise<void> {
  for (let index = 0; index < records; index += 1) {
    capture.capture(record(index));
  }
  await capture.flush();
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  resetLog();
});

afterEach(() => {
  resetLog();
  vi.restoreAllMocks();
});

describe("game log capture", () => {
  it("stores each record as its journey-log line, in capture order", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    const records = [record(1), { nested: { list: [1, "two"] }, seq: 2 }];

    capture.capture(records[0]);
    await capture.flush();
    capture.capture(records[1]);
    capture.capture(record(3));

    const lines = await readGameLog(repository, capture);
    expect(lines).toEqual([
      JSON.stringify(records[0]),
      JSON.stringify(records[1]),
      JSON.stringify(record(3)),
    ]);
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      records[0],
      records[1],
      record(3),
    ]);
    expect(await repository.readLogLines(GAME_B)).toEqual([]);
  });

  it("receives logEvent entries and mirrored records exactly as the dev sink does", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    const posted: unknown[] = [];
    setLogContext({ gameId: GAME_A });
    setJourneyLogCapture(capture.capture);

    const entry = logEvent("fixture_logged", { cardId: "uuid-1" });
    const mirrored = { event: "game_event", seq: 7, gameId: GAME_A };
    createJourneyLogMirror({ log: () => undefined })(mirrored);
    createJourneyLogMirror({
      log: () => undefined,
      post: (value) => posted.push(value),
    })({ event: "not_captured", seq: 8 });
    setJourneyLogCapture(null);
    logEvent("after_detach");

    const lines = await readGameLog(repository, capture);
    expect(lines).toEqual([JSON.stringify(entry), JSON.stringify(mirrored)]);
    expect(JSON.parse(lines[0])).toMatchObject({
      event: "fixture_logged",
      gameId: GAME_A,
      cardId: "uuid-1",
      seq: entry.seq,
      timestamp: entry.timestamp,
    });
    expect(posted).toHaveLength(1);
  });

  it("evicts the least recently written games' logs first and keeps the capturing game's", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const clock = { now: 1 };
    await writeLog(captureAt(repository, GAME_A, UNCAPPED, clock), 4);
    clock.now = 2;
    await writeLog(captureAt(repository, GAME_B, UNCAPPED, clock), 4);
    const [a, b] = await repository.listLogs();
    expect([a.gameId, b.gameId]).toEqual([GAME_A, GAME_B]);

    // Room for two of the three logs: the oldest (A) goes.
    clock.now = 3;
    const cap = a.characters + b.characters + 1;
    await writeLog(captureAt(repository, GAME_C, cap, clock), 4);
    expect((await repository.listLogs()).map((log) => log.gameId)).toEqual([
      GAME_B,
      GAME_C,
    ]);
    expect(await repository.readLogLines(GAME_A)).toEqual([]);
    expect(await repository.readLogLines(GAME_B)).toHaveLength(4);

    // A log larger than the whole budget evicts every other log, then keeps
    // only its own newest lines that fit.
    clock.now = 4;
    const greedy = captureAt(repository, GAME_C, 2 * LINE + 1, clock);
    await writeLog(greedy, 1);
    expect(await repository.listLogs()).toEqual([
      { gameId: GAME_C, characters: 2 * LINE, updatedAt: 4 },
    ]);
    expect(await readGameLog(repository, greedy)).toEqual([
      JSON.stringify(record(3)),
      JSON.stringify(record(0)),
    ]);
  });

  it("trims the capturing game's oldest lines to the retained share of the budget, and reports it", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const capture = captureAt(
      repository,
      GAME_A,
      4 * LINE,
      { now: 1 },
      {
        trimRetainedFraction: 0.5,
      },
    );

    // A log within the budget is not trimmed.
    await writeLog(capture, 4);
    expect(await repository.readLogLines(GAME_A)).toHaveLength(4);
    expect(reported("game_log_trimmed")).toEqual([]);

    capture.capture(record(4));
    expect(await readGameLog(repository, capture)).toEqual([
      JSON.stringify(record(3)),
      JSON.stringify(record(4)),
    ]);
    expect((await repository.listLogs())[0].characters).toBe(2 * LINE);
    expect(reported("game_log_trimmed")).toEqual([
      expect.objectContaining({
        gameId: GAME_A,
        droppedLines: 3,
        droppedCharacters: 3 * LINE,
        keptCharacters: 2 * LINE,
      }),
    ]);

    // Appends continue after the kept lines.
    capture.capture(record(5));
    expect(await readGameLog(repository, capture)).toHaveLength(3);
  });

  it("ends a trim whose own report overflows the budget without a write loop", async () => {
    const inner = createMemoryKeyValueStore();
    let writes = 0;
    // Fails every write past a bound, so a write loop ends and is visible.
    const counted = <T>(write: () => Promise<T>): Promise<T> => {
      writes += 1;
      return writes > 20 ? Promise.reject(new Error("loop")) : write();
    };
    const store: KeyValueStore = {
      ...inner,
      putAll: (entries) => counted(() => inner.putAll(entries)),
      replaceRanges: (ranges, entries) =>
        counted(() => inner.replaceRanges(ranges, entries)),
    };
    const repository = createGameRepository(store);
    const capture = captureAt(
      repository,
      GAME_A,
      2 * LINE,
      { now: 1 },
      {
        trimRetainedFraction: 0.5,
      },
    );
    setJourneyLogCapture(capture.capture);

    await writeLog(capture, 3);
    await capture.close();

    expect(writes).toBeLessThanOrEqual(20);
    expect(reported("game_log_trimmed")).toHaveLength(1);
    expect((await repository.listLogs())[0].characters).toBeLessThanOrEqual(
      2 * LINE,
    );
  });

  it("keeps the whole log when a trim fails, and trims it with the next write", async () => {
    const inner = createMemoryKeyValueStore();
    let trimFailures = 1;
    const store: KeyValueStore = {
      ...inner,
      replaceRanges: (ranges, entries) => {
        if (trimFailures > 0) {
          trimFailures -= 1;
          return Promise.reject(new Error("transaction aborted"));
        }
        return inner.replaceRanges(ranges, entries);
      },
    };
    const repository = createGameRepository(store);
    const capture = captureAt(repository, GAME_A, 3 * LINE, { now: 1 });

    await writeLog(capture, 4);
    expect(trimFailures).toBe(0);
    expect(await repository.readLogLines(GAME_A)).toHaveLength(4);
    expect((await repository.listLogs())[0].characters).toBe(4 * LINE);
    expect(reported("game_log_eviction_failed")).toHaveLength(1);

    capture.capture(record(4));
    expect(await readGameLog(repository, capture)).toEqual(
      [2, 3, 4].map((index) => JSON.stringify(record(index))),
    );
  });

  it("restarts an evicted game's log from its next captured record", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    await writeLog(capture, 3);
    await repository.deleteLogs([GAME_A]);
    expect(await repository.listLogs()).toEqual([]);

    capture.capture(record(9));
    expect(await readGameLog(repository, capture)).toEqual([
      JSON.stringify(record(9)),
    ]);
    expect((await repository.listLogs())[0].characters).toBe(
      JSON.stringify(record(9)).length + 1,
    );
  });

  it("retries a failed write in order with the next record and logs the failure", async () => {
    const store = createMemoryKeyValueStore();
    let failures = 1;
    const flaky: KeyValueStore = {
      ...store,
      putAll: (entries) => {
        if (failures > 0) {
          failures -= 1;
          return Promise.reject(new Error("quota exceeded"));
        }
        return store.putAll(entries);
      },
    };
    const repository = createGameRepository(flaky);
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    setJourneyLogCapture(capture.capture);

    capture.capture(record(1));
    await capture.flush();
    expect(failures).toBe(0);
    expect(await repository.readLogLines(GAME_A)).toEqual([]);
    capture.capture(record(2));

    const lines = await readGameLog(repository, capture);
    const events = lines.map(
      (line) => (JSON.parse(line) as { event: string }).event,
    );
    expect(events).toEqual([
      "fixture_event",
      "game_log_persist_failed",
      "fixture_event",
    ]);
  });
});

describe("game log capture retries", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("persists a failed final batch on its own, with no further records", async () => {
    let failuresLeft = 2;
    const { store } = logWriteStore((write) => {
      if (failuresLeft === 0) return write();
      failuresLeft -= 1;
      return Promise.reject(new Error("transaction aborted"));
    });
    const repository = createGameRepository(store);
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    setJourneyLogCapture(capture.capture);

    capture.capture(record(1));
    await capture.flush();
    expect(await repository.readLogLines(GAME_A)).toEqual([]);

    // No further capture, flush, or close: only the retries can land it.
    await vi.runAllTimersAsync();
    expect(failuresLeft).toBe(0);
    expect(eventsOf(await repository.readLogLines(GAME_A))).toEqual([
      "fixture_event",
      "game_log_persist_failed",
    ]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops retrying after the retry limit; its failure reports drive no writes", async () => {
    let failing = true;
    let attempts = 0;
    const { store } = logWriteStore((write) => {
      attempts += 1;
      return failing ? Promise.reject(new Error("quota exceeded")) : write();
    });
    const repository = createGameRepository(store);
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    setJourneyLogCapture(capture.capture);

    capture.capture(record(1));
    await capture.flush();
    await vi.runAllTimersAsync();
    expect(attempts).toBe(1 + LIMITS.maxRetries);
    expect(vi.getTimerCount()).toBe(0);
    expect(reported("game_log_persist_failed")).toHaveLength(1);
    expect(reported("game_log_retries_exhausted")).toHaveLength(1);

    // The next record tries once more, without restarting the retries.
    capture.capture(record(2));
    await capture.flush();
    await vi.runAllTimersAsync();
    expect(attempts).toBe(2 + LIMITS.maxRetries);
    expect(vi.getTimerCount()).toBe(0);

    failing = false;
    capture.capture(record(3));
    expect(
      (await readGameLog(repository, capture)).map(
        (line) => JSON.parse(line) as { event: string; index?: number },
      ),
    ).toEqual([
      expect.objectContaining({ event: "fixture_event", index: 1 }),
      expect.objectContaining({ event: "game_log_persist_failed" }),
      expect.objectContaining({ event: "game_log_retries_exhausted" }),
      expect.objectContaining({ event: "fixture_event", index: 2 }),
      expect.objectContaining({ event: "fixture_event", index: 3 }),
    ]);
  });

  it("writes a record captured during an in-flight retry after the retried batch", async () => {
    let attempts = 0;
    let release: () => void = () => undefined;
    const { store } = logWriteStore((write) => {
      attempts += 1;
      if (attempts === 1) return Promise.reject(new Error("aborted"));
      if (attempts === 2) {
        return new Promise<void>((resolve) => {
          release = () => resolve(write());
        });
      }
      return write();
    });
    const repository = createGameRepository(store);
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    setJourneyLogCapture(capture.capture);

    capture.capture(record(1));
    await capture.flush();
    await vi.advanceTimersByTimeAsync(LIMITS.retryInitialDelayMs);
    expect(attempts).toBe(2);
    capture.capture(record(2));
    await Promise.resolve();
    release();

    expect(eventsOf(await readGameLog(repository, capture))).toEqual([
      "fixture_event",
      "game_log_persist_failed",
      "fixture_event",
    ]);
    expect(attempts).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops retrying on close and makes one last attempt", async () => {
    let failing = true;
    let attempts = 0;
    const { store } = logWriteStore((write) => {
      attempts += 1;
      return failing ? Promise.reject(new Error("aborted")) : write();
    });
    const repository = createGameRepository(store);
    const recovered = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    setJourneyLogCapture(recovered.capture);

    recovered.capture(record(1));
    await recovered.flush();
    expect(vi.getTimerCount()).toBe(1);
    failing = false;
    await recovered.close();
    expect(vi.getTimerCount()).toBe(0);
    expect(eventsOf(await repository.readLogLines(GAME_A))).toEqual([
      "fixture_event",
      "game_log_persist_failed",
    ]);

    // A closed capture drops later records.
    recovered.capture(record(2));
    await recovered.flush();
    expect(await repository.readLogLines(GAME_A)).toHaveLength(2);

    // A last attempt that fails leaves no retry behind.
    failing = true;
    const failed = captureAt(repository, GAME_B, UNCAPPED, { now: 1 });
    setJourneyLogCapture(failed.capture);
    failed.capture(record(1));
    await failed.flush();
    const attemptsBeforeClose = attempts;
    await failed.close();
    expect(attempts).toBe(attemptsBeforeClose + 1);
    await vi.runAllTimersAsync();
    expect(attempts).toBe(attemptsBeforeClose + 1);
    expect(vi.getTimerCount()).toBe(0);

    // Closing with nothing captured writes nothing.
    const idle = captureAt(repository, GAME_C, UNCAPPED, { now: 1 });
    await idle.close();
    expect(attempts).toBe(attemptsBeforeClose + 1);
    expect(await repository.readLogLines(GAME_C)).toEqual([]);
  });
});

describe("gameLogsToEvict", () => {
  const log = (gameId: GameId, characters: number, updatedAt: number) => ({
    gameId,
    characters,
    updatedAt,
  });

  it("evicts nothing within the budget", () => {
    expect(
      gameLogsToEvict([log(GAME_A, 5, 1), log(GAME_B, 5, 2)], GAME_B, 10),
    ).toEqual([]);
  });

  it("evicts oldest first, skipping the kept game, until the rest fit", () => {
    expect(
      gameLogsToEvict(
        [log(GAME_C, 5, 3), log(GAME_A, 5, 1), log(GAME_B, 5, 2)],
        GAME_A,
        10,
      ),
    ).toEqual([GAME_B]);
  });
});
