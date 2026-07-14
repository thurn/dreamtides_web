import { describe, expect, it, vi } from "vitest";
import type { GameEvent } from "../eventlog/types";
import {
  ROOM_LOG_LIMIT,
  createBufferedSink,
  createCoopEmit,
  createCoopLogRecorder,
  createQuestLogMirror,
  pruneLogEntries,
  type SinkRecord,
} from "./quest-log-sink";

/**
 * A push-key stand-in that sorts chronologically the way Firebase push ids do:
 * a fixed-width, zero-padded, lexicographically-increasing string.
 */
function pushKey(index: number): string {
  return `-key${index.toString().padStart(8, "0")}`;
}

function makeEvent(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    type: "PICK_DRAFT_CARD",
    payload: {},
    actor: "client-a",
    clientTimestamp: "0",
    basedOnSeq: 0,
    ...overrides,
  };
}

describe("pruneLogEntries", () => {
  it("keeps only the newest ROOM_LOG_LIMIT entries when growth is unbounded", () => {
    const total = ROOM_LOG_LIMIT + 300;
    const entries: Record<string, string> = {};
    for (let i = 0; i < total; i += 1) {
      entries[pushKey(i)] = JSON.stringify({ n: i });
    }

    const pruned = pruneLogEntries(entries);

    const keptKeys = Object.keys(pruned).sort((a, b) => a.localeCompare(b));
    expect(keptKeys).toHaveLength(ROOM_LOG_LIMIT);
    // The newest entries are retained: the first surviving key is the one right
    // after the pruned prefix, and the last is the newest recorded.
    expect(keptKeys[0]).toBe(pushKey(total - ROOM_LOG_LIMIT));
    expect(keptKeys[keptKeys.length - 1]).toBe(pushKey(total - 1));
  });

  it("returns everything untouched when under the limit", () => {
    const entries = { [pushKey(0)]: "a", [pushKey(1)]: "b" };
    expect(pruneLogEntries(entries, 10)).toEqual(entries);
  });
});

describe("createBufferedSink", () => {
  it("flushes a full buffer immediately and preserves record order", async () => {
    const batches: SinkRecord[][] = [];
    const sink = createBufferedSink({
      maxBufferedEntries: 3,
      flush: (entries) => {
        batches.push([...entries]);
        return Promise.resolve();
      },
    });

    sink.record({ n: 0 });
    sink.record({ n: 1 });
    sink.record({ n: 2 });
    await sink.flushNow();

    expect(batches).toHaveLength(1);
    expect(batches[0].map((r) => r.n)).toEqual([0, 1, 2]);
  });

  it("flushes whatever remains on dispose and then drops further records", async () => {
    const batches: SinkRecord[][] = [];
    const sink = createBufferedSink({
      flush: (entries) => {
        batches.push([...entries]);
        return Promise.resolve();
      },
    });

    sink.record({ n: 0 });
    await sink.dispose();
    sink.record({ n: 1 });
    await sink.flushNow();

    expect(batches).toHaveLength(1);
    expect(batches[0].map((r) => r.n)).toEqual([0]);
  });

  it("swallows a flush rejection through onError so logging never wedges", async () => {
    const onError = vi.fn();
    const sink = createBufferedSink({
      maxBufferedEntries: 1,
      onError,
      flush: () => Promise.reject(new Error("transport down")),
    });

    sink.record({ n: 0 });
    await sink.flushNow();

    expect(onError).toHaveBeenCalledTimes(1);
  });
});

describe("createCoopLogRecorder single-writer rule", () => {
  function setup(clientId = "client-a") {
    const emitted: SinkRecord[] = [];
    const recorder = createCoopLogRecorder({
      gameId: "room-1",
      clientId,
      emit: (record) => emitted.push(record),
    });
    return { emitted, recorder };
  }

  it("mirrors an owned event as the coop_event shape", () => {
    const { emitted, recorder } = setup();
    const recorded = recorder.recordCoopEvent(makeEvent({ actor: "client-a" }), 5, "applied");

    expect(recorded).toBe(true);
    expect(emitted).toEqual([
      {
        event: "coop_event",
        seq: 5,
        type: "PICK_DRAFT_CARD",
        actor: "client-a",
        outcome: "applied",
        gameId: "room-1",
      },
    ]);
  });

  it("records a logical intent key for automatic-flow reconstruction", () => {
    const { emitted, recorder } = setup();
    const event = {
      ...makeEvent({ actor: "client-a" }),
      intentKey: "battle:b-1:dreamwell:player:2",
    };

    recorder.recordCoopEvent(event, 5, "applied");

    expect(emitted[0]).toMatchObject({
      event: "coop_event",
      intentKey: "battle:b-1:dreamwell:player:2",
      outcome: "applied",
    });
  });

  it("mirrors the client's own ai:<clientId> events", () => {
    const { emitted, recorder } = setup();
    const recorded = recorder.recordCoopEvent(
      makeEvent({ actor: "ai:client-a" }),
      6,
      "applied",
    );
    expect(recorded).toBe(true);
    expect(emitted).toHaveLength(1);
    expect(emitted[0].actor).toBe("ai:client-a");
  });

  it("does not mirror events appended by another actor", () => {
    const { emitted, recorder } = setup();
    const recorded = recorder.recordCoopEvent(makeEvent({ actor: "client-b" }), 7, "applied");
    expect(recorded).toBe(false);
    expect(emitted).toHaveLength(0);
  });

  it("does not re-mirror an already-mirrored seq (high-water on refold)", () => {
    const { emitted, recorder } = setup();
    expect(recorder.recordCoopEvent(makeEvent(), 5, "applied")).toBe(true);
    // A refold after reconnect re-reports the same confirmed outcomes.
    expect(recorder.recordCoopEvent(makeEvent(), 5, "applied")).toBe(false);
    expect(recorder.recordCoopEvent(makeEvent(), 3, "applied")).toBe(false);
    expect(emitted).toHaveLength(1);
  });

  it("includes stateHashAfter only when the event carries it", () => {
    const { emitted, recorder } = setup();
    recorder.recordCoopEvent(makeEvent({ stateHashAfter: "abc123" }), 8, "applied");
    expect(emitted[0]).toMatchObject({ stateHashAfter: "abc123" });
  });

  it("emits the event_bounced shape with intervening seqs", () => {
    const { emitted, recorder } = setup();
    recorder.recordBounce(9, [7, 8], "partner_conflict");
    expect(emitted).toEqual([
      {
        event: "event_bounced",
        seq: 9,
        interveningSeqs: [7, 8],
        bounceReason: "partner_conflict",
        gameId: "room-1",
      },
    ]);
  });

  it("emits the fold_divergence shape stamped with clientId and dedupes by seq", () => {
    const { emitted, recorder } = setup();
    recorder.recordDivergence({ seq: 4, expected: "h1", actual: "h2" });
    recorder.recordDivergence({ seq: 4, expected: "h1", actual: "h2" });
    expect(emitted).toEqual([
      {
        event: "fold_divergence",
        seq: 4,
        expected: "h1",
        actual: "h2",
        clientId: "client-a",
        gameId: "room-1",
      },
    ]);
  });

  it("emits the event_append_failed shape with type, nonce, and error message", () => {
    const { emitted, recorder } = setup();
    recorder.recordAppendFailed(
      makeEvent({ type: "ADD_CARD", nonce: "client-a:3" }),
      new Error("append rejected"),
    );
    expect(emitted).toEqual([
      {
        event: "event_append_failed",
        type: "ADD_CARD",
        nonce: "client-a:3",
        error: "append rejected",
        gameId: "room-1",
      },
    ]);
  });

  it("emits one pending_dropped record per discarded intent", () => {
    const { emitted, recorder } = setup();
    recorder.recordPendingDropped([
      makeEvent({ type: "ADD_CARD", nonce: "client-a:1" }),
      makeEvent({ type: "REMOVE_DECK_ENTRY", nonce: "client-a:2" }),
    ]);
    expect(emitted).toEqual([
      { event: "pending_dropped", type: "ADD_CARD", nonce: "client-a:1", gameId: "room-1" },
      {
        event: "pending_dropped",
        type: "REMOVE_DECK_ENTRY",
        nonce: "client-a:2",
        gameId: "room-1",
      },
    ]);
  });
});

describe("createQuestLogMirror", () => {
  it("delivers the record verbatim to both console and dev-server transports, seq intact", () => {
    const logLines: string[] = [];
    const posted: SinkRecord[] = [];
    const mirror = createQuestLogMirror({
      log: (line) => logLines.push(line),
      post: (record) => posted.push(record),
    });

    const record: SinkRecord = {
      event: "coop_event",
      seq: 42,
      type: "PICK_DRAFT_CARD",
      actor: "client-a",
      outcome: "applied",
      gameId: "room-1",
    };
    mirror(record);

    // The dev-server transport gets the record object verbatim (true seq).
    expect(posted).toEqual([record]);
    // The console transport gets the single-line JSON of the same record, so
    // grepping quest-log.jsonl for the seq/type works.
    expect(logLines).toHaveLength(1);
    expect(JSON.parse(logLines[0])).toEqual(record);
    expect((JSON.parse(logLines[0]) as { seq: number }).seq).toBe(42);
  });
});

describe("createCoopEmit two-destination delivery (spec §Logging)", () => {
  it("delivers each owning-client record to BOTH rooms/logs and quest-log.jsonl, once, obeying the high-water", () => {
    const roomLogs: SinkRecord[] = [];
    const questLog: SinkRecord[] = [];
    const emit = createCoopEmit(
      { record: (r) => roomLogs.push(r) },
      (r) => questLog.push(r),
    );
    const recorder = createCoopLogRecorder({ gameId: "room-1", clientId: "client-a", emit });

    // Owned event -> both destinations.
    expect(recorder.recordCoopEvent(makeEvent({ actor: "client-a" }), 5, "applied")).toBe(true);
    // Peer event -> neither destination (single-writer gate upstream of emit).
    expect(recorder.recordCoopEvent(makeEvent({ actor: "client-b" }), 6, "applied")).toBe(false);
    // Refold re-reports seq 5 -> no duplicate in either destination.
    expect(recorder.recordCoopEvent(makeEvent({ actor: "client-a" }), 5, "applied")).toBe(false);

    // Both destinations received exactly the one owned coop_event, seq intact.
    expect(roomLogs).toHaveLength(1);
    expect(questLog).toHaveLength(1);
    expect(roomLogs[0]).toEqual(questLog[0]);
    expect(roomLogs[0]).toMatchObject({ event: "coop_event", seq: 5, actor: "client-a" });
  });
});
