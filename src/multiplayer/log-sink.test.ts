import { afterEach, describe, expect, it, vi } from "vitest";
import type { LogEntry } from "../logging";
import { createBufferedLogSink } from "./log-sink";

function entry(seq: number): Readonly<LogEntry> {
  return Object.freeze({
    timestamp: `2026-06-24T00:00:0${seq}.000Z`,
    event: `event_${seq}`,
    seq,
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("createBufferedLogSink", () => {
  it("flushes buffered entries on flushNow in record order", async () => {
    const batches: Array<ReadonlyArray<Readonly<LogEntry>>> = [];
    const sink = createBufferedLogSink({
      flush: (entries) => {
        batches.push(entries);
        return Promise.resolve();
      },
      flushDelayMs: 10_000,
    });

    sink.record(entry(1));
    sink.record(entry(2));
    await sink.flushNow();

    expect(batches).toHaveLength(1);
    expect(batches[0].map((e) => e.seq)).toEqual([1, 2]);
  });

  it("does not call flush when there is nothing buffered", async () => {
    const flush = vi.fn(() => Promise.resolve());
    const sink = createBufferedLogSink({ flush });

    await sink.flushNow();

    expect(flush).not.toHaveBeenCalled();
  });

  it("auto-flushes once the buffer reaches maxBufferedEntries", async () => {
    const batches: Array<ReadonlyArray<Readonly<LogEntry>>> = [];
    const sink = createBufferedLogSink({
      flush: (entries) => {
        batches.push(entries);
        return Promise.resolve();
      },
      flushDelayMs: 10_000,
      maxBufferedEntries: 2,
    });

    sink.record(entry(1));
    expect(batches).toHaveLength(0);
    sink.record(entry(2));

    // Let the queued flush microtask settle.
    await sink.flushNow();

    expect(batches.flat().map((e) => e.seq)).toEqual([1, 2]);
  });

  it("flushes after the idle delay elapses", async () => {
    vi.useFakeTimers();
    const flush = vi.fn(() => Promise.resolve());
    const sink = createBufferedLogSink({ flush, flushDelayMs: 1000 });

    sink.record(entry(1));
    expect(flush).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1000);

    expect(flush).toHaveBeenCalledOnce();
  });

  it("flushes remaining entries on dispose and ignores later records", async () => {
    const batches: Array<ReadonlyArray<Readonly<LogEntry>>> = [];
    const sink = createBufferedLogSink({
      flush: (entries) => {
        batches.push(entries);
        return Promise.resolve();
      },
      flushDelayMs: 10_000,
    });

    sink.record(entry(1));
    await sink.dispose();
    sink.record(entry(2));
    await sink.flushNow();

    expect(batches).toHaveLength(1);
    expect(batches[0].map((e) => e.seq)).toEqual([1]);
  });

  it("reports flush errors through onError and keeps accepting entries", async () => {
    const onError = vi.fn();
    let shouldThrow = true;
    const ok: number[] = [];
    const sink = createBufferedLogSink({
      flush: (entries) => {
        if (shouldThrow) {
          return Promise.reject(new Error("boom"));
        }
        ok.push(...entries.map((e) => e.seq));
        return Promise.resolve();
      },
      flushDelayMs: 10_000,
      onError,
    });

    sink.record(entry(1));
    await sink.flushNow();
    expect(onError).toHaveBeenCalledOnce();

    shouldThrow = false;
    sink.record(entry(2));
    await sink.flushNow();
    expect(ok).toEqual([2]);
  });
});
