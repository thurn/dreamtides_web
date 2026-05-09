import type { Database } from "firebase/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiplayerRoom } from "./room-types";
import { buildActionLogEntry } from "./action-log";
import {
  createRoom,
  createRoomRecord,
  pruneRoomActionLog,
  runRoomTransaction,
  subscribeToRoom,
  writePresence,
  writeRoomUpdate,
} from "./room-service";
import { createDefaultState } from "../state/quest-context";

type SnapshotStub = {
  exists: () => boolean;
  val: () => unknown;
};
type SnapshotListener = (snapshot: SnapshotStub) => void;
type ErrorListener = (error: Error) => void;
type TransactionUpdater = (current: unknown) => unknown;

const firebaseMocks = vi.hoisted(() => {
  const remove = vi.fn();

  return {
    onDisconnect: vi.fn(() => ({ remove })),
    onValue: vi.fn(),
    ref: vi.fn((database: Database, path?: string) => ({ database, path })),
    remove,
    runTransaction: vi.fn(),
    set: vi.fn(),
    update: vi.fn(),
  };
});

vi.mock("firebase/database", () => ({
  onDisconnect: firebaseMocks.onDisconnect,
  onValue: firebaseMocks.onValue,
  ref: firebaseMocks.ref,
  runTransaction: firebaseMocks.runTransaction,
  set: firebaseMocks.set,
  update: firebaseMocks.update,
}));

const database = { app: { name: "test-app" } } as Database;
const timestamp = "2026-05-08T12:00:00.000Z";

function makeActionLog(count: number): NonNullable<MultiplayerRoom["actionLog"]> {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => {
      const actionNumber = index + 1;
      return [
        `action-${actionNumber}`,
        buildActionLogEntry({
          actorId: "client-1",
          action: "testAction",
          source: "test",
          summary: { actionNumber },
          timestamp: `2026-05-08T12:${String(Math.floor(index / 60)).padStart(2, "0")}:${String(
            index % 60,
          ).padStart(2, "0")}.000Z`,
        }),
      ];
    }),
  );
}

describe("room service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    firebaseMocks.remove.mockResolvedValue(undefined);
    firebaseMocks.runTransaction.mockResolvedValue({ committed: true, snapshot: null });
    firebaseMocks.set.mockResolvedValue(undefined);
    firebaseMocks.update.mockResolvedValue(undefined);
  });

  it("builds an empty room record with schema metadata", () => {
    expect(createRoomRecord(timestamp)).toEqual({
      metadata: {
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      questState: null,
      presence: {},
      actionLog: {},
    });
  });

  it("creates a room at the room path", async () => {
    await createRoom(database, "ab12", timestamp);

    expect(firebaseMocks.ref).toHaveBeenCalledWith(database, "rooms/ab12");
    expect(firebaseMocks.set).toHaveBeenCalledWith(
      { database, path: "rooms/ab12" },
      createRoomRecord(timestamp),
    );
  });

  it("subscribes to room snapshots and emits ready records", () => {
    const listener = vi.fn();
    const unsubscribe = vi.fn();
    const room = createRoomRecord(timestamp);
    firebaseMocks.onValue.mockImplementation((_entryRef, next: SnapshotListener) => {
      next({ exists: () => true, val: () => room });
      return unsubscribe;
    });

    expect(subscribeToRoom(database, "ab12", listener)).toBe(unsubscribe);

    expect(firebaseMocks.ref).toHaveBeenCalledWith(database, "rooms/ab12");
    expect(listener).toHaveBeenCalledWith({ status: "ready", room });
  });

  it("normalizes room snapshots with RTDB-omitted empty values", () => {
    const listener = vi.fn();
    const room = {
      metadata: {
        schemaVersion: 1,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
    firebaseMocks.onValue.mockImplementation((_entryRef, next: SnapshotListener) => {
      next({ exists: () => true, val: () => room });
      return vi.fn();
    });

    subscribeToRoom(database, "ab12", listener);

    expect(listener).toHaveBeenCalledWith({
      status: "ready",
      room: {
        metadata: room.metadata,
        questState: null,
        presence: {},
        actionLog: {},
      },
    });
  });

  it("normalizes legacy quest state snapshots to include site runtime", () => {
    const listener = vi.fn();
    const legacyQuestState = { ...createDefaultState() } as Partial<
      ReturnType<typeof createDefaultState>
    >;
    delete legacyQuestState.siteRuntime;
    const room = {
      ...createRoomRecord(timestamp),
      questState: legacyQuestState,
    };
    firebaseMocks.onValue.mockImplementation((_entryRef, next: SnapshotListener) => {
      next({ exists: () => true, val: () => room });
      return vi.fn();
    });

    subscribeToRoom(database, "ab12", listener);

    expect(listener).toHaveBeenCalledWith({
      status: "ready",
      room: {
        ...room,
        questState: {
          ...legacyQuestState,
          siteRuntime: {},
        },
      },
    });
  });

  it("emits missing when the room snapshot does not exist", () => {
    const listener = vi.fn();
    firebaseMocks.onValue.mockImplementation((_entryRef, next: SnapshotListener) => {
      next({ exists: () => false, val: () => null });
      return vi.fn();
    });

    subscribeToRoom(database, "ab12", listener);

    expect(listener).toHaveBeenCalledWith({ status: "missing" });
  });

  it("emits Firebase subscription errors", () => {
    const listener = vi.fn();
    firebaseMocks.onValue.mockImplementation(
      (_entryRef, _next: SnapshotListener, error: ErrorListener) => {
        error(new Error("permission denied"));
        return vi.fn();
      },
    );

    subscribeToRoom(database, "ab12", listener);

    expect(listener).toHaveBeenCalledWith({ status: "error", message: "permission denied" });
  });

  it("writes connected presence and registers disconnect cleanup", async () => {
    await writePresence(database, "ab12", "client-1", timestamp);

    expect(firebaseMocks.ref).toHaveBeenCalledWith(database, "rooms/ab12/presence/client-1");
    expect(firebaseMocks.set).toHaveBeenCalledWith(
      { database, path: "rooms/ab12/presence/client-1" },
      { connected: true, lastSeenAt: timestamp },
    );
    expect(firebaseMocks.onDisconnect).toHaveBeenCalledWith({
      database,
      path: "rooms/ab12/presence/client-1",
    });
    expect(firebaseMocks.remove).toHaveBeenCalledOnce();
    expect(firebaseMocks.remove.mock.invocationCallOrder[0]).toBeLessThan(
      firebaseMocks.set.mock.invocationCallOrder[0],
    );
  });

  it("runs room transactions and preserves current data when updater returns undefined", async () => {
    const current = createRoomRecord(timestamp);
    const updater = vi.fn(() => undefined);
    firebaseMocks.runTransaction.mockImplementation(
      (_entryRef, transactionUpdater: TransactionUpdater) => {
        expect(transactionUpdater(current)).toBe(current);
        return Promise.resolve({ committed: true, snapshot: null });
      },
    );

    await runRoomTransaction(database, "ab12", updater);

    expect(firebaseMocks.ref).toHaveBeenCalledWith(database, "rooms/ab12");
    expect(updater).toHaveBeenCalledWith(current);
  });

  it("writes focused updates from the root", async () => {
    const updateMap = {
      "rooms/ab12/metadata/updatedAt": timestamp,
    };

    await writeRoomUpdate(database, updateMap);

    expect(firebaseMocks.ref).toHaveBeenCalledWith(database);
    expect(firebaseMocks.update).toHaveBeenCalledWith({ database, path: undefined }, updateMap);
  });

  it("prunes action logs from the latest transaction value", async () => {
    const current = makeActionLog(62);
    firebaseMocks.runTransaction.mockImplementation(
      (_entryRef, transactionUpdater: TransactionUpdater) => {
        const next = transactionUpdater(current) as NonNullable<MultiplayerRoom["actionLog"]>;

        expect(Object.keys(next)).toHaveLength(50);
        expect(next["action-12"]).toBeUndefined();
        expect(next["action-13"]?.timestamp).toBe("2026-05-08T12:00:12.000Z");
        expect(next["action-62"]?.timestamp).toBe("2026-05-08T12:01:01.000Z");

        return Promise.resolve({ committed: true, snapshot: null });
      },
    );

    await pruneRoomActionLog(database, "ab12");

    expect(firebaseMocks.ref).toHaveBeenCalledWith(database, "rooms/ab12/actionLog");
  });

  it("keeps action logs at the maintenance threshold", async () => {
    const current = makeActionLog(60);
    firebaseMocks.runTransaction.mockImplementation(
      (_entryRef, transactionUpdater: TransactionUpdater) => {
        expect(transactionUpdater(current)).toBe(current);
        return Promise.resolve({ committed: true, snapshot: null });
      },
    );

    await pruneRoomActionLog(database, "ab12");
  });

  it("allows transaction updaters to write null", async () => {
    const current: MultiplayerRoom = createRoomRecord(timestamp);
    firebaseMocks.runTransaction.mockImplementation(
      (_entryRef, transactionUpdater: TransactionUpdater) => {
        expect(transactionUpdater(current)).toBeNull();
        return Promise.resolve({ committed: true, snapshot: null });
      },
    );

    await runRoomTransaction(database, "ab12", () => null);
  });
});
