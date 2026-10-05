// Production log capture contracts: every journey-log record reaches the
// game's stored log as the line the development sink writes, the stored log
// reads back in capture order, and the size cap evicts the least recently
// written games' logs first while keeping the capturing game's. Runs on the
// in-memory store behind the `KeyValueStore` interface.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createJourneyLogMirror,
  logEvent,
  resetLog,
  setJourneyLogCapture,
  setLogContext,
} from "../logging";
import { parseGameId, type GameId } from "../types/identifiers";
import {
  createGameLogCapture,
  gameLogsToEvict,
  readGameLog,
  type GameLogCapture,
} from "./game-log-capture";
import { createGameRepository, type GameRepository } from "./game-repository";
import {
  createMemoryKeyValueStore,
  type KeyValueStore,
} from "./key-value-store";

const GAME_A = parseGameId("gamea1");
const GAME_B = parseGameId("gameb2");
const GAME_C = parseGameId("gamec3");
const UNCAPPED = 1_000_000;

function record(index: number): Record<string, unknown> {
  return { event: "fixture_event", seq: index, gameId: GAME_A, index };
}

function captureAt(
  repository: GameRepository,
  gameId: GameId,
  maxStoredCharacters: number,
  clock: { now: number },
): GameLogCapture {
  return createGameLogCapture(repository, gameId, {
    maxStoredCharacters,
    now: () => clock.now,
  });
}

async function writeLog(
  capture: GameLogCapture,
  records: number,
): Promise<void> {
  for (let index = 0; index < records; index += 1) {
    capture.capture(record(index));
  }
  await capture.flush();
}

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  resetLog();
});

afterEach(() => {
  resetLog();
  vi.restoreAllMocks();
});

describe("game log capture", () => {
  it("stores each record as its journey-log line, in capture order", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    const records = [record(1), { nested: { list: [1, "two"] }, seq: 2 }];

    capture.capture(records[0]);
    await capture.flush();
    capture.capture(records[1]);
    capture.capture(record(3));

    const lines = await readGameLog(repository, capture);
    expect(lines).toEqual([
      JSON.stringify(records[0]),
      JSON.stringify(records[1]),
      JSON.stringify(record(3)),
    ]);
    expect(lines.map((line) => JSON.parse(line) as unknown)).toEqual([
      records[0],
      records[1],
      record(3),
    ]);
    expect(await repository.readLogLines(GAME_B)).toEqual([]);
  });

  it("receives logEvent entries and mirrored records exactly as the dev sink does", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    const posted: unknown[] = [];
    setLogContext({ gameId: GAME_A });
    setJourneyLogCapture(capture.capture);

    const entry = logEvent("fixture_logged", { cardId: "uuid-1" });
    const mirrored = { event: "game_event", seq: 7, gameId: GAME_A };
    createJourneyLogMirror({ log: () => undefined })(mirrored);
    createJourneyLogMirror({
      log: () => undefined,
      post: (value) => posted.push(value),
    })({ event: "not_captured", seq: 8 });
    setJourneyLogCapture(null);
    logEvent("after_detach");

    const lines = await readGameLog(repository, capture);
    expect(lines).toEqual([JSON.stringify(entry), JSON.stringify(mirrored)]);
    expect(JSON.parse(lines[0])).toMatchObject({
      event: "fixture_logged",
      gameId: GAME_A,
      cardId: "uuid-1",
      seq: entry.seq,
      timestamp: entry.timestamp,
    });
    expect(posted).toHaveLength(1);
  });

  it("evicts the least recently written games' logs first and keeps the capturing game's", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const clock = { now: 1 };
    await writeLog(captureAt(repository, GAME_A, UNCAPPED, clock), 4);
    clock.now = 2;
    await writeLog(captureAt(repository, GAME_B, UNCAPPED, clock), 4);
    const [a, b] = await repository.listLogs();
    expect([a.gameId, b.gameId]).toEqual([GAME_A, GAME_B]);

    // Room for two of the three logs: the oldest (A) goes.
    clock.now = 3;
    const cap = a.characters + b.characters + 1;
    await writeLog(captureAt(repository, GAME_C, cap, clock), 4);
    expect((await repository.listLogs()).map((log) => log.gameId)).toEqual([
      GAME_B,
      GAME_C,
    ]);
    expect(await repository.readLogLines(GAME_A)).toEqual([]);
    expect(await repository.readLogLines(GAME_B)).toHaveLength(4);

    // A log larger than the whole budget evicts every other log but is kept.
    clock.now = 4;
    const greedy = captureAt(repository, GAME_C, 1, clock);
    await writeLog(greedy, 1);
    expect((await repository.listLogs()).map((log) => log.gameId)).toEqual([
      GAME_C,
    ]);
    expect(await readGameLog(repository, greedy)).toHaveLength(5);
  });

  it("restarts an evicted game's log from its next captured record", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    await writeLog(capture, 3);
    await repository.deleteLogs([GAME_A]);
    expect(await repository.listLogs()).toEqual([]);

    capture.capture(record(9));
    expect(await readGameLog(repository, capture)).toEqual([
      JSON.stringify(record(9)),
    ]);
    expect((await repository.listLogs())[0].characters).toBe(
      JSON.stringify(record(9)).length + 1,
    );
  });

  it("retries a failed write in order with the next record and logs the failure", async () => {
    const store = createMemoryKeyValueStore();
    let failures = 1;
    const flaky: KeyValueStore = {
      ...store,
      putAll: (entries) => {
        if (failures > 0) {
          failures -= 1;
          return Promise.reject(new Error("quota exceeded"));
        }
        return store.putAll(entries);
      },
    };
    const repository = createGameRepository(flaky);
    const capture = captureAt(repository, GAME_A, UNCAPPED, { now: 1 });
    setJourneyLogCapture(capture.capture);

    capture.capture(record(1));
    await capture.flush();
    expect(failures).toBe(0);
    expect(await repository.readLogLines(GAME_A)).toEqual([]);
    capture.capture(record(2));

    const lines = await readGameLog(repository, capture);
    const events = lines.map(
      (line) => (JSON.parse(line) as { event: string }).event,
    );
    expect(events).toEqual([
      "fixture_event",
      "game_log_persist_failed",
      "fixture_event",
    ]);
  });
});

describe("gameLogsToEvict", () => {
  const log = (gameId: GameId, characters: number, updatedAt: number) => ({
    gameId,
    characters,
    updatedAt,
  });

  it("evicts nothing within the budget", () => {
    expect(
      gameLogsToEvict([log(GAME_A, 5, 1), log(GAME_B, 5, 2)], GAME_B, 10),
    ).toEqual([]);
  });

  it("evicts oldest first, skipping the kept game, until the rest fit", () => {
    expect(
      gameLogsToEvict(
        [log(GAME_C, 5, 3), log(GAME_A, 5, 1), log(GAME_B, 5, 2)],
        GAME_A,
        10,
      ),
    ).toEqual([GAME_B]);
  });
});
