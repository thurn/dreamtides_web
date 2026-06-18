import type { Database } from "firebase/database";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MultiplayerRoom } from "./room-types";
import { buildActionLogEntry } from "./action-log";
import {
  createRoom,
  createRoomEvictingStale,
  createRoomRecord,
  isRoomStale,
  pruneRoomActionLog,
  ROOM_PRESERVATION_WINDOW_MS,
  runRoomTransaction,
  subscribeToRoom,
  writePresence,
  writeRoomUpdate,
} from "./room-service";
import { createDefaultState } from "../state/quest-context";
import { DEFAULT_STARTING_ESSENCE } from "../types/content";

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
    get: vi.fn(),
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
  get: firebaseMocks.get,
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
    firebaseMocks.get.mockResolvedValue({ exists: () => false, val: () => null });
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

  it("writes only the new room when no other rooms exist", async () => {
    firebaseMocks.get.mockResolvedValue({ exists: () => false, val: () => null });

    await createRoomEvictingStale(database, "ab12", timestamp);

    expect(firebaseMocks.ref).toHaveBeenCalledWith(database, "rooms");
    expect(firebaseMocks.get).toHaveBeenCalledWith({ database, path: "rooms" });
    expect(firebaseMocks.update).toHaveBeenCalledWith(
      { database, path: "rooms" },
      { ab12: createRoomRecord(timestamp) },
    );
    expect(firebaseMocks.set).not.toHaveBeenCalled();
  });

  it("preserves sibling rooms created within the last 24 hours", async () => {
    // Sibling room created 12 hours before `timestamp`. It must survive.
    const recentSiblingCreatedAt = "2026-05-08T00:00:00.000Z";
    const recentSibling = {
      ...createRoomRecord(recentSiblingCreatedAt),
      questState: { essence: 42 },
    };
    firebaseMocks.get.mockResolvedValue({
      exists: () => true,
      val: () => ({ recent: recentSibling }),
    });

    await createRoomEvictingStale(database, "ab12", timestamp);

    expect(firebaseMocks.update).toHaveBeenCalledWith(
      { database, path: "rooms" },
      { ab12: createRoomRecord(timestamp) },
    );
    const updateCall = firebaseMocks.update.mock.calls[0][1] as Record<string, unknown>;
    expect(updateCall).not.toHaveProperty("recent");
  });

  it("evicts sibling rooms older than the 24-hour preservation window", async () => {
    // Sibling room created 25 hours before `timestamp`. It must be evicted
    // by being written as `null` in the multi-path update.
    const staleCreatedAt = "2026-05-07T11:00:00.000Z";
    const staleRoom = createRoomRecord(staleCreatedAt);
    firebaseMocks.get.mockResolvedValue({
      exists: () => true,
      val: () => ({ stale: staleRoom }),
    });

    await createRoomEvictingStale(database, "ab12", timestamp);

    expect(firebaseMocks.update).toHaveBeenCalledWith(
      { database, path: "rooms" },
      {
        ab12: createRoomRecord(timestamp),
        stale: null,
      },
    );
  });

  it("preserves sibling rooms whose createdAt is missing or unparseable", async () => {
    // Backwards compatibility: legacy rooms predating room metadata, or
    // rooms whose `createdAt` got stripped by RTDB, must not be silently
    // wiped by the eviction policy.
    const legacyMissingMetadata = { questState: null, presence: {}, actionLog: {} };
    const legacyEmptyCreatedAt = {
      metadata: { schemaVersion: 1, createdAt: "", updatedAt: "" },
    };
    const legacyUnparseable = {
      metadata: { schemaVersion: 1, createdAt: "not-an-iso-date", updatedAt: "" },
    };
    firebaseMocks.get.mockResolvedValue({
      exists: () => true,
      val: () => ({
        legacyA: legacyMissingMetadata,
        legacyB: legacyEmptyCreatedAt,
        legacyC: legacyUnparseable,
      }),
    });

    await createRoomEvictingStale(database, "ab12", timestamp);

    expect(firebaseMocks.update).toHaveBeenCalledWith(
      { database, path: "rooms" },
      { ab12: createRoomRecord(timestamp) },
    );
    const updateCall = firebaseMocks.update.mock.calls[0][1] as Record<string, unknown>;
    expect(updateCall).not.toHaveProperty("legacyA");
    expect(updateCall).not.toHaveProperty("legacyB");
    expect(updateCall).not.toHaveProperty("legacyC");
  });

  it("evicts only the stale rooms in a mixed sibling set", async () => {
    const recent = createRoomRecord("2026-05-08T11:00:00.000Z"); // 1h old
    const borderline = createRoomRecord("2026-05-07T13:00:00.000Z"); // 23h old, preserve
    const stale = createRoomRecord("2026-05-07T11:00:00.000Z"); // 25h old, evict
    firebaseMocks.get.mockResolvedValue({
      exists: () => true,
      val: () => ({ recent, borderline, stale }),
    });

    await createRoomEvictingStale(database, "ab12", timestamp);

    expect(firebaseMocks.update).toHaveBeenCalledWith(
      { database, path: "rooms" },
      {
        ab12: createRoomRecord(timestamp),
        stale: null,
      },
    );
  });

  it("never evicts itself if the new roomId already exists in the snapshot", async () => {
    // Defensive: if a Create Game race re-uses an existing roomId, the
    // multi-path update must not also `null` it out.
    const existing = createRoomRecord("2026-05-07T11:00:00.000Z"); // stale
    firebaseMocks.get.mockResolvedValue({
      exists: () => true,
      val: () => ({ ab12: existing }),
    });

    await createRoomEvictingStale(database, "ab12", timestamp);

    expect(firebaseMocks.update).toHaveBeenCalledWith(
      { database, path: "rooms" },
      { ab12: createRoomRecord(timestamp) },
    );
    const updateCall = firebaseMocks.update.mock.calls[0][1] as Record<string, unknown>;
    expect(updateCall.ab12).not.toBeNull();
  });

  it("exposes a 24-hour preservation window constant", () => {
    expect(ROOM_PRESERVATION_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("classifies rooms as stale only when createdAt is older than the window", () => {
    const now = Date.parse("2026-05-08T12:00:00.000Z");
    expect(isRoomStale({ metadata: { createdAt: "2026-05-07T11:00:00.000Z" } }, now)).toBe(true);
    expect(isRoomStale({ metadata: { createdAt: "2026-05-07T13:00:00.000Z" } }, now)).toBe(false);
    expect(isRoomStale({ metadata: { createdAt: "" } }, now)).toBe(false);
    expect(isRoomStale({ metadata: { createdAt: "not-a-date" } }, now)).toBe(false);
    expect(isRoomStale({ metadata: {} }, now)).toBe(false);
    expect(isRoomStale({}, now)).toBe(false);
    expect(isRoomStale(null, now)).toBe(false);
  });

  it("preserves a room whose createdAt is exactly the window boundary", () => {
    const now = Date.parse("2026-05-08T12:00:00.000Z");
    const boundaryIso = new Date(now - ROOM_PRESERVATION_WINDOW_MS).toISOString();
    expect(isRoomStale({ metadata: { createdAt: boundaryIso } }, now)).toBe(false);
    const oneMsOlderIso = new Date(now - ROOM_PRESERVATION_WINDOW_MS - 1).toISOString();
    expect(isRoomStale({ metadata: { createdAt: oneMsOlderIso } }, now)).toBe(true);
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

  it("backfills questState.seed when RTDB strips an empty string, preserves a written seed", () => {
    // RTDB silently drops empty strings, so a snapshot whose writer left the
    // per-quest seed unset arrives without the field. The normalizer must
    // restore a non-empty string so `journeySeedForSite` does not hash on
    // `undefined`.
    const listener1 = vi.fn();
    const strippedQuestState = {
      essence: 250,
      completionLevel: 0,
      atlas: { startingNodeId: "dreamscape-1" },
      screen: { type: "questStart" },
      // `seed` intentionally missing — RTDB drops the empty string default.
    };
    firebaseMocks.onValue.mockImplementationOnce(
      (_entryRef, next: SnapshotListener) => {
        next({
          exists: () => true,
          val: () => ({
            ...createRoomRecord(timestamp),
            questState: strippedQuestState,
          }),
        });
        return vi.fn();
      },
    );
    subscribeToRoom(database, "ab12", listener1);
    const ready1 = listener1.mock.calls[0][0] as { room: MultiplayerRoom };
    expect(ready1.room.questState?.seed).toBe("default");

    // A written non-empty seed must round-trip unchanged.
    const listener2 = vi.fn();
    const persistedQuestState = {
      ...strippedQuestState,
      seed: "abc-123-fresh-uuid",
    };
    firebaseMocks.onValue.mockImplementationOnce(
      (_entryRef, next: SnapshotListener) => {
        next({
          exists: () => true,
          val: () => ({
            ...createRoomRecord(timestamp),
            questState: persistedQuestState,
          }),
        });
        return vi.fn();
      },
    );
    subscribeToRoom(database, "ab12", listener2);
    const ready2 = listener2.mock.calls[0][0] as { room: MultiplayerRoom };
    expect(ready2.room.questState?.seed).toBe("abc-123-fresh-uuid");
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
          seed: "default",
          essence: 250,
          essenceCap: 500,
          maxDreamsigns: 12,
          deck: [],
          dreamcaller: null,
          resolvedPackage: null,
          cardSourceDebug: null,
          remainingDreamsignPool: [],
          dreamsigns: [],
          completionLevel: 0,
          atlas: {
            layers: [],
            nodes: {},
            startingNodeId: "dreamscape-1",
            bossNodeId: "",
            currentNodeId: null,
            knownDreamsignCarrierIds: [],
          },
          currentDreamscape: null,
          visitedSites: [],
          siteRuntime: {},
          draftState: null,
          screen: { type: "questStart" },
          activeSiteId: null,
          failureSummary: null,
          hasSeenStartingDeckPopup: false,
          battleModifiers: [],
          shopModifiers: {
            freeRerolls: 0,
            essenceDiscountPercent: 0,
          },
          dreamscapeModifiers: [],
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
        nodes: {
          "dreamscape-1": {
            id: "dreamscape-1",
            biomeName: "Verdant Hollow",
            biomeColor: "#22c55e",
            position: { x: 0, y: 0 },
            state: "available" as const,
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
    // RTDB strips every empty array, not just `sites`: the boss node's
    // `forwardIds` and the starting node's `backwardIds` round-trip absent.
    // Restoring them keeps the post-victory atlas advance from crashing.
    expect(restoredNode?.forwardIds).toEqual([]);
    expect(restoredNode?.backwardIds).toEqual([]);
    expect(restoredNode?.enhancedSiteType).toBeNull();
    // Atlas-level empty arrays are also restored.
    expect(ready.room.questState?.atlas.knownDreamsignCarrierIds).toEqual([]);
    expect(ready.room.questState?.draftState).toEqual({
      mode: "pool",
      pickNumber: 1,
      sitePicksCompleted: 0,
      draftPoolCopiesByCard: { "42": 2 },
      remainingCopiesByCard: { "42": 2 },
      currentOffer: [],
      activeSiteId: null,
      siteShownCardNumbers: [],
    });
  });

  it("coerces atlas arrays that arrived as numeric-keyed objects from RTDB", () => {
    const listener = vi.fn();
    // RTDB stores non-empty arrays as numeric-keyed objects. The normalizer must
    // rebuild real arrays for node id lists and the atlas `layers` matrix so
    // downstream iteration sees arrays, not plain objects.
    const strippedQuestState = {
      ...createDefaultState(),
      atlas: {
        startingNodeId: "dreamscape-1",
        bossNodeId: "dreamscape-2",
        layers: { "0": { "0": "dreamscape-1" }, "1": { "0": "dreamscape-2" } },
        knownDreamsignCarrierIds: { "0": "dreamscape-2" },
        nodes: {
          "dreamscape-1": {
            id: "dreamscape-1",
            state: "available" as const,
            forwardIds: { "0": "dreamscape-2" },
          },
          "dreamscape-2": {
            id: "dreamscape-2",
            state: "revealedLocked" as const,
            backwardIds: { "0": "dreamscape-1" },
          },
        },
      },
    };
    const room = {
      ...createRoomRecord(timestamp),
      questState: strippedQuestState,
    };
    firebaseMocks.onValue.mockImplementation(
      (_entryRef, next: SnapshotListener) => {
        next({ exists: () => true, val: () => room });
        return vi.fn();
      },
    );

    subscribeToRoom(database, "ab12", listener);

    const ready = listener.mock.calls[0][0] as { room: MultiplayerRoom };
    const atlas = ready.room.questState?.atlas;
    expect(atlas?.layers).toEqual([["dreamscape-1"], ["dreamscape-2"]]);
    expect(atlas?.knownDreamsignCarrierIds).toEqual(["dreamscape-2"]);
    expect(atlas?.nodes["dreamscape-1"].forwardIds).toEqual(["dreamscape-2"]);
    expect(atlas?.nodes["dreamscape-1"].backwardIds).toEqual([]);
    expect(atlas?.nodes["dreamscape-2"].backwardIds).toEqual(["dreamscape-1"]);
    expect(atlas?.nodes["dreamscape-2"].forwardIds).toEqual([]);
  });

  it("round-trips a replay draft state whose packSequence arrived as numeric-keyed objects", () => {
    const listener = vi.fn();
    // RTDB stores arrays as numeric-keyed objects and drops empty ones, so a
    // persisted replay draft state arrives with `packSequence` (and its inner
    // packs) shaped as objects. The normalizer must coerce them back.
    const strippedQuestState = {
      ...createDefaultState(),
      draftState: {
        mode: "replay",
        recordId: "seat-12",
        pickNumber: 3,
        sitePicksCompleted: 2,
        currentOffer: { "0": 11, "1": 12 },
        signatureCardNumbers: { "0": 501, "1": 502 },
        packSequence: {
          "0": { "0": 1, "1": 2, "2": 3 },
          "1": { "0": 11, "1": 12 },
        },
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
    expect(ready.room.questState?.draftState).toEqual({
      mode: "replay",
      recordId: "seat-12",
      pickNumber: 3,
      sitePicksCompleted: 2,
      currentOffer: [11, 12],
      signatureCardNumbers: [501, 502],
      packSequence: [
        [1, 2, 3],
        [11, 12],
      ],
      activeSiteId: null,
      siteShownCardNumbers: [],
    });
  });

  it("defaults a replay draft state's dropped fields back to empty", () => {
    const listener = vi.fn();
    // A replay state persisted with empty/zero fields loses them on write
    // (RTDB drops empty arrays and the default-`0` pick scalars). Only `mode`
    // survives. The normalizer backfills the rest.
    const strippedQuestState = {
      ...createDefaultState(),
      draftState: {
        mode: "replay",
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
    expect(ready.room.questState?.draftState).toEqual({
      mode: "replay",
      recordId: "",
      pickNumber: 1,
      sitePicksCompleted: 0,
      currentOffer: [],
      signatureCardNumbers: [],
      packSequence: [],
      activeSiteId: null,
      siteShownCardNumbers: [],
    });
  });

  it("round-trips a fresh20 draft state whose show history arrived as numeric-keyed objects", () => {
    const listener = vi.fn();
    // RTDB stores arrays as numeric-keyed objects and drops empty ones, so a
    // persisted fresh20 draft state arrives with `shownPicksByCard` and its pick
    // lists shaped as objects. The normalizer must coerce them back.
    const strippedQuestState = {
      ...createDefaultState(),
      draftState: {
        mode: "fresh20",
        packSize: 20,
        pickNumber: 5,
        sitePicksCompleted: 1,
        currentOffer: { "0": 30, "1": 31 },
        shownPicksByCard: {
          "30": { "0": 1, "1": 5 },
          "31": { "0": 5 },
        },
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
    expect(ready.room.questState?.draftState).toEqual({
      mode: "fresh20",
      packSize: 20,
      pickNumber: 5,
      sitePicksCompleted: 1,
      currentOffer: [30, 31],
      shownPicksByCard: {
        "30": [1, 5],
        "31": [5],
      },
      activeSiteId: null,
      siteShownCardNumbers: [],
    });
  });

  it("defaults a fresh20 draft state's dropped fields back to empty", () => {
    const listener = vi.fn();
    // A fresh run's fresh20 state persists with an empty `{}` show history (RTDB
    // drops it) and a fresh-start pick scalar. Only `mode` and `packSize`
    // survive; the normalizer backfills the rest.
    const strippedQuestState = {
      ...createDefaultState(),
      draftState: {
        mode: "fresh20",
        packSize: 12,
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
    expect(ready.room.questState?.draftState).toEqual({
      mode: "fresh20",
      packSize: 12,
      pickNumber: 1,
      sitePicksCompleted: 0,
      currentOffer: [],
      shownPicksByCard: {},
      activeSiteId: null,
      siteShownCardNumbers: [],
    });
  });

  it("restores a fresh20 default pack size when RTDB drops it", () => {
    const listener = vi.fn();
    // If a fresh20 state were ever written with the default pack size that RTDB
    // happened to strip, the normalizer restores the standard pack size rather
    // than leaving it undefined.
    const strippedQuestState = {
      ...createDefaultState(),
      draftState: {
        mode: "fresh20",
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
    const draftState = ready.room.questState?.draftState;
    expect(draftState?.mode).toBe("fresh20");
    expect(draftState).toMatchObject({ packSize: 20, shownPicksByCard: {} });
  });

  it("restores RTDB-stripped provenance fields on cardSourceDebug entries", () => {
    const listener = vi.fn();
    const strippedQuestState = {
      ...createDefaultState(),
      cardSourceDebug: {
        screenLabel: "Draft Picks",
        surface: "Draft",
        entries: [
          // Draft-pool entry outside the starter decklist with zero copies:
          // RTDB strips both the `false` and the `0`, so the normalizer must
          // restore both.
          {
            cardNumber: 711,
            cardName: "Lonely Fallback",
          },
          // Starter-deck entry: RTDB strips the `0` draft-pool copy count.
          {
            cardNumber: 712,
            cardName: "Starter Pick",
            inStarterDecklist: true,
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
          inStarterDecklist: false,
          draftPoolCopies: 0,
        },
        {
          cardNumber: 712,
          cardName: "Starter Pick",
          inStarterDecklist: true,
          draftPoolCopies: 0,
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
      {
        entryId: "deck-1",
        cardNumber: 711,
        isBane: false,
        transfiguration: null,
        typeChange: null,
        keywordModification: null,
      },
      {
        entryId: "deck-2",
        cardNumber: 712,
        isBane: false,
        transfiguration: null,
        typeChange: null,
        keywordModification: null,
      },
    ]);
  });

  it("reconstructs a Dreamsign on reward runtimes that round-tripped through the legacy flat shape", () => {
    const listener = vi.fn();
    const strippedQuestState = {
      ...createDefaultState(),
      siteRuntime: {
        "site-1": {
          kind: "reward",
          // Pre-restructure reward shape: flat dreamsign fields and no
          // `dreamsign` object. The normalizer must rebuild a Dreamsign.
          reward: {
            rewardType: "dreamsign",
            dreamsignId: "ds-legacy",
            dreamsignName: "Legacy Sign",
            dreamsignEffect: "Boost something.",
          },
          remainingDreamsignPoolIds: [],
          // RTDB strips the `accepted: false` boolean default.
        },
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
    const runtime = ready.room.questState?.siteRuntime["site-1"];
    expect(runtime?.kind).toBe("reward");
    if (runtime?.kind !== "reward") {
      throw new Error("expected reward runtime");
    }
    expect(runtime.reward).toEqual({
      rewardType: "dreamsign",
      dreamsign: {
        id: "ds-legacy",
        name: "Legacy Sign",
        effectDescription: "Boost something.",
        imageName: "",
        imageAlt: "",
        isBane: false,
      },
    });
  });

  it("restores isBane:false on reward runtimes whose Dreamsign was RTDB-stripped", () => {
    const listener = vi.fn();
    const strippedQuestState = {
      ...createDefaultState(),
      siteRuntime: {
        "site-2": {
          kind: "reward",
          reward: {
            rewardType: "dreamsign",
            dreamsign: {
              id: "ds-1",
              name: "Tidewalker",
              effectDescription: "Tides do something.",
              imageName: "tidewalker.png",
              imageAlt: "A wave",
              // isBane: false was stripped by RTDB.
            },
          },
          remainingDreamsignPoolIds: [],
          accepted: false,
        },
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
    const runtime = ready.room.questState?.siteRuntime["site-2"];
    if (runtime?.kind !== "reward") {
      throw new Error("expected reward runtime");
    }
    if (runtime.reward.rewardType !== "dreamsign") {
      throw new Error("expected dreamsign reward");
    }
    expect(runtime.reward.dreamsign).toEqual({
      id: "ds-1",
      name: "Tidewalker",
      effectDescription: "Tides do something.",
      imageName: "tidewalker.png",
      imageAlt: "A wave",
      isBane: false,
    });
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
          awakening: 3,
        },
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
        },
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
    expect(ready.room.questState?.dreamcaller?.startingEssence).toBe(
      DEFAULT_STARTING_ESSENCE,
    );
    expect(
      ready.room.questState?.resolvedPackage?.dreamcaller.startingEssence,
    ).toBe(DEFAULT_STARTING_ESSENCE);
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
