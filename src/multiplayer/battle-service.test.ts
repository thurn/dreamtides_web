import { beforeEach, describe, expect, it, vi } from "vitest";
import { runTransaction } from "firebase/database";
import { DEPLOY_SLOT_IDS, RESERVE_SLOT_IDS } from "../battle/types";
import { ensureBattleSession, normalizeBattleStateSnapshot } from "./battle-service";
import type { Database } from "firebase/database";
import type { SharedBattleState } from "./battle-types";

vi.mock("firebase/database", () => ({
  ref: vi.fn((db: unknown, path: unknown) => ({ db, path })),
  runTransaction: vi.fn(),
}));

const mockedRunTransaction = runTransaction as unknown as ReturnType<typeof vi.fn>;

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
      enableAi: false,
      rewardOptions: [],
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
      atlasSnapshot: { nodes: {}, edges: {}, nexusId: "" },
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
            pendingExtraTurns: 0,
            visibility: {},
            // deck/hand/void/banished/reserve/deployed all elided
          },
          enemy: {
            currentEnergy: 0,
            maxEnergy: 0,
            score: 0,
            pendingExtraTurns: 0,
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
});

describe("ensureBattleSession", () => {
  it("commits a new SharedBattleState when slot is null", async () => {
    let captured: unknown;
    mockedRunTransaction.mockImplementation(async (_ref, updater) => {
      captured = updater(null);
    });

    await ensureBattleSession({
      database: {} as Database,
      roomId: "room-1",
      init: fakeInit,
      initialMutable: fakeInitial,
    });

    expect(captured).toMatchObject({
      init: fakeInit,
      reducer: {
        mutable: fakeInitial,
        history: { past: [], future: [] },
        lastTransition: null,
        commandSerial: 0,
      },
    });
  });

  it("aborts the transaction when slot already has init", async () => {
    let captured: unknown;
    const existing: SharedBattleState = {
      init: fakeInit,
      reducer: {
        mutable: fakeInitial,
        history: { past: [], future: [] },
        lastTransition: null,
        commandSerial: 7,
      },
    };
    mockedRunTransaction.mockImplementation(async (_ref, updater) => {
      captured = updater(existing);
    });

    await ensureBattleSession({
      database: {} as Database,
      roomId: "room-1",
      init: fakeInit,
      initialMutable: fakeInitial,
    });

    expect(captured).toBe(existing);
  });
});
