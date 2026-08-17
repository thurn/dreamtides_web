import { describe, expect, it } from "vitest";
import { genesisFoldState } from "../rules/fold-state";
import { GAME_ENGINE_CONFIG } from "../rules/replay/replay";
import type { PinnedGenesis } from "../eventlog/types";
import {
  applyLatestRoomRecovery,
  buildRoomRecoveryCheckpoint,
  decodeRoomRecoveryCheckpoint,
  roomRecoveryOperation,
} from "./room-recovery";
import {
  testFoldHash,
  testJourneySeed,
} from "../types/test-identities";

const GENESIS: PinnedGenesis = {
  seed: testJourneySeed("room-recovery-seed"),
  reducerVersion: "test",
  createdAt: 1,
  contentConfig: {
    poolVariant: "tides4",
    atlasFoldHash: testFoldHash("recovery-atlas"),
    sitesFoldHash: testFoldHash("recovery-sites"),
    draftFoldHash: testFoldHash("recovery-draft"),
    cardRolesFoldHash: testFoldHash("recovery-card-roles"),
    economyFoldHash: testFoldHash("recovery-economy"),
    gambleFoldHash: testFoldHash("recovery-gamble"),
    transfigurationFoldHash: testFoldHash("recovery-transfiguration"),
    rewardSelectionFoldHash: testFoldHash("recovery-rewards"),
    auguryFoldHash: testFoldHash("recovery-augury"),
    explorationFoldHash: testFoldHash("recovery-exploration"),
    tutorialFoldHash: testFoldHash("recovery-tutorial"),
    opponentsFoldHash: testFoldHash("recovery-opponents"),
    defaultStartingEssence: 200,
    dreamsignCap: 12,
  },
};

function checkpoint() {
  const state = genesisFoldState(GENESIS);
  return buildRoomRecoveryCheckpoint({
    generation: 0,
    sourceHead: 17,
    sourcePath: "/dreamscape/1-frostforge/transfiguration",
    genesis: GENESIS,
    state: { ...state, journey: { ...state.journey, essence: 137 } },
    createdAt: "2026-08-17T01:00:00.000Z",
  });
}

describe("room recovery checkpoints", () => {
  it("round-trips a checksummed confirmed fold", () => {
    const built = checkpoint();
    expect(decodeRoomRecoveryCheckpoint(JSON.stringify(built))).toEqual(built);
    expect(
      decodeRoomRecoveryCheckpoint(
        JSON.stringify({ ...built, stateHash: "tampered" }),
      ),
    ).toBeNull();
  });

  it("rejects a checkpoint path that could leave the current origin", () => {
    const built = checkpoint();
    expect(
      decodeRoomRecoveryCheckpoint(
        JSON.stringify({ ...built, sourcePath: "//example.test/steal" }),
      ),
    ).toBeNull();
  });

  it("rotates the whole room to a recovered generation and preserves coop metadata", () => {
    const latest = checkpoint();
    const currentLog = {
      genesis: JSON.stringify(GENESIS),
      generation: 0,
      baseSeq: 0,
      baseSnapshot: null,
      head: 19,
      events: { 18: "event-18", 19: "event-19" },
    };
    const applied = applyLatestRoomRecovery(
      {
        log: currentLog,
        presence: { player1: { connected: true, lastSeenAt: "now" } },
        logs: { diagnostic: "kept" },
        recovery: { generation: 0, latest: JSON.stringify(latest) },
      },
      roomRecoveryOperation("operation-a"),
      "2026-08-17T01:01:00.000Z",
    );

    expect(applied.result).toMatchObject({ generation: 1, recovered: true });
    expect(applied.room.presence).toEqual({
      player1: { connected: true, lastSeenAt: "now" },
    });
    expect(applied.room.logs).toEqual({ diagnostic: "kept" });
    expect(applied.room.log).toMatchObject({
      generation: 1,
      baseSeq: 0,
      head: 0,
      events: {},
      baseSnapshot: latest.encodedState,
    });
    const recovery = applied.room.recovery as Record<string, unknown>;
    const archives = recovery.archives as Record<string, string>;
    expect(JSON.parse(archives["00000000-operation-a"])).toEqual(currentLog);
    expect(
      GAME_ENGINE_CONFIG.decode(
        (applied.room.log as Record<string, string>).baseSnapshot,
      ).journey.essence,
    ).toBe(137);
  });

  it("recovers without decoding a damaged active log", () => {
    const latest = checkpoint();
    const applied = applyLatestRoomRecovery(
      {
        log: { genesis: "{broken", generation: 0, baseSnapshot: "{broken" },
        recovery: { generation: 0, latest: JSON.stringify(latest) },
      },
      roomRecoveryOperation("operation-b"),
      "2026-08-17T01:02:00.000Z",
    );
    expect(applied.result.recovered).toBe(true);
    expect(applied.room.log).toMatchObject({ generation: 1, head: 0 });
  });

  it("makes a repeated recovery request idempotent after generation rotation", () => {
    const latest = checkpoint();
    const first = applyLatestRoomRecovery(
      {
        log: { generation: 0, head: 18 },
        recovery: { generation: 0, latest: JSON.stringify(latest) },
      },
      roomRecoveryOperation("operation-c"),
      "2026-08-17T01:03:00.000Z",
    );
    const second = applyLatestRoomRecovery(
      first.room,
      roomRecoveryOperation("operation-d"),
      "2026-08-17T01:04:00.000Z",
    );
    expect(second.result).toMatchObject({ generation: 1, recovered: false });
    expect(second.room).toBe(first.room);
  });

  it("repairs a recovered baseline whose genesis was later corrupted", () => {
    const latest = checkpoint();
    const first = applyLatestRoomRecovery(
      {
        log: { generation: 0, head: 18 },
        recovery: { generation: 0, latest: JSON.stringify(latest) },
      },
      roomRecoveryOperation("operation-e"),
      "2026-08-17T01:05:00.000Z",
    );
    const corrupted = {
      ...first.room,
      log: { ...(first.room.log as Record<string, unknown>), genesis: "corrupted" },
    };

    const repaired = applyLatestRoomRecovery(
      corrupted,
      roomRecoveryOperation("operation-f"),
      "2026-08-17T01:06:00.000Z",
    );
    expect(repaired.result).toMatchObject({ generation: 2, recovered: true });
    expect((repaired.room.log as Record<string, unknown>).genesis).toBe(
      latest.encodedGenesis,
    );
  });
});
