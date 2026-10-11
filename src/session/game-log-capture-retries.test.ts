// Game log capture retry contracts: a failed write is retried on its own, a
// bounded number of times, and closing makes one last attempt. Runs on the
// in-memory store behind the `KeyValueStore` interface, with fake timers for
// the retries.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetLog, setJourneyLogCapture } from "../logging";
import { readGameLog } from "./game-log-capture";
import { createGameRepository } from "./game-repository";
import {
  createMemoryKeyValueStore,
  type KeyValueStore,
} from "./key-value-store";
import {
  captureAt,
  GAME_A,
  GAME_B,
  GAME_C,
  LIMITS,
  record,
  reported,
  UNCAPPED,
} from "./game-log-capture.fixtures";

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

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  resetLog();
});

afterEach(() => {
  resetLog();
  vi.restoreAllMocks();
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
