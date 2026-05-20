import { beforeEach, describe, expect, it, vi } from "vitest";
import { runTransaction } from "firebase/database";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../battle/types";
import {
  applyBattleCommandToRoom,
  clearBattleStateInRoom,
  ensureBattleSession,
  redoBattleInRoom,
  resetBattleInRoom,
  undoBattleInRoom,
} from "./battle-service";
import { normalizeBattleStateSnapshot } from "./battle-normalize";
import { createBattleInit } from "../battle/integration/create-battle-init";
import { createInitialBattleState } from "../battle/state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../battle/test-support";
import type { Database } from "firebase/database";
import type { MultiplayerRoom } from "./room-types";
import type { SharedBattleState } from "./battle-types";

vi.mock("firebase/database", () => ({
  ref: vi.fn((db: unknown, path: unknown) => ({ db, path })),
  runTransaction: vi.fn(),
}));

const mockedRunTransaction = runTransaction as unknown as ReturnType<
  typeof vi.fn<
    (
      ref: unknown,
      updater: (
        current: MultiplayerRoom | null,
      ) => MultiplayerRoom | null | undefined,
    ) => Promise<void>
  >
>;

const fakeInit = makeRawSnapshot({}).init as unknown as SharedBattleState["init"];
const fakeInitial = makeRawSnapshot({}).reducer.mutable as unknown as SharedBattleState["reducer"]["mutable"];

beforeEach(() => {
  mockedRunTransaction.mockReset();
});

function makeRawSnapshot(overrides: Record<string, unknown>) {
  return {
    init: {
      battleId: "battle:test",
      battleEntryKey: "test",
      seed: 0,
      siteId: "s",
      dreamscapeId: null,
      completionLevelAtStart: 0,
      isMiniboss: false,
      isFinalBoss: false,
      essenceReward: 0,
      openingHandSize: 5,
      scoreToWin: 25,
      turnLimit: 50,
      maxEnergyCap: 10,
      startingSide: "player",
      playerDrawSkipsTurnOne: true,
      questDeckEntries: [],
      playerDeckOrder: [],
      enemyDescriptor: {
        id: "enemy",
        name: "Enemy",
        subtitle: "",
        portraitSeed: 0,
        packageTides: [],
        abilityText: "",
        dreamsignCount: 0,
      },
      enemyDeckDefinition: [],
      dreamcallerSummary: null,
      dreamsignSummaries: [],
      atlasSnapshot: { nodes: {}, edges: {}, startingNodeId: "" },
    },
    reducer: {
      mutable: {
        battleId: "battle:test",
        activeSide: "player",
        turnNumber: 1,
        phase: "main",
        result: null,
        forcedResult: null,
        nextBattleCardOrdinal: 0,
        sides: {
          player: {
            currentEnergy: 0,
            maxEnergy: 0,
            score: 0,
            visibility: {},
            // deck/hand/void/banished/reserve/deployed all elided
          },
          enemy: {
            currentEnergy: 0,
            maxEnergy: 0,
            score: 0,
            visibility: {},
          },
        },
        // cardInstances elided
      },
      // history / lastTransition elided
      commandSerial: 3,
    },
    ...overrides,
  };
}

describe("normalizeBattleStateSnapshot", () => {
  it("returns null for null input", () => {
    expect(normalizeBattleStateSnapshot(null)).toBeNull();
  });

  it("returns null when init is missing", () => {
    expect(
      normalizeBattleStateSnapshot({ reducer: { commandSerial: 0 } }),
    ).toBeNull();
  });

  it("fills empty arrays and missing slot records", () => {
    const result = normalizeBattleStateSnapshot(makeRawSnapshot({}));
    expect(result).not.toBeNull();
    const reducer = result!.reducer;
    expect(reducer.history).toEqual({ past: [], future: [] });
    expect(reducer.lastTransition).toBeNull();
    expect(reducer.mutable.cardInstances).toEqual({});

    for (const id of RESERVE_SLOT_IDS) {
      expect(reducer.mutable.sides.player.reserve[id]).toBeNull();
      expect(reducer.mutable.sides.enemy.reserve[id]).toBeNull();
    }
    for (const id of DEPLOY_SLOT_IDS) {
      expect(reducer.mutable.sides.player.deployed[id]).toBeNull();
      expect(reducer.mutable.sides.enemy.deployed[id]).toBeNull();
    }

    expect(reducer.mutable.sides.player.deck).toEqual([]);
    expect(reducer.mutable.sides.player.hand).toEqual([]);
    expect(reducer.mutable.sides.player.void).toEqual([]);
    expect(reducer.mutable.sides.player.banished).toEqual([]);
    expect(reducer.commandSerial).toBe(3);
  });

  it("defaults missing commandSerial to 0", () => {
    const raw = makeRawSnapshot({});
    delete (raw.reducer as Record<string, unknown>).commandSerial;
    const result = normalizeBattleStateSnapshot(raw);
    expect(result?.reducer.commandSerial).toBe(0);
  });

  it("defaults missing lastActivityKind to null", () => {
    const raw = makeRawSnapshot({});
    expect(
      (raw.reducer as Record<string, unknown>).lastActivityKind,
    ).toBeUndefined();
    const result = normalizeBattleStateSnapshot(raw);
    expect(result?.reducer.lastActivityKind).toBeNull();
  });

  it("fills an RTDB-stripped empty dreamsign summary list on battle init", () => {
    const raw = makeRawSnapshot({});
    delete (raw.init as Record<string, unknown>).dreamsignSummaries;

    const result = normalizeBattleStateSnapshot(raw);

    expect(result?.init.dreamsignSummaries).toEqual([]);
  });

  it("omits the metadata.payload key entirely when an RTDB-stripped history entry has no payload", () => {
    // Simulates an entry that round-tripped through RTDB after being written
    // with an empty `payload: {}` (e.g. END_TURN). RTDB drops empty objects on
    // write, so the snapshot we read back has no `payload` key at all.
    // Normalization must not re-introduce `payload: undefined`, because
    // Firebase's runTransaction validator rejects any returned tree that
    // contains `undefined`.
    const stripped = makeRawSnapshot({
      reducer: {
        mutable: makeRawSnapshot({}).reducer.mutable,
        history: {
          past: [
            {
              metadata: {
                commandId: "END_TURN",
                label: "End turn",
                kind: "command",
                isComposite: false,
                actor: "player",
                sourceSurface: "action-bar",
                targets: [],
                timestamp: 0,
                undoPayload: null,
                // `payload` key intentionally absent (RTDB-stripped {}).
              },
              before: { mutable: makeRawSnapshot({}).reducer.mutable },
              after: { mutable: makeRawSnapshot({}).reducer.mutable },
            },
          ],
        },
        commandSerial: 1,
      },
    });
    const result = normalizeBattleStateSnapshot(stripped);
    expect(result).not.toBeNull();
    const entry = result!.reducer.history.past[0];
    // The repaired metadata must not contain `payload` as an own property at
    // all (an explicit `payload: undefined` would also fail this check, since
    // Object.prototype.hasOwnProperty considers `undefined` values present).
    expect(Object.prototype.hasOwnProperty.call(entry.metadata, "payload")).toBe(
      false,
    );
  });

  it("survives runTransaction's no-undefined validator after normalizing a payload-less history entry", () => {
    // This is the integration check that would have caught bug #1: feed the
    // normalized snapshot through a mock that mirrors firebase-database's
    // runTransaction guard, which rejects any tree containing `undefined`.
    const stripped = makeRawSnapshot({
      reducer: {
        mutable: makeRawSnapshot({}).reducer.mutable,
        history: {
          past: [
            {
              metadata: {
                commandId: "END_TURN",
                label: "End turn",
                kind: "command",
                isComposite: false,
                actor: "player",
                sourceSurface: "action-bar",
                targets: [],
                timestamp: 0,
                undoPayload: null,
              },
              before: { mutable: makeRawSnapshot({}).reducer.mutable },
              after: { mutable: makeRawSnapshot({}).reducer.mutable },
            },
          ],
        },
        commandSerial: 1,
      },
    });
    const normalized = normalizeBattleStateSnapshot(stripped);
    function assertNoUndefinedDeep(value: unknown, path: string): void {
      if (value === undefined) {
        throw new Error(`Data returned contains undefined in property '${path}'`);
      }
      if (value === null) return;
      if (Array.isArray(value)) {
        value.forEach((item, index) =>
          assertNoUndefinedDeep(item, `${path}.${index}`),
        );
        return;
      }
      if (typeof value === "object") {
        for (const [key, child] of Object.entries(value)) {
          assertNoUndefinedDeep(child, `${path}.${key}`);
        }
      }
    }
    expect(() => assertNoUndefinedDeep(normalized, "rooms.r.battleState")).not.toThrow();
  });
});

describe("ensureBattleSession", () => {
  function buildEmptyRoom(): MultiplayerRoom {
    return {
      metadata: { schemaVersion: 2, createdAt: "0", updatedAt: "0" },
      questState: null,
      battleState: null,
      presence: {},
      actionLog: {},
    };
  }

  it("commits a new SharedBattleState and a battle:INIT action-log entry when slot is null", async () => {
    let captured: unknown;
    const emptyRoom = buildEmptyRoom();
    mockedRunTransaction.mockImplementation((_ref, updater) => {
      captured = updater(emptyRoom);
      return Promise.resolve(undefined);
    });

    await ensureBattleSession({
      database: {} as Database,
      roomId: "room-1",
      init: fakeInit,
      initialMutable: fakeInitial,
      actorId: "client-a",
      now: "2026-05-09T01:02:03.000Z",
      actionId: "init-1",
    });

    expect(captured).toMatchObject({
      battleState: {
        init: fakeInit,
        reducer: {
          mutable: fakeInitial,
          history: { past: [], future: [] },
          lastTransition: null,
          commandSerial: 0,
          lastActivityKind: null,
        },
      },
    });
    const room = captured as MultiplayerRoom;
    expect(room.actionLog?.["init-1"]).toBeDefined();
    expect(room.actionLog!["init-1"].action).toBe("battle:INIT");
    expect(room.actionLog!["init-1"].source).toBe("battle");
    expect(room.actionLog!["init-1"].actorId).toBe("client-a");
    expect(room.actionLog!["init-1"].summary.commandSerial).toBe(0);
    expect(room.metadata.updatedAt).toBe("2026-05-09T01:02:03.000Z");
  });

  it("aborts the transaction when battleState already has init", async () => {
    let captured: unknown;
    const existing: SharedBattleState = {
      init: fakeInit,
      reducer: {
        mutable: fakeInitial,
        history: { past: [], future: [] },
        lastTransition: null,
        commandSerial: 7,
        lastActivityKind: null,
      },
    };
    const existingRoom: MultiplayerRoom = {
      ...buildEmptyRoom(),
      battleState: existing,
    };
    mockedRunTransaction.mockImplementation((_ref, updater) => {
      captured = updater(existingRoom);
      return Promise.resolve(undefined);
    });

    await ensureBattleSession({
      database: {} as Database,
      roomId: "room-1",
      init: fakeInit,
      initialMutable: fakeInitial,
      actorId: "client-a",
      now: "2026-05-09T01:02:03.000Z",
      actionId: "init-1",
    });

    // The init transaction must not write a new action-log entry when an init
    // already exists, and must preserve the prior commandSerial rather than
    // resetting to 0.
    const room = captured as MultiplayerRoom;
    expect(room.actionLog?.["init-1"]).toBeUndefined();
    expect(room.battleState?.reducer.commandSerial).toBe(7);
    expect(room.metadata.updatedAt).toBe("0");
  });
});

describe("applyBattleCommandToRoom", () => {
  it("runs battleControllerReducer inside the room transaction and bumps commandSerial", () => {
    const init = createBattleInit({
      battleEntryKey: "test-1",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
      seedOverride: 1,
    });
    const initial = createInitialBattleState(init);
    const initialRoom: MultiplayerRoom = {
      metadata: { schemaVersion: 2, createdAt: "0", updatedAt: "0" },
      questState: null,
      battleState: {
        init,
        reducer: {
          mutable: initial,
          history: { past: [], future: [] },
          lastTransition: null,
          commandSerial: 0,
          lastActivityKind: null,
        },
      },
      presence: {},
      actionLog: {},
    };

    const next = applyBattleCommandToRoom({
      room: initialRoom,
      command: {
        id: "DEBUG_EDIT",
        edit: {
          kind: "MOVE_CARD_TO_ZONE",
          battleCardId: initial.sides.player.hand[0],
          destination: { side: "player", zone: "reserve", slotId: "R0" },
        },
        sourceSurface: "hand-tray",
      },
      now: "2026-05-09T00:00:00.000Z",
      actorId: "client-a",
      actionId: "action-1",
    });

    expect(next).not.toBe(initialRoom);
    const updatedBattle = next.battleState!;
    expect(updatedBattle.reducer.commandSerial).toBe(1);
    expect(updatedBattle.reducer.history.past.length).toBe(1);
    expect(updatedBattle.reducer.lastActivityKind).toBe("command");
    expect(next.actionLog!["action-1"].action).toBe("battle:DEBUG_EDIT");
    expect(next.actionLog!["action-1"].source).toBe("hand-tray");
    expect(next.actionLog!["action-1"].summary.commandSerial).toBe(1);
    expect(next.metadata.updatedAt).toBe("2026-05-09T00:00:00.000Z");
  });

  it("records the forced result in the action-log summary", () => {
    const init = createBattleInit({
      battleEntryKey: "test-force",
      site: makeBattleTestSite(),
      state: makeBattleTestState(),
      cardDatabase: makeBattleTestCardDatabase(),
      dreamcallers: makeBattleTestDreamcallers(),
      seedOverride: 1,
    });
    const initial = createInitialBattleState(init);
    const initialRoom: MultiplayerRoom = {
      metadata: { schemaVersion: 2, createdAt: "0", updatedAt: "0" },
      questState: null,
      battleState: {
        init,
        reducer: {
          mutable: initial,
          history: { past: [], future: [] },
          lastTransition: null,
          commandSerial: 0,
          lastActivityKind: null,
        },
      },
      presence: {},
      actionLog: {},
    };

    const next = applyBattleCommandToRoom({
      room: initialRoom,
      command: {
        id: "FORCE_RESULT",
        result: "victory",
        sourceSurface: "inspector",
      },
      now: "2026-05-09T00:00:00.000Z",
      actorId: "client-a",
      actionId: "force-1",
    });

    expect(next).not.toBe(initialRoom);
    expect(next.actionLog!["force-1"].summary.result).toBe("victory");
  });

  it("returns the input unchanged when battleState slot is null", () => {
    const room: MultiplayerRoom = {
      metadata: { schemaVersion: 2, createdAt: "0", updatedAt: "0" },
      questState: null,
      battleState: null,
      presence: {},
      actionLog: {},
    };
    const next = applyBattleCommandToRoom({
      room,
      command: {
        id: "DEBUG_EDIT",
        edit: { kind: "SET_PHASE", phase: "dusk" },
        sourceSurface: "action-bar",
      },
      now: "2026-05-09T00:00:00.000Z",
      actorId: "client-a",
      actionId: "action-1",
    });
    expect(next).toBe(room);
  });
});

function buildFreshRoom(): MultiplayerRoom {
  const init = createBattleInit({
    battleEntryKey: "test-undo",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
    seedOverride: 1,
  });
  const initial = createInitialBattleState(init);
  return {
    metadata: { schemaVersion: 2, createdAt: "0", updatedAt: "0" },
    questState: null,
    battleState: {
      init,
      reducer: {
        mutable: initial,
        history: { past: [], future: [] },
        lastTransition: null,
        commandSerial: 0,
        lastActivityKind: null,
      },
    },
    presence: {},
    actionLog: {},
  };
}

// Build a room that already has one committed command in past, so undo
// has something to do.
function buildRoomWithOneCommittedCommand() {
  const initialRoom = buildFreshRoom();
  const initial = initialRoom.battleState!.reducer.mutable;
  return applyBattleCommandToRoom({
    room: initialRoom,
    command: {
      id: "DEBUG_EDIT",
      edit: {
        kind: "MOVE_CARD_TO_ZONE",
        battleCardId: initial.sides.player.hand[0],
        destination: { side: "player", zone: "reserve", slotId: "R0" },
      },
      sourceSurface: "hand-tray",
    },
    now: "2026-05-09T00:00:00.000Z",
    actorId: "client-a",
    actionId: "seed-1",
  });
}

describe("undoBattleInRoom and redoBattleInRoom", () => {
  it("undo moves the latest past entry into future and bumps commandSerial", () => {
    const seeded = buildRoomWithOneCommittedCommand();
    const next = undoBattleInRoom({
      room: seeded,
      now: "2026-05-09T00:00:01.000Z",
      actorId: "client-a",
      actionId: "u1",
    });
    expect(next.battleState!.reducer.history.past.length).toBe(0);
    expect(next.battleState!.reducer.history.future.length).toBe(1);
    expect(next.battleState!.reducer.commandSerial).toBe(
      seeded.battleState!.reducer.commandSerial + 1,
    );
    expect(next.battleState!.reducer.lastActivityKind).toBe("undo");
    expect(next.actionLog!["u1"].action).toBe("battle:UNDO");
    const restoredEntry = next.battleState!.reducer.history.future[0];
    expect(next.actionLog!["u1"].summary.restoredCommandLabel).toBe(
      restoredEntry.metadata.label,
    );
  });

  it("undo no-ops when past is empty", () => {
    const seeded = buildFreshRoom();
    const next = undoBattleInRoom({
      room: seeded,
      now: "2026-05-09T00:00:01.000Z",
      actorId: "client-a",
      actionId: "u1",
    });
    expect(next).toBe(seeded);
  });

  it("redo moves head of future to past and bumps commandSerial", () => {
    const seeded = buildRoomWithOneCommittedCommand();
    const undone = undoBattleInRoom({
      room: seeded,
      now: "2026-05-09T00:00:01.000Z",
      actorId: "client-a",
      actionId: "u1",
    });
    const next = redoBattleInRoom({
      room: undone,
      now: "2026-05-09T00:00:02.000Z",
      actorId: "client-a",
      actionId: "r1",
    });
    expect(next.battleState!.reducer.history.past.length).toBe(1);
    expect(next.battleState!.reducer.history.future.length).toBe(0);
    expect(next.battleState!.reducer.commandSerial).toBe(
      undone.battleState!.reducer.commandSerial + 1,
    );
    expect(next.battleState!.reducer.lastActivityKind).toBe("redo");
    expect(next.actionLog!["r1"].action).toBe("battle:REDO");
    const restoredEntry =
      next.battleState!.reducer.history.past[
        next.battleState!.reducer.history.past.length - 1
      ];
    expect(next.actionLog!["r1"].summary.restoredCommandLabel).toBe(
      restoredEntry.metadata.label,
    );
  });

  it("redo no-ops when future is empty", () => {
    const seeded = buildFreshRoom();
    const next = redoBattleInRoom({
      room: seeded,
      now: "2026-05-09T00:00:01.000Z",
      actorId: "client-a",
      actionId: "r1",
    });
    expect(next).toBe(seeded);
  });

  it("undo on null battleState returns the room unchanged", () => {
    const room: MultiplayerRoom = {
      metadata: { schemaVersion: 2, createdAt: "0", updatedAt: "0" },
      questState: null,
      battleState: null,
      presence: {},
      actionLog: {},
    };
    const next = undoBattleInRoom({
      room,
      now: "x",
      actorId: "client-a",
      actionId: "u1",
    });
    expect(next).toBe(room);
  });
});

describe("resetBattleInRoom", () => {
  it("clears history and resets mutable to the prepared initial state", () => {
    // Reuse the seeded helper from the undo/redo tests — that helper builds
    // a room with one committed move command in history.past.
    const seeded = buildRoomWithOneCommittedCommand();
    const next = resetBattleInRoom({
      room: seeded,
      now: "2026-05-09T00:00:00.000Z",
      actorId: "client-a",
      actionId: "r1",
    });
    expect(next.battleState!.reducer.history).toEqual({ past: [], future: [] });
    expect(next.battleState!.reducer.lastTransition).toBeNull();
    expect(next.battleState!.reducer.commandSerial).toBe(
      seeded.battleState!.reducer.commandSerial + 1,
    );
    expect(next.battleState!.reducer.lastActivityKind).toBe("command");
    expect(next.actionLog!["r1"].action).toBe("battle:RESET");
  });

  it("returns the room unchanged when battleState is null", () => {
    const room: MultiplayerRoom = {
      metadata: { schemaVersion: 2, createdAt: "0", updatedAt: "0" },
      questState: null,
      battleState: null,
      presence: {},
      actionLog: {},
    };
    const next = resetBattleInRoom({
      room,
      now: "x",
      actorId: "client-a",
      actionId: "r1",
    });
    expect(next).toBe(room);
  });
});

describe("clearBattleStateInRoom", () => {
  it("nulls the slot", () => {
    const seeded = buildRoomWithOneCommittedCommand();
    expect(seeded.battleState).not.toBeNull();
    const next = clearBattleStateInRoom({
      room: seeded,
      now: "2026-05-09T00:00:00.000Z",
    });
    expect(next.battleState).toBeNull();
    expect(next.metadata.updatedAt).toBe("2026-05-09T00:00:00.000Z");
  });

  it("is idempotent on already-null slot", () => {
    const room: MultiplayerRoom = {
      metadata: { schemaVersion: 2, createdAt: "0", updatedAt: "0" },
      questState: null,
      battleState: null,
      presence: {},
      actionLog: {},
    };
    const next = clearBattleStateInRoom({ room, now: "x" });
    expect(next).toBe(room);
  });
});
