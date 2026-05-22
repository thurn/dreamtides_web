import { get, ref, remove } from "firebase/database";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { getFirebaseDatabase } from "../firebase/app-config";
import { createDefaultState } from "../state/quest-context";
import { buildQuestFieldUpdate } from "./room-paths";
import {
  createRoom,
  runRoomTransaction,
  subscribeToRoom,
  writePresence,
  writeRoomUpdate,
  type RoomSubscriptionSnapshot,
} from "./room-service";

const runWithEmulator =
  process.env.FIREBASE_DATABASE_EMULATOR_HOST === undefined
    ? describe.skip
    : describe;

const database = getFirebaseDatabase("emulator", {});

function onceReady(roomId: string): Promise<RoomSubscriptionSnapshot> {
  return new Promise((resolve, reject) => {
    let unsubscribe = (): void => {};
    const timeout = setTimeout(() => {
      unsubscribe();
      reject(new Error("Timed out waiting for emulator room snapshot."));
    }, 2_000);

    unsubscribe = subscribeToRoom(database, roomId, (snapshot) => {
      if (snapshot.status === "ready" || snapshot.status === "error") {
        clearTimeout(timeout);
        unsubscribe();
        resolve(snapshot);
      }
    });
  });
}

runWithEmulator("Firebase emulator integration", () => {
  beforeEach(async () => {
    await remove(ref(database, "rooms"));
  });

  afterAll(async () => {
    await remove(ref(database, "rooms"));
  });

  it("round-trips room, subscription, presence, updates, transactions, and cleanup", async () => {
    const roomId = "emutestroom";
    const createdAt = "2026-05-22T12:00:00.000Z";
    const updatedAt = "2026-05-22T12:01:00.000Z";

    await createRoom(database, roomId, createdAt);

    const createdSnapshot = await onceReady(roomId);
    expect(createdSnapshot).toMatchObject({
      status: "ready",
      room: {
        metadata: {
          schemaVersion: 2,
          createdAt,
          updatedAt: createdAt,
        },
      },
    });

    await writePresence(database, roomId, "client-emulator", updatedAt);

    const presenceSnapshot = await get(
      ref(database, `rooms/${roomId}/presence/client-emulator`),
    );
    expect(presenceSnapshot.val()).toEqual({
      connected: true,
      lastSeenAt: updatedAt,
    });

    await writeRoomUpdate(
      database,
      roomId,
      buildQuestFieldUpdate(roomId, "essence", 321, updatedAt),
    );

    const updatedSnapshot = await onceReady(roomId);
    expect(updatedSnapshot).toMatchObject({
      status: "ready",
      room: {
        metadata: { updatedAt },
        questState: { essence: 321 },
      },
    });

    await runRoomTransaction(database, roomId, (room) => {
      if (room === null) {
        return room;
      }

      return {
        ...room,
        questState: {
          ...(room.questState ?? createDefaultState()),
          essence: 654,
        },
      };
    });

    const transactionSnapshot = await onceReady(roomId);
    expect(transactionSnapshot).toMatchObject({
      status: "ready",
      room: {
        questState: { essence: 654 },
      },
    });

    await remove(ref(database, "rooms"));
    const rootSnapshot = await get(ref(database, "rooms"));
    expect(rootSnapshot.exists()).toBe(false);
  });
});
