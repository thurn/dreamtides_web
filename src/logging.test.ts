import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clearLogContext,
  createJourneyLogMirror,
  getLogEntries,
  logEvent,
  logEventOnce,
  resetLog,
  setLogContext,
  setLogSink,
} from "./logging";
import type { LogEntry } from "./logging";

beforeEach(() => {
  resetLog();
  vi.restoreAllMocks();
});

describe("setLogSink", () => {
  it("forwards every entry to the installed sink", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const received: LogEntry[] = [];
    setLogSink((entry) => {
      received.push(entry);
    });

    logEvent("alpha", { value: 1 });
    logEvent("beta");

    expect(received.map((e) => e.event)).toEqual(["alpha", "beta"]);
    expect(received[0].value).toBe(1);
  });

  it("stops forwarding once the sink is removed", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    const received: LogEntry[] = [];
    setLogSink((entry) => {
      received.push(entry);
    });
    logEvent("kept");
    setLogSink(null);
    logEvent("dropped");

    expect(received.map((e) => e.event)).toEqual(["kept"]);
  });

  it("swallows a throwing sink so logging still returns the entry", () => {
    vi.spyOn(console, "log").mockImplementation(() => {});
    setLogSink(() => {
      throw new Error("sink boom");
    });

    const entry = logEvent("resilient");
    expect(entry.event).toBe("resilient");
  });
});

describe("logEvent", () => {
  it("assigns incrementing sequence numbers starting at 1", () => {
    const a = logEvent("alpha");
    const b = logEvent("beta");
    expect(a.seq).toBe(1);
    expect(b.seq).toBe(2);
  });

  it("includes timestamp, event, and seq on every entry", () => {
    const entry = logEvent("test_event", { extra: 42 });
    expect(entry.timestamp).toBeDefined();
    expect(typeof entry.timestamp).toBe("string");
    expect(entry.event).toBe("test_event");
    expect(entry.seq).toBe(1);
    expect(entry.extra).toBe(42);
  });

  it("writes single-line JSON to console.log", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logEvent("console_test", { key: "value" });
    expect(spy).toHaveBeenCalledOnce();
    const logged = spy.mock.calls[0][0] as string;
    const parsed = JSON.parse(logged) as Record<string, unknown>;
    expect(parsed.event).toBe("console_test");
    expect(parsed.key).toBe("value");
    expect(logged).not.toContain("\n");
  });

  it("strips reserved keys from caller-supplied fields", () => {
    const entry = logEvent("secure_event", {
      seq: 999,
      event: "tampered",
      timestamp: "bad",
      custom: "kept",
    });
    expect(entry.seq).toBe(1);
    expect(entry.event).toBe("secure_event");
    expect(entry.timestamp).not.toBe("bad");
    expect(entry.custom).toBe("kept");
  });

  it("returns a frozen object that cannot be mutated", () => {
    const entry = logEvent("frozen_test");
    expect(() => {
      (entry as Record<string, unknown>).event = "mutated";
    }).toThrow();
  });
});

describe("setLogContext", () => {
  it("merges ambient fields into every subsequent event", () => {
    setLogContext({ gameId: "h3ppju" });
    const a = logEvent("alpha");
    const b = logEvent("beta", { extra: 1 });
    expect(a.gameId).toBe("h3ppju");
    expect(b.gameId).toBe("h3ppju");
    expect(b.extra).toBe(1);
  });

  it("lets explicit fields win over the context", () => {
    setLogContext({ gameId: "ctx" });
    const entry = logEvent("override", { gameId: "explicit" });
    expect(entry.gameId).toBe("explicit");
  });

  it("strips reserved keys from the context", () => {
    setLogContext({ seq: 999, event: "tampered", gameId: "kept" });
    const entry = logEvent("guarded");
    expect(entry.seq).toBe(1);
    expect(entry.event).toBe("guarded");
    expect(entry.gameId).toBe("kept");
  });

  it("stops stamping once clearLogContext runs", () => {
    setLogContext({ gameId: "room" });
    expect(logEvent("with").gameId).toBe("room");
    clearLogContext();
    expect(logEvent("without").gameId).toBeUndefined();
  });

  it("is reset by resetLog", () => {
    setLogContext({ gameId: "room" });
    resetLog();
    expect(logEvent("after_reset").gameId).toBeUndefined();
  });
});

describe("getLogEntries", () => {
  it("returns all accumulated entries", () => {
    logEvent("a");
    logEvent("b");
    logEvent("c");
    const entries = getLogEntries();
    expect(entries).toHaveLength(3);
    expect(entries[0].event).toBe("a");
    expect(entries[2].event).toBe("c");
  });

  it("returns copies that do not share references with internal state", () => {
    logEvent("original");
    const first = getLogEntries();
    logEvent("second");
    const second = getLogEntries();
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(2);
  });

  it("returns frozen entry objects", () => {
    logEvent("freeze_check");
    const entries = getLogEntries();
    expect(() => {
      (entries[0] as Record<string, unknown>).event = "mutated";
    }).toThrow();
  });
});

describe("resetLog", () => {
  it("clears the accumulator and resets the sequence counter", () => {
    logEvent("before_reset");
    logEvent("before_reset_2");
    expect(getLogEntries()).toHaveLength(2);

    resetLog();

    expect(getLogEntries()).toHaveLength(0);
    const entry = logEvent("after_reset");
    expect(entry.seq).toBe(1);
  });
});

describe("dev-server log sink", () => {
  function postsAfterLogging(env: { DEV: boolean; MODE: string }): number {
    vi.stubEnv("DEV", env.DEV);
    vi.stubEnv("MODE", env.MODE);
    const post = vi.fn(() => Promise.resolve(new Response()));
    vi.stubGlobal("fetch", post);
    try {
      logEvent("sink_probe");
      createJourneyLogMirror({ log: () => {} })({
        event: "sink_probe",
        seq: 1,
      });
      return post.mock.calls.length;
    } finally {
      vi.unstubAllGlobals();
      vi.unstubAllEnvs();
    }
  }

  it("posts every journey-log record to /api/log in a development build", () => {
    expect(postsAfterLogging({ DEV: true, MODE: "development" })).toBe(2);
  });

  it("never posts in a production build", () => {
    expect(postsAfterLogging({ DEV: false, MODE: "production" })).toBe(0);
  });
});

describe("logEventOnce", () => {
  it("emits the first time and returns a frozen entry", () => {
    const entry = logEventOnce("key-1", "once_event", { foo: 1 });
    expect(entry).not.toBeNull();
    expect(entry?.event).toBe("once_event");
  });

  it("returns null on repeat calls with the same key", () => {
    logEventOnce("shared-key", "event_a");
    const again = logEventOnce("shared-key", "event_b");
    expect(again).toBeNull();
    // First call emitted; duplicate call did not.
    expect(getLogEntries()).toHaveLength(1);
  });

  it("clears the once-key set when resetLog runs", () => {
    logEventOnce("reset-key", "event_first");
    resetLog();
    const second = logEventOnce("reset-key", "event_second");
    expect(second).not.toBeNull();
  });
});
