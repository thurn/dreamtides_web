// Local-first log contracts: a game written through to storage reopens to the
// identical fold — fresh, mid-journey, mid-battle, from a checkpoint or from
// genesis — and a journey save file loads into an equal journey; a failed
// write reaches storage without another append; the log holds every committed
// event in order. Runs the real reducer over the synthetic fixture providers on
// the in-memory store.

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { hashState } from "../eventlog/hash";
import { createLocalLog, type EventDraft } from "../eventlog/local-log";
import type { EngineConfig, GameEvent, Genesis } from "../eventlog/types";
import { decodeEvent, decodeGenesis } from "../eventlog/wire";
import type { FoldState } from "../rules/fold-state";
import {
  clearReplayFixtureProviders,
  registerReplayFixtureProviders,
} from "../rules/replay/fixture-providers";
import battleFixture from "../rules/replay/fixtures/battle.json";
import { GAME_ENGINE_CONFIG, replayLog } from "../rules/replay/replay";
import {
  createJourneySaveFile,
  parseJourneySaveFile,
  serializeJourneySaveFile,
} from "../state/journey-save-files";
import {
  parseClientId,
  parseIntentKey,
  parseGameId,
  type GameId,
} from "../types/identifiers";
import { testEventActor, testJourneySeed } from "../types/test-identities";
import { createGameRepository, type GameRepository } from "./game-repository";
import {
  createMemoryKeyValueStore,
  type KeyValueStore,
} from "./key-value-store";
import {
  createLocalGame,
  openLocalGame,
  type LocalGame,
  type LocalGameOptions,
} from "./local-game";

const GENESIS: Genesis = (() => {
  const genesis = decodeGenesis(JSON.stringify(battleFixture.genesis));
  if (genesis === null) throw new Error("Battle fixture genesis is invalid.");
  return genesis;
})();

/** The fixture's journey into a battle and out of it, as local intents. */
const SCRIPT: readonly EventDraft[] = battleFixture.events.map(({ event }) => {
  const decoded: GameEvent = decodeEvent(JSON.stringify(event));
  return { type: decoded.type, payload: decoded.payload };
});
const BEGIN_BATTLE_INDEX = SCRIPT.findIndex(
  (draft) => draft.type === "BEGIN_BATTLE",
);

const OPTIONS: LocalGameOptions = {
  eventClock: () => "2026-01-01T00:00:00.000Z",
  now: () => 0,
};

const hash = (game: LocalGame<FoldState>): string =>
  GAME_ENGINE_CONFIG.hash(game.log.state());

function newGame(
  repository: GameRepository,
  gameId: GameId,
  options: LocalGameOptions = OPTIONS,
  genesis: Genesis = GENESIS,
): Promise<LocalGame<FoldState>> {
  return createLocalGame<FoldState>(
    repository,
    GAME_ENGINE_CONFIG,
    {
      gameId,
      genesis,
      localPlayerId: parseClientId("p1"),
    },
    options,
  );
}

async function reopen(
  repository: GameRepository,
  game: LocalGame<FoldState>,
  options: LocalGameOptions = OPTIONS,
): Promise<LocalGame<FoldState>> {
  await game.close();
  const reopened = await openLocalGame<FoldState>(
    repository,
    GAME_ENGINE_CONFIG,
    game.gameId,
    options,
  );
  if (reopened === null) throw new Error(`Game ${game.gameId} was not stored.`);
  return reopened;
}

function play(game: LocalGame<FoldState>, drafts: readonly EventDraft[]): void {
  for (const draft of drafts) game.log.append(draft);
}

async function replayStored(
  repository: GameRepository,
  gameId: GameId,
): Promise<string> {
  const events = await repository.readEvents(gameId, 0);
  return replayLog({ genesis: GENESIS, events }).finalHash;
}

beforeAll(registerReplayFixtureProviders);
afterAll(clearReplayFixtureProviders);

describe("local game persistence", () => {
  it("reopens a new journey and a mid-journey reload to the identical fold", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const fresh = await newGame(repository, parseGameId("fresh1"));
    const reopenedFresh = await reopen(repository, fresh);
    expect(reopenedFresh.log.head()).toBe(0);
    expect(hash(reopenedFresh)).toBe(hash(fresh));

    const live = await newGame(repository, parseGameId("journey1"));
    play(live, SCRIPT.slice(0, BEGIN_BATTLE_INDEX));
    const reloaded = await reopen(repository, live);
    expect(reloaded.log.head()).toBe(BEGIN_BATTLE_INDEX);
    expect(hash(reloaded)).toBe(hash(live));

    // Seeded randomness keys on the seq, so the next battle is identical too.
    play(live, SCRIPT.slice(BEGIN_BATTLE_INDEX));
    play(reloaded, SCRIPT.slice(BEGIN_BATTLE_INDEX));
    expect(hash(reloaded)).toBe(hash(live));
    expect(reloaded.log.state().battle).toBeNull();
  });

  it("reloads mid-battle from a checkpoint plus the events after it", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const options = { ...OPTIONS, checkpointInterval: BEGIN_BATTLE_INDEX + 1 };
    const live = await newGame(repository, parseGameId("battle1"), options);
    play(live, SCRIPT.slice(0, BEGIN_BATTLE_INDEX + 1));
    await live.flush();
    play(live, SCRIPT.slice(BEGIN_BATTLE_INDEX + 1, BEGIN_BATTLE_INDEX + 3));
    expect(live.log.state().battle).not.toBeNull();

    const reloaded = await reopen(repository, live, options);
    expect(reloaded.opened).toMatchObject({
      checkpointSeq: BEGIN_BATTLE_INDEX + 1,
      checkpointRejected: false,
      replayedEvents: 2,
    });
    expect(hash(reloaded)).toBe(hash(live));
    expect(await replayStored(repository, live.gameId)).toBe(hash(live));
    expect(reloaded.log.events()).toEqual(live.log.events());
    expect(reloaded.log.events().map((e) => e.seq)).toEqual(
      Array.from({ length: BEGIN_BATTLE_INDEX + 3 }, (_, index) => index + 1),
    );

    play(live, SCRIPT.slice(BEGIN_BATTLE_INDEX + 3));
    play(reloaded, SCRIPT.slice(BEGIN_BATTLE_INDEX + 3));
    expect(hash(reloaded)).toBe(hash(live));
  });

  it("replays from genesis when the stored checkpoint fails verification", async () => {
    const store = createMemoryKeyValueStore();
    const repository = createGameRepository(store);
    const options = { ...OPTIONS, checkpointInterval: 2 };
    const live = await newGame(repository, parseGameId("tamper1"), options);
    play(live, SCRIPT.slice(0, BEGIN_BATTLE_INDEX + 2));
    await live.close();
    await corruptCheckpoint(store, live.gameId);

    const reloaded = await reopen(repository, live, options);
    expect(reloaded.opened).toMatchObject({
      checkpointSeq: 0,
      checkpointRejected: true,
      replayedEvents: BEGIN_BATTLE_INDEX + 2,
    });
    expect(hash(reloaded)).toBe(hash(live));
  });

  it("loads a journey save file into an equal journey that survives reload", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const source = await newGame(repository, parseGameId("saved1"));
    play(source, SCRIPT);
    const saved = parseJourneySaveFile(
      serializeJourneySaveFile(
        createJourneySaveFile("qa", source.log.state().journey, {
          savedAt: "2026-01-01T00:00:00.000Z",
        }),
      ),
    ).journeyState;

    const target = await newGame(repository, parseGameId("loaded1"), OPTIONS, {
      ...GENESIS,
      seed: testJourneySeed("local-game-load-target"),
    });
    const seed = target.log.state().journey.seed;
    const seq = target.log.append({
      type: "LOAD_STATE",
      payload: { snapshot: { ...saved, seed } },
    });
    expect(target.log.head()).toBe(seq);
    const { runId: _runId, ...loaded } = target.log.state().journey;
    const { runId: _savedRunId, ...expected } = source.log.state().journey;
    expect(loaded).toEqual({ ...expected, seed });

    const reloaded = await reopen(repository, target);
    expect(hash(reloaded)).toBe(hash(target));
  });

  it.each([
    ["from a checkpoint", 2],
    ["from genesis", 1000],
  ])("keeps applied intent keys and deterministic bounces across reloads %s", async (_, checkpointInterval) => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const options = { ...OPTIONS, checkpointInterval };
    const live = await newGame(repository, parseGameId("keys1"), options);
    const intentKey = parseIntentKey("start-journey");
    const startSeq = live.log.append({ ...SCRIPT[0], intentKey });
    expect(live.log.append({ ...SCRIPT[0], intentKey })).toBe(startSeq);
    const bouncedSeq = live.log.append({ type: "END_BATTLE", payload: {} });
    play(live, SCRIPT.slice(1, BEGIN_BATTLE_INDEX));

    const reloaded = await reopen(repository, live, options);
    expect(reloaded.log.append({ ...SCRIPT[0], intentKey })).toBe(startSeq);
    expect(reloaded.log.head()).toBe(live.log.head());
    const events = await repository.readEvents(live.gameId, 0);
    const outcomes = replayLog({ genesis: GENESIS, events }).outcomes;
    expect(outcomes.find((o) => o.seq === bouncedSeq)?.outcome).toBe("bounced");
  });

  it("retries a failed write in order with the next batch", async () => {
    const store = createMemoryKeyValueStore();
    let failNext = true;
    const flaky: KeyValueStore = {
      ...store,
      putAll: (entries) => {
        if (failNext && entries.length > 1) {
          failNext = false;
          return Promise.reject(new Error("quota exceeded"));
        }
        return store.putAll(entries);
      },
    };
    const repository = createGameRepository(flaky);
    const errors: unknown[] = [];
    const live = await newGame(repository, parseGameId("flaky1"), {
      ...OPTIONS,
      onPersistError: (error) => errors.push(error),
    });
    play(live, SCRIPT.slice(0, 2));
    await live.flush();
    play(live, SCRIPT.slice(2, BEGIN_BATTLE_INDEX + 1));
    await live.flush();

    expect(errors).toHaveLength(1);
    const reloaded = await reopen(createGameRepository(store), live);
    expect(reloaded.log.head()).toBe(BEGIN_BATTLE_INDEX + 1);
    expect(hash(reloaded)).toBe(hash(live));
  });

  it("retries a failed final write on its own, so a reload recovers every event", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const store = createMemoryKeyValueStore();
      let failuresLeft = 0;
      const flaky: KeyValueStore = {
        ...store,
        putAll: (entries) => {
          if (failuresLeft > 0 && entries.length > 1) {
            failuresLeft -= 1;
            return Promise.reject(new Error("transaction aborted"));
          }
          return store.putAll(entries);
        },
      };
      const errors: unknown[] = [];
      const live = await newGame(
        createGameRepository(flaky),
        parseGameId("final1"),
        {
          ...OPTIONS,
          onPersistError: (error) => errors.push(error),
        },
      );
      play(live, SCRIPT.slice(0, BEGIN_BATTLE_INDEX));
      await live.flush();
      failuresLeft = 3;
      play(live, SCRIPT.slice(BEGIN_BATTLE_INDEX, BEGIN_BATTLE_INDEX + 2));
      await live.flush();
      expect(errors).toHaveLength(1);

      // No further append, flush, or close: only the retry can land the batch.
      await vi.runAllTimersAsync();
      expect(errors).toHaveLength(3);

      // Reload: a fresh repository over the same storage, the old tab gone.
      const reloaded = await openLocalGame<FoldState>(
        createGameRepository(store),
        GAME_ENGINE_CONFIG,
        live.gameId,
        OPTIONS,
      );
      expect(reloaded?.log.head()).toBe(BEGIN_BATTLE_INDEX + 2);
      expect(reloaded === null ? null : hash(reloaded)).toBe(hash(live));
      expect(reloaded?.log.events()).toEqual(live.log.events());
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops retrying a failed write once the game closes", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const store = createMemoryKeyValueStore();
      let writes = 0;
      const failing: KeyValueStore = {
        ...store,
        putAll: (entries) => {
          if (entries.length > 1) {
            writes += 1;
            return Promise.reject(new Error("transaction aborted"));
          }
          return store.putAll(entries);
        },
      };
      const live = await newGame(
        createGameRepository(failing),
        parseGameId("closed1"),
      );
      play(live, SCRIPT.slice(0, 1));
      await live.flush();
      await live.close();
      const attempts = writes;
      await vi.runAllTimersAsync();
      expect(writes).toBe(attempts);
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists stored games, most recently updated first", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    let clock = 0;
    const options = { ...OPTIONS, now: () => (clock += 1) };
    const older = await newGame(repository, parseGameId("older1"), options);
    const newer = await newGame(repository, parseGameId("newer1"), options);
    older.log.append(SCRIPT[0]);
    await older.flush();
    expect((await repository.listGames()).map((game) => game.gameId)).toEqual([
      older.gameId,
      newer.gameId,
    ]);
  });
});

describe("local log", () => {
  const counter: EngineConfig<{ total: number }> = {
    reducer: (state, event) =>
      typeof event.payload.add === "number"
        ? { state: { total: state.total + event.payload.add }, outcome: "applied" }
        : { state, outcome: "bounced", bounceReason: "invalid_action" },
    genesisState: () => ({ total: 0 }),
    encode: JSON.stringify,
    decode: (raw) => JSON.parse(raw) as { total: number },
    hash: hashState,
  };

  it("delivers appends made by listeners after the record that caused them", () => {
    const log = createLocalLog({
      config: counter,
      genesis: GENESIS,
      localActor: testEventActor("p1"),
    });
    const seen: Array<[number, number]> = [];
    log.subscribe((record) => {
      if (record.seq === 1) log.append({ type: "ADD", payload: { add: 10 } });
    });
    log.subscribe((record) => seen.push([record.seq, record.event.basedOnSeq]));
    log.append({ type: "ADD", payload: { add: 1 } });
    expect(seen).toEqual([
      [1, 0],
      [2, 1],
    ]);
    expect(log.state()).toEqual({ total: 11 });
  });

  it("keeps every committed event in seq order, synchronously", () => {
    const log = createLocalLog({
      config: counter,
      genesis: GENESIS,
      localActor: testEventActor("p1"),
      now: () => "2026-01-01T00:00:00.000Z",
    });
    log.subscribe((record) => {
      if (record.seq === 1) log.append({ type: "ADD", payload: { add: 10 } });
    });
    log.append({ type: "ADD", payload: { add: 1 } });
    const bounced = log.append({ type: "ADD", payload: {} });
    expect(log.events().map(({ seq, event }) => [seq, event.payload])).toEqual([
      [1, { add: 1 }],
      [2, { add: 10 }],
      [bounced, {}],
    ]);

    // Reopened from a checkpoint at seq 2 with its history, the list is whole.
    const reopened = createLocalLog({
      config: counter,
      genesis: GENESIS,
      localActor: testEventActor("p1"),
      base: { ...log.checkpoint(), seq: 2, state: { total: 11 } },
      history: log.events().slice(0, 2),
      events: log.events().slice(2),
    });
    reopened.append({ type: "ADD", payload: { add: 5 } });
    expect(reopened.events().map(({ seq }) => seq)).toEqual([1, 2, 3, 4]);
    expect(reopened.events().slice(0, 3)).toEqual(log.events());
    expect(reopened.state()).toEqual({ total: 16 });
  });

  it("refuses history that does not cover its base", () => {
    expect(() =>
      createLocalLog({
        config: counter,
        genesis: GENESIS,
        localActor: testEventActor("p1"),
        base: { seq: 2, state: { total: 0 }, intentKeys: [] },
        history: [],
      }),
    ).toThrow();
  });

  it("commits nothing when a dev-mode reducer throws", () => {
    const log = createLocalLog({
      config: {
        ...counter,
        reducer: () => {
          throw new Error("reducer bug");
        },
      },
      genesis: GENESIS,
      localActor: testEventActor("p1"),
      devMode: true,
    });
    expect(() => log.append({ type: "ADD", payload: { add: 1 } })).toThrow(
      "reducer bug",
    );
    expect(log.head()).toBe(0);
    expect(log.events()).toEqual([]);
  });
});

async function corruptCheckpoint(
  store: KeyValueStore,
  gameId: GameId,
): Promise<void> {
  const key = `game/${gameId}/checkpoint`;
  const checkpoint = (await store.get(key)) as Record<string, unknown>;
  expect(checkpoint).toBeDefined();
  await store.putAll([[key, { ...checkpoint, stateHash: "tampered" }]]);
}
