// @vitest-environment jsdom

// Unit tests for `createAndNavigateToRoom`'s room-id collision retry
// (audit finding P2-7): `createRoom`/`createRoomEvictingStale` now reject with
// `RoomExistsError` instead of silently overwriting an existing room's log —
// a `generateRoomId()` collision (astronomically unlikely, but not
// impossible at the 6-character default length) must never clobber another
// game in progress. This is the CALLER-side half of that fix: retry with a
// FRESH id up to 3 times before giving up.

import { afterEach, describe, expect, it, vi } from "vitest";
import type { PinnedContentConfig } from "../eventlog/types";

const ids: string[] = [];
let attempt = 0;

vi.mock("../eventlog/room", async () => {
  const actual =
    await vi.importActual<typeof import("../eventlog/room")>(
      "../eventlog/room",
    );
  return {
    ...actual,
    generateRoomId: vi.fn(() => {
      const id = `room-${String(attempt)}`;
      ids.push(id);
      attempt += 1;
      return id;
    }),
    createRoomEvictingStale: vi.fn(),
  };
});

const { createAndNavigateToRoom } = await import("./RoomGate");
const { createRoomEvictingStale, RoomExistsError } =
  await import("../eventlog/room");

const CONTENT_CONFIG: PinnedContentConfig = {
  poolVariant: "tides4",
  atlasFoldHash: "fixture-atlas-fold-hash",
  sitesFoldHash: "fixture-sites-fold-hash",
  draftFoldHash: "fixture-draft-fold-hash",
  economyFoldHash: "a".repeat(64),
  gambleFoldHash: "g".repeat(64),
  transfigurationFoldHash: "x".repeat(64),
  rewardSelectionFoldHash: "c".repeat(64),
  auguryFoldHash: "d".repeat(64),
  explorationFoldHash: "e".repeat(64),
  tutorialFoldHash: "t".repeat(64),
  opponentsFoldHash: "b".repeat(64),
  defaultStartingEssence: 17,
  dreamsignCap: 4,
};

const db = {} as Parameters<typeof createAndNavigateToRoom>[0];

afterEach(() => {
  attempt = 0;
  ids.length = 0;
  vi.mocked(createRoomEvictingStale).mockReset();
});

describe("createAndNavigateToRoom retry", () => {
  it("succeeds on the first attempt when the id is free", async () => {
    vi.mocked(createRoomEvictingStale).mockResolvedValueOnce(undefined);
    const roomId = await createAndNavigateToRoom(db, CONTENT_CONFIG);
    expect(roomId).toBe("room-0");
    expect(createRoomEvictingStale).toHaveBeenCalledTimes(1);
  });

  it("stamps a standalone route into a newly created room's genesis", async () => {
    vi.mocked(createRoomEvictingStale).mockResolvedValueOnce(undefined);
    await createAndNavigateToRoom(db, CONTENT_CONFIG, "loading");

    expect(createRoomEvictingStale).toHaveBeenCalledWith(
      db,
      "room-0",
      expect.objectContaining({ frontDoorEntry: "loading" }),
    );
  });

  it("retries with a fresh id after a RoomExistsError collision", async () => {
    vi.mocked(createRoomEvictingStale)
      .mockRejectedValueOnce(new RoomExistsError("room-0 exists"))
      .mockResolvedValueOnce(undefined);
    const roomId = await createAndNavigateToRoom(db, CONTENT_CONFIG);
    expect(roomId).toBe("room-1");
    expect(ids).toEqual(["room-0", "room-1"]);
    expect(createRoomEvictingStale).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 collisions and rejects with the RoomExistsError", async () => {
    vi.mocked(createRoomEvictingStale).mockRejectedValue(
      new RoomExistsError("collision"),
    );
    await expect(
      createAndNavigateToRoom(db, CONTENT_CONFIG),
    ).rejects.toBeInstanceOf(RoomExistsError);
    expect(createRoomEvictingStale).toHaveBeenCalledTimes(3);
  });

  it("does not retry a non-collision failure", async () => {
    const error = new Error("network down");
    vi.mocked(createRoomEvictingStale).mockRejectedValueOnce(error);
    await expect(createAndNavigateToRoom(db, CONTENT_CONFIG)).rejects.toBe(
      error,
    );
    expect(createRoomEvictingStale).toHaveBeenCalledTimes(1);
  });
});
