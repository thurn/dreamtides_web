import type { Database } from "firebase/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiplayerRoom } from "./room-types";
import { buildActionLogEntry } from "./action-log";
import {
  createRoom,
  createRoomRecord,
  createRoomReplacingAll,
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
        schemaVersion: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      questState: null,
      battleState: null,
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

  it("replaces the entire rooms tree when creating-and-replacing", async () => {
    await createRoomReplacingAll(database, "ab12", timestamp);

    expect(firebaseMocks.ref).toHaveBeenCalledWith(database, "rooms");
    expect(firebaseMocks.set).toHaveBeenCalledWith(
      { database, path: "rooms" },
      { ab12: createRoomRecord(timestamp) },
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
        schemaVersion: 2,
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
        battleState: null,
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

  it("restores RTDB-stripped empty arrays and null fields on quest state", () => {
    const listener = vi.fn();
    const stripped = {
      essence: 250,
      completionLevel: 0,
      atlas: { startingNodeId: "dreamscape-1" },
      screen: { type: "questStart" },
    };
    const room = {
      ...createRoomRecord(timestamp),
      questState: stripped,
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
          essence: 250,
          deck: [],
          dreamcaller: null,
          resolvedPackage: null,
          cardSourceDebug: null,
          remainingDreamsignPool: [],
          dreamsigns: [],
          completionLevel: 0,
          atlas: { nodes: {}, edges: [], startingNodeId: "dreamscape-1" },
          currentDreamscape: null,
          visitedSites: [],
          siteRuntime: {},
          draftState: null,
          screen: { type: "questStart" },
          activeSiteId: null,
          failureSummary: null,
          hasSeenStartingDeckPopup: false,
        },
      },
    });
  });

  it("defaults hasSeenStartingDeckPopup to false when RTDB strips the field, and preserves true", () => {
    const stripped = {
      essence: 250,
      completionLevel: 0,
      atlas: { startingNodeId: "dreamscape-1" },
      screen: { type: "questStart" },
      // hasSeenStartingDeckPopup intentionally missing — RTDB strips
      // boolean defaults that were written as `false`.
    };
    const listener1 = vi.fn();
    firebaseMocks.onValue.mockImplementationOnce(
      (_entryRef, next: SnapshotListener) => {
        next({
          exists: () => true,
          val: () => ({ ...createRoomRecord(timestamp), questState: stripped }),
        });
        return vi.fn();
      },
    );
    subscribeToRoom(database, "ab12", listener1);
    const ready1 = listener1.mock.calls[0][0] as { room: MultiplayerRoom };
    expect(ready1.room.questState?.hasSeenStartingDeckPopup).toBe(false);

    const dismissed = {
      ...stripped,
      hasSeenStartingDeckPopup: true,
    };
    const listener2 = vi.fn();
    firebaseMocks.onValue.mockImplementationOnce(
      (_entryRef, next: SnapshotListener) => {
        next({
          exists: () => true,
          val: () => ({ ...createRoomRecord(timestamp), questState: dismissed }),
        });
        return vi.fn();
      },
    );
    subscribeToRoom(database, "ab12", listener2);
    const ready2 = listener2.mock.calls[0][0] as { room: MultiplayerRoom };
    expect(ready2.room.questState?.hasSeenStartingDeckPopup).toBe(true);
  });

  it("restores stripped fields on nested draft state and dreamscape nodes", () => {
    const listener = vi.fn();
    const strippedQuestState = {
      ...createDefaultState(),
      atlas: {
        startingNodeId: "dreamscape-1",
        edges: [],
        nodes: {
          "dreamscape-1": {
            id: "dreamscape-1",
            biomeName: "Verdant Hollow",
            biomeColor: "#22c55e",
            position: { x: 0, y: 0 },
            status: "available" as const,
          },
        },
      },
      draftState: {
        pickNumber: 1,
        sitePicksCompleted: 0,
        remainingCopiesByCard: { "42": 2 },
      },
    };
    const room = {
      ...createRoomRecord(timestamp),
      questState: strippedQuestState,
    };
    firebaseMocks.onValue.mockImplementation((_entryRef, next: SnapshotListener) => {
      next({ exists: () => true, val: () => room });
      return vi.fn();
    });

    subscribeToRoom(database, "ab12", listener);

    const ready = listener.mock.calls[0][0] as { room: MultiplayerRoom };
    const restoredNode = ready.room.questState?.atlas.nodes["dreamscape-1"];
    expect(restoredNode?.sites).toEqual([]);
    expect(restoredNode?.enhancedSiteType).toBeNull();
    expect(ready.room.questState?.draftState).toEqual({
      pickNumber: 1,
      sitePicksCompleted: 0,
      remainingCopiesByCard: { "42": 2 },
      currentOffer: [],
      activeSiteId: null,
    });
  });

  it("restores RTDB-stripped tide arrays on cardSourceDebug entries", () => {
    const listener = vi.fn();
    const strippedQuestState = {
      ...createDefaultState(),
      cardSourceDebug: {
        screenLabel: "Draft Picks",
        surface: "Draft",
        entries: [
          // Fallback entry: RTDB strips empty `matchedMandatoryTides` and
          // `matchedOptionalTides`. Also strip `cardTides` so the
          // normalizer must restore all three.
          {
            cardNumber: 711,
            cardName: "Lonely Fallback",
            isFallback: true,
          },
          // Selected entry: RTDB strips only the empty `matchedOptionalTides`.
          {
            cardNumber: 712,
            cardName: "Required Match",
            cardTides: ["core"],
            matchedMandatoryTides: ["core"],
            isFallback: false,
          },
        ],
      },
    };
    const room = {
      ...createRoomRecord(timestamp),
      questState: strippedQuestState,
    };
    firebaseMocks.onValue.mockImplementation((_entryRef, next: SnapshotListener) => {
      next({ exists: () => true, val: () => room });
      return vi.fn();
    });

    subscribeToRoom(database, "ab12", listener);

    const ready = listener.mock.calls[0][0] as { room: MultiplayerRoom };
    expect(ready.room.questState?.cardSourceDebug).toEqual({
      screenLabel: "Draft Picks",
      surface: "Draft",
      entries: [
        {
          cardNumber: 711,
          cardName: "Lonely Fallback",
          cardTides: [],
          matchedMandatoryTides: [],
          matchedOptionalTides: [],
          isFallback: true,
        },
        {
          cardNumber: 712,
          cardName: "Required Match",
          cardTides: ["core"],
          matchedMandatoryTides: ["core"],
          matchedOptionalTides: [],
          isFallback: false,
        },
      ],
    });
  });

  it("restores stripped transfiguration on deck entries round-tripped through RTDB", () => {
    const listener = vi.fn();
    const strippedQuestState = {
      ...createDefaultState(),
      deck: [
        { entryId: "deck-1", cardNumber: 711, isBane: false },
        { entryId: "deck-2", cardNumber: 712, isBane: false },
      ],
    };
    const room = {
      ...createRoomRecord(timestamp),
      questState: strippedQuestState,
    };
    firebaseMocks.onValue.mockImplementation((_entryRef, next: SnapshotListener) => {
      next({ exists: () => true, val: () => room });
      return vi.fn();
    });

    subscribeToRoom(database, "ab12", listener);

    const ready = listener.mock.calls[0][0] as { room: MultiplayerRoom };
    expect(ready.room.questState?.deck).toEqual([
      { entryId: "deck-1", cardNumber: 711, isBane: false, transfiguration: null },
      { entryId: "deck-2", cardNumber: 712, isBane: false, transfiguration: null },
    ]);
  });

  it("strips unrecognized awakening field from rehydrated dreamcaller and resolved package", () => {
    const listener = vi.fn();
    const strippedQuestState = {
      ...createDefaultState(),
      dreamcaller: {
        id: "dc-1",
        name: "Rael",
        title: "Chain Accelerant",
        renderedText: "Old card.",
        imageNumber: "0001",
        awakening: 3,
      },
      resolvedPackage: {
        dreamcaller: {
          id: "dc-1",
          name: "Rael",
          title: "Chain Accelerant",
          renderedText: "Old card.",
          imageNumber: "0001",
          mandatoryTides: ["alpha"],
          optionalTides: ["beta"],
          awakening: 3,
        },
        mandatoryTides: ["alpha"],
        optionalSubset: ["beta"],
        selectedTides: ["alpha", "beta"],
        draftPoolCopiesByCard: {},
        dreamsignPoolIds: [],
        mandatoryOnlyPoolSize: 0,
        draftPoolSize: 0,
        doubledCardCount: 0,
        legalSubsetCount: 0,
        preferredSubsetCount: 0,
      },
    };
    const room = {
      ...createRoomRecord(timestamp),
      questState: strippedQuestState,
    };
    firebaseMocks.onValue.mockImplementation((_entryRef, next: SnapshotListener) => {
      next({ exists: () => true, val: () => room });
      return vi.fn();
    });

    subscribeToRoom(database, "ab12", listener);

    const ready = listener.mock.calls[0][0] as { room: MultiplayerRoom };
    const dreamcaller = ready.room.questState?.dreamcaller as Record<
      string,
      unknown
    > | null;
    expect(dreamcaller).not.toBeNull();
    expect(dreamcaller).not.toHaveProperty("awakening");
    const resolvedDreamcaller = (
      ready.room.questState?.resolvedPackage as { dreamcaller: Record<string, unknown> } | null
    )?.dreamcaller;
    expect(resolvedDreamcaller).not.toHaveProperty("awakening");
  });

  it("defaults startingEssence on rehydrated dreamcaller and resolved package when stripped", () => {
    const listener = vi.fn();
    const strippedQuestState = {
      ...createDefaultState(),
      dreamcaller: {
        id: "dc-old",
        name: "Legacy Caller",
        title: "Pre-essence Era",
        renderedText: "Old caller without a tuned starting value.",
        imageNumber: "0001",
      },
      resolvedPackage: {
        dreamcaller: {
          id: "dc-old",
          name: "Legacy Caller",
          title: "Pre-essence Era",
          renderedText: "Old caller without a tuned starting value.",
          imageNumber: "0001",
          mandatoryTides: ["alpha"],
          optionalTides: ["beta"],
        },
        mandatoryTides: ["alpha"],
        optionalSubset: ["beta"],
        selectedTides: ["alpha", "beta"],
        draftPoolCopiesByCard: {},
        dreamsignPoolIds: [],
        mandatoryOnlyPoolSize: 0,
        draftPoolSize: 0,
        doubledCardCount: 0,
        legalSubsetCount: 0,
        preferredSubsetCount: 0,
      },
    };
    const room = {
      ...createRoomRecord(timestamp),
      questState: strippedQuestState,
    };
    firebaseMocks.onValue.mockImplementation((_entryRef, next: SnapshotListener) => {
      next({ exists: () => true, val: () => room });
      return vi.fn();
    });

    subscribeToRoom(database, "ab12", listener);

    const ready = listener.mock.calls[0][0] as { room: MultiplayerRoom };
    expect(ready.room.questState?.dreamcaller?.startingEssence).toBe(250);
    expect(
      ready.room.questState?.resolvedPackage?.dreamcaller.startingEssence,
    ).toBe(250);
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

  it("normalizes RTDB-stripped fields before invoking transaction updaters", async () => {
    const stripped = {
      metadata: {
        schemaVersion: 2,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    };
    const updater = vi.fn(() => undefined);
    firebaseMocks.runTransaction.mockImplementation(
      (_entryRef, transactionUpdater: TransactionUpdater) => {
        transactionUpdater(stripped);
        return Promise.resolve({ committed: true, snapshot: null });
      },
    );

    await runRoomTransaction(database, "ab12", updater);

    expect(updater).toHaveBeenCalledWith({
      metadata: stripped.metadata,
      questState: null,
      battleState: null,
      presence: {},
      actionLog: {},
    });
  });

  it("passes null to transaction updaters when current data is missing", async () => {
    const updater = vi.fn(() => null);
    firebaseMocks.runTransaction.mockImplementation(
      (_entryRef, transactionUpdater: TransactionUpdater) => {
        transactionUpdater(null);
        return Promise.resolve({ committed: true, snapshot: null });
      },
    );

    await runRoomTransaction(database, "ab12", updater);

    expect(updater).toHaveBeenCalledWith(null);
  });

  it("writes focused updates from the root", async () => {
    const updateMap = {
      "rooms/ab12/metadata/updatedAt": timestamp,
    };

    await writeRoomUpdate(database, "ab12", updateMap);

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

  it("serializes writes against the same room so transactions are not aborted", async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const transactionGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    firebaseMocks.runTransaction.mockImplementation(async () => {
      order.push("transaction:start");
      await transactionGate;
      order.push("transaction:commit");
      return { committed: true, snapshot: null };
    });
    firebaseMocks.update.mockImplementation(() => {
      order.push("update:run");
      return Promise.resolve();
    });

    const txPromise = runRoomTransaction(database, "ab12", () => null);
    const updatePromise = writeRoomUpdate(database, "ab12", {
      "rooms/ab12/metadata/updatedAt": timestamp,
    });

    await Promise.resolve();
    expect(order).toEqual(["transaction:start"]);

    release();
    await txPromise;
    await updatePromise;

    expect(order).toEqual([
      "transaction:start",
      "transaction:commit",
      "update:run",
    ]);
  });

  it("does not block writes for a different room while one room is in flight", async () => {
    const order: string[] = [];
    let release: () => void = () => undefined;
    const transactionGate = new Promise<void>((resolve) => {
      release = resolve;
    });

    firebaseMocks.runTransaction.mockImplementationOnce(async () => {
      order.push("room-a:transaction:start");
      await transactionGate;
      order.push("room-a:transaction:commit");
      return { committed: true, snapshot: null };
    });
    firebaseMocks.update.mockImplementation(() => {
      order.push("room-b:update:run");
      return Promise.resolve();
    });

    const aPromise = runRoomTransaction(database, "room-a", () => null);
    const bPromise = writeRoomUpdate(database, "room-b", {
      "rooms/room-b/metadata/updatedAt": timestamp,
    });

    await bPromise;
    expect(order).toEqual(["room-a:transaction:start", "room-b:update:run"]);

    release();
    await aPromise;
    expect(order).toEqual([
      "room-a:transaction:start",
      "room-b:update:run",
      "room-a:transaction:commit",
    ]);
  });
});
