// Journey-log trim contracts of the game repository: a trim keeps the newest
// lines that fit, across chunk boundaries, keeps the log's size and later
// appends consistent with the kept lines, and writes nothing on a failed or
// unneeded trim. Runs on the in-memory store behind the `KeyValueStore`
// interface.

import { describe, expect, it } from "vitest";
import { parseGameId } from "../types/identifiers";
import { createGameRepository } from "./game-repository";
import {
  createMemoryKeyValueStore,
  type KeyValueStore,
} from "./key-value-store";

const GAME = parseGameId("trim01");
const OTHER = parseGameId("trim02");
/** Stored size of each one-character fixture line and its newline. */
const LINE = 2;

/** A store that counts, and can reject, its write calls. */
function writeCountingStore(): {
  store: KeyValueStore;
  writes: () => number;
  failWrites: () => void;
} {
  const inner = createMemoryKeyValueStore();
  let writes = 0;
  let failing = false;
  const write = <T>(run: () => Promise<T>): Promise<T> => {
    writes += 1;
    return failing ? Promise.reject(new Error("aborted")) : run();
  };
  return {
    store: {
      ...inner,
      putAll: (entries) => write(() => inner.putAll(entries)),
      deleteRanges: (ranges) => write(() => inner.deleteRanges(ranges)),
      replaceRanges: (ranges, entries) =>
        write(() => inner.replaceRanges(ranges, entries)),
    },
    writes: () => writes,
    failWrites: () => {
      failing = true;
    },
  };
}

describe("trimLogLines", () => {
  it("keeps the newest lines that fit, across chunks, and later appends follow them", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    await repository.appendLogLines(GAME, ["a", "b"], 1);
    await repository.appendLogLines(GAME, ["c", "d", "e"], 2);
    await repository.appendLogLines(GAME, ["f"], 3);
    await repository.appendLogLines(OTHER, ["x"], 4);

    expect(await repository.trimLogLines(GAME, 3 * LINE + 1)).toEqual({
      log: { gameId: GAME, characters: 3 * LINE, updatedAt: 3 },
      droppedLines: 3,
      droppedCharacters: 3 * LINE,
    });
    expect(await repository.readLogLines(GAME)).toEqual(["d", "e", "f"]);
    expect(await repository.readLogLines(OTHER)).toEqual(["x"]);
    expect(await repository.listLogs()).toEqual([
      { gameId: GAME, characters: 3 * LINE, updatedAt: 3 },
      { gameId: OTHER, characters: LINE, updatedAt: 4 },
    ]);

    await repository.appendLogLines(GAME, ["g"], 5);
    expect(await repository.readLogLines(GAME)).toEqual(["d", "e", "f", "g"]);
    expect((await repository.listLogs())[1]).toEqual({
      gameId: GAME,
      characters: 4 * LINE,
      updatedAt: 5,
    });
  });

  it("drops every line when none fits, and the log restarts from the next append", async () => {
    const repository = createGameRepository(createMemoryKeyValueStore());
    await repository.appendLogLines(GAME, ["a", "b"], 1);

    const trim = await repository.trimLogLines(GAME, LINE - 1);
    expect(trim?.droppedLines).toBe(2);
    expect(await repository.readLogLines(GAME)).toEqual([]);
    expect((await repository.listLogs())[0].characters).toBe(0);

    await repository.appendLogLines(GAME, ["c"], 2);
    expect(await repository.readLogLines(GAME)).toEqual(["c"]);
  });

  it("writes nothing for a log that already fits or does not exist", async () => {
    const { store, writes } = writeCountingStore();
    const repository = createGameRepository(store);
    await repository.appendLogLines(GAME, ["a", "b"], 1);
    const before = writes();

    expect(await repository.trimLogLines(GAME, 2 * LINE)).toEqual({
      log: { gameId: GAME, characters: 2 * LINE, updatedAt: 1 },
      droppedLines: 0,
      droppedCharacters: 0,
    });
    expect(await repository.trimLogLines(OTHER, 0)).toBeNull();
    expect(writes()).toBe(before);
    expect(await repository.readLogLines(GAME)).toEqual(["a", "b"]);
  });

  it("leaves the log whole when its write fails", async () => {
    const { store, failWrites } = writeCountingStore();
    const repository = createGameRepository(store);
    await repository.appendLogLines(GAME, ["a", "b"], 1);
    await repository.appendLogLines(GAME, ["c"], 2);
    failWrites();

    await expect(repository.trimLogLines(GAME, LINE)).rejects.toThrow();
    expect(await repository.readLogLines(GAME)).toEqual(["a", "b", "c"]);
    expect(await repository.listLogs()).toEqual([
      { gameId: GAME, characters: 3 * LINE, updatedAt: 2 },
    ]);
  });
});
