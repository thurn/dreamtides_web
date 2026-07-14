import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ContentConfig, Genesis } from "./types";

const firebase = vi.hoisted(() => ({
  snapshotValue: null as unknown,
  updates: [] as Array<{ path: string; value: Record<string, unknown> }>,
  sets: [] as Array<{ path: string; value: unknown }>,
  onDisconnectRemoves: [] as string[],
  deferOnDisconnectRemove: false,
  onDisconnectRemoveResolvers: [] as Array<() => void>,
  connectionCallbacks: [] as Array<(snapshot: { val: () => unknown }) => void>,
  unsubscribe: vi.fn(),
}));

vi.mock("firebase/database", () => ({
  ref: (_db: unknown, path: string) => ({ path }),
  runTransaction: vi.fn((_ref: { path: string }, updater: (current: unknown) => unknown) => {
    const next = updater(null);
    return Promise.resolve({
      committed: next !== undefined,
      snapshot: { val: () => next },
    });
  }),
  get: vi.fn(() => Promise.resolve({
    exists: () => firebase.snapshotValue !== null,
    val: () => firebase.snapshotValue,
  })),
  update: vi.fn((ref: { path: string }, value: Record<string, unknown>) => {
    firebase.updates.push({ path: ref.path, value });
    return Promise.resolve();
  }),
  onValue: vi.fn((_ref: { path: string }, callback: (snapshot: { val: () => unknown }) => void) => {
    firebase.connectionCallbacks.push(callback);
    return firebase.unsubscribe;
  }),
  onDisconnect: vi.fn((ref: { path: string }) => ({
    remove: vi.fn(() => {
      firebase.onDisconnectRemoves.push(ref.path);
      if (!firebase.deferOnDisconnectRemove) {
        return Promise.resolve();
      }
      return new Promise<void>((resolve) => {
        firebase.onDisconnectRemoveResolvers.push(resolve);
      });
    }),
  })),
  set: vi.fn((ref: { path: string }, value: unknown) => {
    firebase.sets.push({ path: ref.path, value });
    return Promise.resolve();
  }),
}));

const { createRoomEvictingStale, writePresence, ROOM_PRESERVATION_WINDOW_MS } = await import("./room");

const CONTENT_CONFIG: ContentConfig = {
  poolVariant: "tides4",
  draftMode: "pool",
  fresh20PackSize: null,
  journeyVariant: "v2",
};

function genesisAt(createdAt: number): string {
  const genesis: Genesis = {
    seed: "s",
    reducerVersion: "v1",
    createdAt,
    contentConfig: CONTENT_CONFIG,
  };
  return JSON.stringify(genesis);
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

beforeEach(() => {
  firebase.snapshotValue = null;
  firebase.updates.length = 0;
  firebase.sets.length = 0;
  firebase.onDisconnectRemoves.length = 0;
  firebase.deferOnDisconnectRemove = false;
  firebase.onDisconnectRemoveResolvers.length = 0;
  firebase.connectionCallbacks.length = 0;
  firebase.unsubscribe.mockClear();
});

describe("createRoomEvictingStale presence protection", () => {
  it("does not evict a stale sibling room while any client is connected", async () => {
    const now = 1_000_000_000_000;
    const stale = now - ROOM_PRESERVATION_WINDOW_MS - 1;

    firebase.snapshotValue = {
      keepLive: {
        log: { genesis: genesisAt(stale) },
        presence: { c1: { connected: true, lastSeenAt: "t" } },
      },
      evictStale: {
        log: { genesis: genesisAt(stale) },
        presence: { c2: { connected: false, lastSeenAt: "t" } },
      },
      keepFresh: {
        log: { genesis: genesisAt(now) },
      },
    };

    await createRoomEvictingStale({} as never, "newroom", {
      seed: "new",
      reducerVersion: "v1",
      createdAt: now,
      contentConfig: CONTENT_CONFIG,
    }, now);

    expect(firebase.updates).toEqual([
      { path: "rooms", value: { evictStale: null } },
    ]);
  });
});

describe("writePresence reconnect handling", () => {
  it("rearms onDisconnect and rewrites presence on each .info/connected reconnect", async () => {
    const times = ["t1", "t2"];
    const cleanup = writePresence({} as never, "room1", "client1", () => times.shift() ?? "tx");
    const emitConnected = (value: boolean): void => {
      const callback = firebase.connectionCallbacks[firebase.connectionCallbacks.length - 1];
      if (callback === undefined) {
        throw new Error("writePresence did not subscribe to .info/connected");
      }
      callback({ val: () => value });
    };

    emitConnected(true);
    await flushPromises();
    emitConnected(false);
    await flushPromises();
    emitConnected(true);
    await flushPromises();

    expect(firebase.onDisconnectRemoves).toEqual([
      "rooms/room1/presence/client1",
      "rooms/room1/presence/client1",
    ]);
    expect(firebase.sets).toEqual([
      {
        path: "rooms/room1/presence/client1",
        value: { connected: true, lastSeenAt: "t1" },
      },
      {
        path: "rooms/room1/presence/client1",
        value: { connected: true, lastSeenAt: "t2" },
      },
    ]);

    cleanup();
    expect(firebase.unsubscribe).toHaveBeenCalledTimes(1);
    expect(firebase.sets[firebase.sets.length - 1]).toEqual({
      path: "rooms/room1/presence/client1",
      value: null,
    });
  });

  it("does not restore presence when cleanup wins a pending onDisconnect registration", async () => {
    firebase.deferOnDisconnectRemove = true;
    const cleanup = writePresence({} as never, "old-room", "client1", () => "t1");
    const callback = firebase.connectionCallbacks[firebase.connectionCallbacks.length - 1];
    if (callback === undefined) {
      throw new Error("writePresence did not subscribe to .info/connected");
    }

    callback({ val: () => true });
    cleanup();
    expect(firebase.sets).toEqual([
      { path: "rooms/old-room/presence/client1", value: null },
    ]);

    firebase.onDisconnectRemoveResolvers[0]?.();
    await flushPromises();

    expect(firebase.sets).toEqual([
      { path: "rooms/old-room/presence/client1", value: null },
    ]);
  });
});
