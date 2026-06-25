import type { LogEntry } from "../logging";

/**
 * A batching sink for {@link LogEntry} values. {@link record} is fire-and-forget
 * and never blocks the caller; entries accumulate in an in-memory buffer that is
 * flushed to the injected {@link BufferedLogSinkOptions.flush} writer either when
 * the buffer reaches `maxBufferedEntries` or after `flushDelayMs` of quiet, and
 * one final time on {@link LogSink.dispose}. The writer is injected so the RTDB
 * transport can be unit-tested with a fake.
 */
export interface LogSink {
  /** Buffer one entry for the next flush. Never throws. */
  record(entry: Readonly<LogEntry>): void;
  /** Flush all buffered entries now, awaiting the writer. */
  flushNow(): Promise<void>;
  /** Cancel any pending timer and flush whatever remains. */
  dispose(): Promise<void>;
}

export interface BufferedLogSinkOptions {
  /**
   * Persists one batch of entries. Called with at least one entry, in the order
   * they were recorded. A rejection is reported through {@link onError} and the
   * batch is dropped (best-effort transport — logging must never wedge the app).
   */
  flush: (entries: ReadonlyArray<Readonly<LogEntry>>) => Promise<void>;
  /** Quiet period before an idle buffer is flushed. Defaults to 4000ms. */
  flushDelayMs?: number;
  /** Buffer size that forces an immediate flush. Defaults to 150. */
  maxBufferedEntries?: number;
  /** Receives any error thrown by {@link flush}. Defaults to `console.error`. */
  onError?: (error: unknown) => void;
}

const DEFAULT_FLUSH_DELAY_MS = 4000;
const DEFAULT_MAX_BUFFERED_ENTRIES = 150;

export function createBufferedLogSink(
  options: BufferedLogSinkOptions,
): LogSink {
  const flushDelayMs = options.flushDelayMs ?? DEFAULT_FLUSH_DELAY_MS;
  const maxBufferedEntries =
    options.maxBufferedEntries ?? DEFAULT_MAX_BUFFERED_ENTRIES;
  const onError =
    options.onError ??
    ((error: unknown) => {
      console.error("Failed to persist quest log entries", error);
    });

  let buffer: Array<Readonly<LogEntry>> = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  // Serializes flushes so a slow writer never interleaves two batches (which
  // would let a later batch's entries persist before an earlier batch's).
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

  function record(entry: Readonly<LogEntry>): void {
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
  }

  function flushNow(): Promise<void> {
    return drain();
  }

  function dispose(): Promise<void> {
    disposed = true;
    return drain();
  }

  return { record, flushNow, dispose };
}
