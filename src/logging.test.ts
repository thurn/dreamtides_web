import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  createBattleLogBaseFields,
  createBattleProtoCardCreatedLogEvent,
  createBattleProtoDeckReorderedLogEvent,
  createBattleProtoMarkerSetLogEvent,
  createBattleProtoNoteAddedLogEvent,
  createBattleProtoNoteClearedLogEvent,
  createBattleProtoNoteDismissedLogEvent,
  clearLogContext,
  getLogEntries,
  logEvent,
  logEventOnce,
  parseBattleDestinationLogLabel,
  resetLog,
  setLogContext,
  setLogSink,
} from "./logging";
import type { LogEntry } from "./logging";
import type { BattleMutableState } from "./battle/types";
import { parseBattleCardId } from "./types/identifiers";
import { parseBattleId } from "./types/identifiers";
import { parseNoteId } from "./types/identifiers";
import { testCardName, testCardSubtype } from "./types/test-identities";

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

describe("createBattleLogBaseFields", () => {
  it("includes every L-3 common field", () => {
    const fields = createBattleLogBaseFields(makeBattleStateFixture(), {
      sourceSurface: "action-bar",
      selectedCardId: parseBattleCardId("card-42"),
    });

    expect(fields.battleId).toBe("battle-fixture");
    expect(fields.turnNumber).toBe(3);
    expect(fields.phase).toBe("day");
    expect(fields.activeSide).toBe("enemy");
    expect(fields.sourceSurface).toBe("action-bar");
    expect(fields.selectedCardId).toBe("card-42");
  });
});

describe("battle_proto_* helper suite (L-3 coverage)", () => {
  const state = makeBattleStateFixture();
  const context = {
    sourceSurface: "inspector" as const,
    selectedCardId: null,
  };

  const helpers: Array<{
    name: string;
    event: string;
    build: () => { event: string; fields: Record<string, unknown> };
  }> = [
    {
      name: "createBattleProtoNoteAddedLogEvent",
      event: "battle_proto_note_added",
      build: () =>
        createBattleProtoNoteAddedLogEvent(
          state,
          {
            battleCardId: parseBattleCardId("card-1"),
            noteId: parseNoteId("note-1"),
            text: "note",
            expiry: { kind: "manual" },
            createdAtTurnNumber: 1,
            createdAtSide: "player",
          },
          context,
        ),
    },
    {
      name: "createBattleProtoNoteDismissedLogEvent",
      event: "battle_proto_note_dismissed",
      build: () =>
        createBattleProtoNoteDismissedLogEvent(
          state,
          {
            battleCardId: parseBattleCardId("card-1"),
            noteId: parseNoteId("note-1"),
          },
          context,
        ),
    },
    {
      name: "createBattleProtoNoteClearedLogEvent",
      event: "battle_proto_note_cleared",
      build: () =>
        createBattleProtoNoteClearedLogEvent(
          state,
          {
            battleCardId: parseBattleCardId("card-1"),
            noteCount: 2,
          },
          context,
        ),
    },
    {
      name: "createBattleProtoCardCreatedLogEvent",
      event: "battle_proto_card_created",
      build: () =>
        createBattleProtoCardCreatedLogEvent(
          state,
          {
            battleCardId: parseBattleCardId("card-1"),
            provenanceKind: "generated-copy",
            sourceBattleCardId: parseBattleCardId("card-0"),
            name: testCardName("Copy"),
            subtype: testCardSubtype("x"),
            printedSpark: 1,
            ownerSide: "player",
            destinationZone: parseBattleDestinationLogLabel("player:hand"),
          },
          context,
        ),
    },
    {
      name: "createBattleProtoDeckReorderedLogEvent",
      event: "battle_proto_deck_reordered",
      build: () =>
        createBattleProtoDeckReorderedLogEvent(
          state,
          {
            side: "player",
            orderBefore: [parseBattleCardId("a"), parseBattleCardId("b")],
            orderAfter: [parseBattleCardId("b"), parseBattleCardId("a")],
          },
          context,
        ),
    },
    {
      name: "createBattleProtoMarkerSetLogEvent",
      event: "battle_proto_marker_set",
      build: () =>
        createBattleProtoMarkerSetLogEvent(
          state,
          {
            battleCardId: parseBattleCardId("card-1"),
            markers: { isPrevented: true, isCopied: false },
            diff: { prevented: "set", copied: "unchanged" },
          },
          context,
        ),
    },
  ];

  for (const helper of helpers) {
    it(`${helper.name} returns the correct event name and L-3 fields`, () => {
      const payload = helper.build();
      expect(payload.event).toBe(helper.event);
      expect(payload.fields.battleId).toBe("battle-fixture");
      expect(payload.fields.turnNumber).toBe(3);
      expect(payload.fields.phase).toBe("day");
      expect(payload.fields.activeSide).toBe("enemy");
      expect(payload.fields.sourceSurface).toBe("inspector");
      expect(payload.fields.selectedCardId).toBeNull();
    });
  }
});

function makeBattleStateFixture(): Pick<
  BattleMutableState,
  "battleId" | "turnNumber" | "phase" | "activeSide"
> {
  return {
    battleId: parseBattleId("battle-fixture"),
    turnNumber: 3,
    phase: "day",
    activeSide: "enemy",
  };
}
